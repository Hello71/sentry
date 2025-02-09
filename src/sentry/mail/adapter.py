import itertools
import logging
from enum import Enum
from typing import Set

from django.utils import dateformat
from django.utils.encoding import force_text
from django.utils.safestring import mark_safe

from sentry import digests, options
from sentry.digests import get_option_key as get_digest_option_key
from sentry.digests.notifications import event_to_record, unsplit_key
from sentry.digests.utilities import get_digest_metadata, get_personalized_digests
from sentry.models import (
    Commit,
    Group,
    GroupSubscription,
    GroupSubscriptionReason,
    Integration,
    NotificationSetting,
    Project,
    ProjectOption,
    ProjectOwnership,
    Release,
    Team,
    User,
)
from sentry.models.integration import ExternalProviders
from sentry.notifications.helpers import transform_to_notification_settings_by_user
from sentry.notifications.types import (
    NotificationScopeType,
    NotificationSettingOptionValues,
    NotificationSettingTypes,
)
from sentry.plugins.base import plugins
from sentry.plugins.base.structs import Notification
from sentry.tasks.digests import deliver_digest
from sentry.utils import json, metrics
from sentry.utils.cache import cache
from sentry.utils.committers import get_serialized_event_file_committers
from sentry.utils.email import MessageBuilder, group_id_to_email
from sentry.utils.http import absolute_uri
from sentry.utils.linksign import generate_signed_link

logger = logging.getLogger(__name__)


class ActionTargetType(Enum):
    ISSUE_OWNERS = "IssueOwners"
    TEAM = "Team"
    MEMBER = "Member"


class MailAdapter:
    """
    This class contains generic logic for notifying users via Email.
    """

    mail_option_key = "mail:subject_prefix"

    def rule_notify(self, event, futures, target_type, target_identifier=None):
        metrics.incr("mail_adapter.rule_notify")
        rules = []
        extra = {
            "event_id": event.event_id,
            "group_id": event.group_id,
            "is_from_mail_action_adapter": True,
            "target_type": target_type.value,
            "target_identifier": target_identifier,
        }
        log_event = "dispatched"
        for future in futures:
            rules.append(future.rule)
            extra["rule_id"] = future.rule.id
            if not future.kwargs:
                continue
            raise NotImplementedError(
                "The default behavior for notification de-duplication does not support args"
            )

        project = event.group.project
        extra["project_id"] = project.id
        if digests.enabled(project):

            def get_digest_option(key):
                return ProjectOption.objects.get_value(project, get_digest_option_key("mail", key))

            digest_key = unsplit_key(event.group.project, target_type, target_identifier)
            extra["digest_key"] = digest_key
            immediate_delivery = digests.add(
                digest_key,
                event_to_record(event, rules),
                increment_delay=get_digest_option("increment_delay"),
                maximum_delay=get_digest_option("maximum_delay"),
            )
            if immediate_delivery:
                deliver_digest.delay(digest_key)
            else:
                log_event = "digested"

        else:
            notification = Notification(event=event, rules=rules)
            self.notify(notification, target_type, target_identifier)

        logger.info("mail.adapter.notification.%s" % log_event, extra=extra)

    def _build_subject_prefix(self, project):
        subject_prefix = ProjectOption.objects.get_value(project, self.mail_option_key, None)
        if not subject_prefix:
            subject_prefix = options.get("mail.subject-prefix")
        return force_text(subject_prefix)

    def _build_message(
        self,
        project,
        subject,
        template=None,
        html_template=None,
        body=None,
        reference=None,
        reply_reference=None,
        headers=None,
        context=None,
        send_to=None,
        type=None,
    ):
        if not send_to:
            logger.debug("Skipping message rendering, no users to send to.")
            return

        subject_prefix = self._build_subject_prefix(project)
        subject = force_text(subject)

        msg = MessageBuilder(
            subject=f"{subject_prefix}{subject}",
            template=template,
            html_template=html_template,
            body=body,
            headers=headers,
            type=type,
            context=context,
            reference=reference,
            reply_reference=reply_reference,
        )
        msg.add_users(send_to, project=project)
        return msg

    def _send_mail(self, *args, **kwargs):
        message = self._build_message(*args, **kwargs)
        if message is not None:
            return message.send_async()

    @staticmethod
    def get_sendable_user_objects(project):
        """
        Return a collection of USERS that are eligible to receive
        notifications for the provided project.
        """
        return NotificationSetting.objects.get_notification_recipients(
            ExternalProviders.EMAIL, project
        )

    def get_sendable_user_ids(self, project):
        users = self.get_sendable_user_objects(project)
        return [user.id for user in users]

    def get_sendable_users(self, project):
        """ @deprecated Do not change this function, it is being used in getsentry. """
        users = self.get_sendable_user_objects(project)
        return [user.id for user in users]

    def should_notify(self, target_type, group):
        metrics.incr("mail_adapter.should_notify")
        # only notify if we have users to notify. We always want to notify if targeting
        # a member directly.
        return target_type == ActionTargetType.MEMBER or self.get_sendable_user_objects(
            group.project
        )

    def get_send_to(self, project, target_type, target_identifier=None, event=None):
        """
        Returns a list of user IDs for the users that should receive
        notifications for the provided project.
        This result may come from cached data.
        """
        if not (project and project.teams.exists()):
            logger.debug("Tried to send notification to invalid project: %r", project)
            return set()

        send_to = []
        if target_type == ActionTargetType.ISSUE_OWNERS:
            if not event:
                send_to = self.get_send_to_all_in_project(project)
            else:
                send_to = self.get_send_to_owners(event, project)
        elif target_type == ActionTargetType.MEMBER:
            send_to = self.get_send_to_member(project, target_identifier)
        elif target_type == ActionTargetType.TEAM:
            send_to = self.get_send_to_team(project, target_identifier)
        return set(send_to)

    def get_send_to_owners(self, event, project):
        owners, _ = ProjectOwnership.get_owners(project.id, event.data)
        if owners != ProjectOwnership.Everyone:
            if not owners:
                metrics.incr(
                    "features.owners.send_to",
                    tags={"organization": project.organization_id, "outcome": "empty"},
                    skip_internal=True,
                )
                return set()

            metrics.incr(
                "features.owners.send_to",
                tags={"organization": project.organization_id, "outcome": "match"},
                skip_internal=True,
            )
            send_to = set()
            teams_to_resolve = set()
            for owner in owners:
                if owner.type == User:
                    send_to.add(owner.id)
                else:
                    teams_to_resolve.add(owner.id)

            # get all users in teams
            if teams_to_resolve:
                send_to |= set(
                    User.objects.filter(
                        is_active=True,
                        sentry_orgmember_set__organizationmemberteam__team__id__in=teams_to_resolve,
                    ).values_list("id", flat=True)
                )

            return send_to - self.disabled_users_from_project(project)
        else:
            metrics.incr(
                "features.owners.send_to",
                tags={"organization": project.organization_id, "outcome": "everyone"},
                skip_internal=True,
            )
            return self.get_send_to_all_in_project(project)

    @staticmethod
    def disabled_users_from_project(project: Project) -> Set[int]:
        """ Get a set of users that have disabled Issue Alert notifications for a given project. """
        user_ids = project.member_set.values_list("user", flat=True)
        users = User.objects.filter(id__in=user_ids)
        notification_settings = NotificationSetting.objects.get_for_users_by_parent(
            provider=ExternalProviders.EMAIL,
            type=NotificationSettingTypes.ISSUE_ALERTS,
            parent=project,
            users=users,
        )
        notification_settings_by_user = transform_to_notification_settings_by_user(
            notification_settings, users
        )

        # Although this can be done with dict comprehension, looping for clarity.
        output = set()
        for user in users:
            settings = notification_settings_by_user.get(user)
            if settings:
                setting = settings.get(NotificationScopeType.PROJECT)
                if setting == NotificationSettingOptionValues.NEVER:
                    output.add(user.id)
        return output

    def get_send_to_team(self, project, target_identifier):
        if target_identifier is None:
            return []
        try:
            team = Team.objects.get(id=int(target_identifier), projectteam__project=project)
        except Team.DoesNotExist:
            return set()
        return set(
            team.member_set.values_list("user_id", flat=True)
        ) - self.disabled_users_from_project(project)

    def get_send_to_member(self, project, target_identifier):
        """
        No checking for disabled users is done. If a user explicitly specifies a member
        as a target to send to, it should overwrite the user's personal mail settings.
        :param target_identifier:
        :return: Iterable[int] id of member that should be sent to.
        """
        if target_identifier is None:
            return []
        try:
            user = (
                User.objects.filter(
                    id=int(target_identifier),
                    sentry_orgmember_set__teams__projectteam__project=project,
                )
                .distinct()
                .get()
            )
        except User.DoesNotExist:
            return set()
        return {user.id}

    def get_send_to_all_in_project(self, project):
        cache_key = f"mail:send_to:{project.pk}"
        send_to_list = cache.get(cache_key)
        if send_to_list is None:
            users = self.get_sendable_user_objects(project)
            send_to_list = [user.id for user in users if user]
            cache.set(cache_key, send_to_list, 60)  # 1 minute cache

        return send_to_list

    def add_unsubscribe_link(self, context, user_id, project, referrer):
        context["unsubscribe_link"] = generate_signed_link(
            user_id,
            "sentry-account-email-unsubscribe-project",
            referrer,
            kwargs={"project_id": project.id},
        )

    def notify(self, notification, target_type, target_identifier=None, **kwargs):
        metrics.incr("mail_adapter.notify")
        event = notification.event
        environment = event.get_tag("environment")
        group = event.group
        project = group.project
        org = group.organization
        logger.info(
            "mail.adapter.notify",
            extra={
                "target_type": target_type.value,
                "target_identifier": target_identifier,
                "group": group.id,
                "project_id": project.id,
            },
        )

        subject = event.get_email_subject()

        query_params = {"referrer": "alert_email"}
        if environment:
            query_params["environment"] = environment
        link = group.get_absolute_url(params=query_params)

        template = "sentry/emails/error.txt"
        html_template = "sentry/emails/error.html"

        rules = []
        for rule in notification.rules:
            rule_link = f"/organizations/{org.slug}/alerts/rules/{project.slug}/{rule.id}/"

            rules.append((rule.label, rule_link))

        enhanced_privacy = org.flags.enhanced_privacy

        # lets identify possibly suspect commits and owners
        commits = {}
        try:
            committers = get_serialized_event_file_committers(project, event)
        except (Commit.DoesNotExist, Release.DoesNotExist):
            pass
        except Exception as exc:
            logging.exception(str(exc))
        else:
            for committer in committers:
                for commit in committer["commits"]:
                    if commit["id"] not in commits:
                        commit_data = commit.copy()
                        commit_data["shortId"] = commit_data["id"][:7]
                        commit_data["author"] = committer["author"]
                        commit_data["subject"] = commit_data["message"].split("\n", 1)[0]
                        commits[commit["id"]] = commit_data

        project_plugins = plugins.for_project(project, version=1)
        organization_integrations = Integration.objects.filter(organizations=org).first()
        has_integrations = bool(project_plugins or organization_integrations)

        context = {
            "project_label": project.get_full_name(),
            "group": group,
            "event": event,
            "link": link,
            "rules": rules,
            "has_integrations": has_integrations,
            "enhanced_privacy": enhanced_privacy,
            "commits": sorted(commits.values(), key=lambda x: x["score"], reverse=True),
            "environment": environment,
        }

        # if the organization has enabled enhanced privacy controls we dont send
        # data which may show PII or source code
        if not enhanced_privacy:
            interface_list = []
            for interface in event.interfaces.values():
                body = interface.to_email_html(event)
                if not body:
                    continue
                text_body = interface.to_string(event)
                interface_list.append((interface.get_title(), mark_safe(body), text_body))

            context.update({"tags": event.tags, "interfaces": interface_list})

        headers = {
            "X-Sentry-Logger": group.logger,
            "X-Sentry-Logger-Level": group.get_level_display(),
            "X-Sentry-Project": project.slug,
            "X-Sentry-Reply-To": group_id_to_email(group.id),
            "X-SMTPAPI": json.dumps({"category": "issue_alert_email"}),
        }

        for user_id in self.get_send_to(
            project=project,
            target_type=target_type,
            target_identifier=target_identifier,
            event=event,
        ):
            logger.info(
                "mail.adapter.notify.mail_user",
                extra={
                    "target_type": target_type,
                    "target_identifier": target_identifier,
                    "group": group.id,
                    "project_id": project.id,
                    "user_id": user_id,
                },
            )

            self.add_unsubscribe_link(context, user_id, project, "alert_email")
            self._send_mail(
                subject=subject,
                template=template,
                html_template=html_template,
                project=project,
                reference=group,
                headers=headers,
                type="notify.error",
                context=context,
                send_to=[user_id],
            )

    def get_digest_subject(self, group, counts, date):
        return "{short_id} - {count} new {noun} since {date}".format(
            short_id=group.qualified_short_id,
            count=len(counts),
            noun="alert" if len(counts) == 1 else "alerts",
            date=dateformat.format(date, "N j, Y, P e"),
        )

    def notify_digest(self, project, digest, target_type, target_identifier=None):
        metrics.incr("mail_adapter.notify_digest")
        user_ids = self.get_send_to(project, target_type, target_identifier)
        logger.info(
            "mail.adapter.notify_digest",
            extra={
                "project_id": project.id,
                "target_type": target_type.value,
                "target_identifier": target_identifier,
                "user_ids": user_ids,
            },
        )
        for user_id, digest in get_personalized_digests(target_type, project.id, digest, user_ids):
            start, end, counts = get_digest_metadata(digest)

            # If there is only one group in this digest (regardless of how many
            # rules it appears in), we should just render this using the single
            # notification template. If there is more than one record for a group,
            # just choose the most recent one.
            if len(counts) == 1:
                group = next(iter(counts))
                record = max(
                    itertools.chain.from_iterable(
                        groups.get(group, []) for groups in digest.values()
                    ),
                    key=lambda record: record.timestamp,
                )
                notification = Notification(record.value.event, rules=record.value.rules)
                return self.notify(notification, target_type, target_identifier)

            context = {
                "start": start,
                "end": end,
                "project": project,
                "digest": digest,
                "counts": counts,
            }

            headers = {
                "X-Sentry-Project": project.slug,
                "X-SMTPAPI": json.dumps({"category": "digest_email"}),
            }

            group = next(iter(counts))
            subject = self.get_digest_subject(group, counts, start)

            self.add_unsubscribe_link(context, user_id, project, "alert_digest")
            self._send_mail(
                subject=subject,
                template="sentry/emails/digests/body.txt",
                html_template="sentry/emails/digests/body.html",
                project=project,
                reference=project,
                headers=headers,
                type="notify.digest",
                context=context,
                send_to=[user_id],
            )

    def notify_about_activity(self, activity):
        metrics.incr("mail_adapter.notify_about_activity")
        # TODO: We should move these into the `mail` module.
        from sentry.mail.activity import emails

        email_cls = emails.get(activity.type)
        if not email_cls:
            logger.debug(f"No email associated with activity type `{activity.get_type_display()}`")
            return

        email = email_cls(activity)
        email.send()

    def handle_user_report(self, payload, project, **kwargs):
        metrics.incr("mail_adapter.handle_user_report")
        group = Group.objects.get(id=payload["report"]["issue"]["id"])

        participants = GroupSubscription.objects.get_participants(group=group)

        if not participants:
            return

        org = group.organization
        enhanced_privacy = org.flags.enhanced_privacy

        context = {
            "project": project,
            "project_link": absolute_uri(f"/{project.organization.slug}/{project.slug}/"),
            "issue_link": absolute_uri(
                "/{}/{}/issues/{}/".format(
                    project.organization.slug, project.slug, payload["report"]["issue"]["id"]
                )
            ),
            # TODO(dcramer): we dont have permalinks to feedback yet
            "link": absolute_uri(
                "/{}/{}/issues/{}/feedback/".format(
                    project.organization.slug, project.slug, payload["report"]["issue"]["id"]
                )
            ),
            "group": group,
            "report": payload["report"],
            "enhanced_privacy": enhanced_privacy,
        }

        subject_prefix = self._build_subject_prefix(project)
        subject = force_text(
            "{}{} - New Feedback from {}".format(
                subject_prefix, group.qualified_short_id, payload["report"]["name"]
            )
        )

        headers = {
            "X-Sentry-Project": project.slug,
            "X-SMTPAPI": json.dumps({"category": "user_report_email"}),
        }

        # TODO(dcramer): this is copypasta'd from activity notifications
        # and while it'd be nice to re-use all of that, they are currently
        # coupled to <Activity> instances which makes this tough
        for user, reason in participants.items():
            context.update(
                {
                    "reason": GroupSubscriptionReason.descriptions.get(
                        reason, "are subscribed to this issue"
                    ),
                    "unsubscribe_link": generate_signed_link(
                        user.id,
                        "sentry-account-email-unsubscribe-issue",
                        kwargs={"issue_id": group.id},
                    ),
                }
            )

            msg = MessageBuilder(
                subject=subject,
                template="sentry/emails/activity/new-user-feedback.txt",
                html_template="sentry/emails/activity/new-user-feedback.html",
                headers=headers,
                type="notify.user-report",
                context=context,
                reference=group,
            )
            msg.add_users([user.id], project=project)
            msg.send_async()

    def handle_signal(self, name, payload, **kwargs):
        metrics.incr("mail_adapter.handle_signal")
        if name == "user-reports.created":
            self.handle_user_report(payload, **kwargs)
