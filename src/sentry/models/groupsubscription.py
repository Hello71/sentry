from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.utils import timezone
from typing import Any, Mapping

from sentry.db.models import (
    BaseManager,
    BoundedPositiveIntegerField,
    FlexibleForeignKey,
    Model,
    sane_repr,
)
from sentry.models.integration import ExternalProviders
from sentry.notifications.helpers import (
    should_be_participating,
    transform_to_notification_settings_by_user,
)
from sentry.notifications.types import NotificationSettingTypes


class GroupSubscriptionReason:
    implicit = -1  # not for use as a persisted field value
    committed = -2  # not for use as a persisted field value
    processing_issue = -3  # not for use as a persisted field value

    unknown = 0
    comment = 1
    assigned = 2
    bookmark = 3
    status_change = 4
    deploy_setting = 5
    mentioned = 6
    team_mentioned = 7

    descriptions = {
        implicit: "have opted to receive updates for all issues within "
        "projects that you are a member of",
        committed: "were involved in a commit that is part of this release",
        processing_issue: "are subscribed to alerts for this project",
        comment: "have commented on this issue",
        assigned: "have been assigned to this issue",
        bookmark: "have bookmarked this issue",
        status_change: "have changed the resolution status of this issue",
        deploy_setting: "opted to receive all deploy notifications for this organization",
        mentioned: "have been mentioned in this issue",
        team_mentioned: "are a member of a team mentioned in this issue",
    }


class GroupSubscriptionManager(BaseManager):
    def subscribe(self, group, user, reason=GroupSubscriptionReason.unknown):
        """
        Subscribe a user to an issue, but only if the user has not explicitly
        unsubscribed.
        """
        try:
            with transaction.atomic():
                self.create(
                    user=user, group=group, project=group.project, is_active=True, reason=reason
                )
        except IntegrityError:
            pass

    def subscribe_actor(self, group, actor, reason=GroupSubscriptionReason.unknown):
        from sentry.models import User, Team

        if isinstance(actor, User):
            return self.subscribe(group, actor, reason)
        if isinstance(actor, Team):
            # subscribe the members of the team
            team_users_ids = list(actor.member_set.values_list("user_id", flat=True))
            return self.bulk_subscribe(group, team_users_ids, reason)

        raise NotImplementedError("Unknown actor type: %r" % type(actor))

    def bulk_subscribe(self, group, user_ids, reason=GroupSubscriptionReason.unknown):
        """
        Subscribe a list of user ids to an issue, but only if the users are not explicitly
        unsubscribed.
        """
        user_ids = set(user_ids)

        # 5 retries for race conditions where
        # concurrent subscription attempts cause integrity errors
        for i in range(4, -1, -1):  # 4 3 2 1 0

            existing_subscriptions = set(
                GroupSubscription.objects.filter(
                    user_id__in=user_ids, group=group, project=group.project
                ).values_list("user_id", flat=True)
            )

            subscriptions = [
                GroupSubscription(
                    user_id=user_id,
                    group=group,
                    project=group.project,
                    is_active=True,
                    reason=reason,
                )
                for user_id in user_ids
                if user_id not in existing_subscriptions
            ]

            try:
                with transaction.atomic():
                    self.bulk_create(subscriptions)
                    return True
            except IntegrityError as e:
                if i == 0:
                    raise e

    def get_participants(self, group) -> Mapping[Any, GroupSubscriptionReason]:
        """
        Identify all users who are participating with a given issue.
        :param group: Group object
        """
        from sentry.models import NotificationSetting, User

        users = User.objects.get_from_group(group)
        user_ids = [user.id for user in users]
        subscriptions = self.filter(group=group, user_id__in=user_ids)
        notification_settings = NotificationSetting.objects.get_for_users_by_parent(
            ExternalProviders.EMAIL,
            NotificationSettingTypes.WORKFLOW,
            users=users,
            parent=group.project,
        )

        subscriptions_by_user_id = {
            subscription.user_id: subscription for subscription in subscriptions
        }
        notification_settings_by_user = transform_to_notification_settings_by_user(
            notification_settings, users
        )
        return {
            user: getattr(
                subscriptions_by_user_id.get(user.id),
                "reason",
                GroupSubscriptionReason.implicit,
            )
            for user in users
            if should_be_participating(
                user,
                subscriptions_by_user_id,
                notification_settings_by_user,
            )
        }


class GroupSubscription(Model):
    """
    Identifies a subscription relationship between a user and an issue.
    """

    __core__ = False

    project = FlexibleForeignKey("sentry.Project", related_name="subscription_set")
    group = FlexibleForeignKey("sentry.Group", related_name="subscription_set")
    # namespace related_name on User since we don't own the model
    user = FlexibleForeignKey(settings.AUTH_USER_MODEL)
    is_active = models.BooleanField(default=True)
    reason = BoundedPositiveIntegerField(default=GroupSubscriptionReason.unknown)
    date_added = models.DateTimeField(default=timezone.now, null=True)

    objects = GroupSubscriptionManager()

    class Meta:
        app_label = "sentry"
        db_table = "sentry_groupsubscription"
        unique_together = (("group", "user"),)

    __repr__ = sane_repr("project_id", "group_id", "user_id")
