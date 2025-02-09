from sentry.models import OrganizationOnboardingTask, OnboardingTask, OnboardingTaskStatus
from sentry.testutils import APITestCase


class SkipOnboardingTaskTest(APITestCase):
    endpoint = "sentry-api-0-organization-onboardingtasks"
    method = "post"

    def setUp(self):
        super().setUp()
        self.login_as(self.user)

    def test_update_onboarding_task(self):
        data = {"task": "setup_issue_tracker", "status": "skipped"}
        self.get_success_response(self.organization.slug, status_code=204, **data)

        oot = OrganizationOnboardingTask.objects.get(
            organization=self.organization,
            task=OnboardingTask.ISSUE_TRACKER,
            status=OnboardingTaskStatus.SKIPPED,
        )

        assert oot
