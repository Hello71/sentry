import React from 'react';

import {GuidesContent} from 'app/components/assistant/types';
import ExternalLink from 'app/components/links/externalLink';
import Link from 'app/components/links/link';
import {t, tct} from 'app/locale';
import ConfigStore from 'app/stores/configStore';

export default function getGuidesContent(orgSlug: string | null): GuidesContent {
  if (ConfigStore.get('demoMode')) {
    return getDemoModeGuides();
  }
  return [
    {
      guide: 'issue',
      requiredTargets: ['issue_title', 'exception'],
      steps: [
        {
          title: t("Let's Get This Over With"),
          target: 'issue_title',
          description: t(
            `No one likes a product tour. But stick with us, and you'll find it a
              whole lot easier to use Sentry's Issue details page.`
          ),
        },
        {
          title: t('Resolve Your Issues'),
          target: 'resolve',
          description: t(
            'So you fixed your problem? Congrats. Hit resolve to make it all go away.'
          ),
        },
        {
          title: t('Deal With It Later, Or Never'),
          target: 'ignore_delete_discard',
          description: t(
            `Just can't deal with this Issue right now? Ignore it. Saving it for later?
                Star it. Want it gone and out of your life forever?
                Delete that sh*t.`
          ),
        },
        {
          title: t('Identify Your Issues'),
          target: 'issue_number',
          description: tct(
            `You've got a lot of Issues. That's fine. Use the Issue number in your commit message,
                and we'll automatically resolve the Issue when your code is deployed. [link:Learn more]`,
            {link: <ExternalLink href="https://docs.sentry.io/product/releases/" />}
          ),
        },
        {
          title: t('Annoy the Right People'),
          target: 'owners',
          description: tct(
            `Notification overload makes it tempting to hurl your phone into the ocean.
                Define who is responsible for what, so alerts reach the right people and your
                devices stay on dry land. [link:Learn more]`,
            {
              link: (
                <ExternalLink href="https://docs.sentry.io/product/error-monitoring/issue-owners/" />
              ),
            }
          ),
        },
        {
          title: t('Find Information You Can Use'),
          target: 'tags',
          description: t(
            `So many bugs, so little time. When you've got bugs as far as the mouse can scroll,
                search and filter Events with tags or visualize Issues with a heat map.`
          ),
        },
        {
          title: t('Narrow Down Suspects'),
          target: 'exception',
          description: t(
            `We've got stack trace. See the exact sequence of function calls leading to the error
                in question, no detective skills necessary.`
          ),
        },
        {
          title: t('Retrace Your Steps'),
          target: 'breadcrumbs',
          description: t(
            `Not sure how you got here? Sentry automatically captures breadcrumbs for events in web
                frameworks to lead you straight to your error.`
          ),
        },
      ],
    },
    {
      guide: 'issue_stream',
      requiredTargets: ['issue_stream'],
      steps: [
        {
          title: t('Issues'),
          target: 'issue_stream',
          description: tct(
            `Sentry automatically groups similar events together into an issue. Similarity is
            determined by stack trace and other factors. [link:Learn more].`,
            {
              link: (
                <ExternalLink href="https://docs.sentry.io/platform-redirect/?next=/data-management/event-grouping/" />
              ),
            }
          ),
        },
      ],
    },
    {
      guide: 'inbox_guide',
      requiredTargets: ['inbox_guide_tab'],
      dateThreshold: new Date(2021, 1, 26),
      steps: [
        {
          target: 'inbox_guide_tab',
          description: t(`We’ve made some changes to help you focus on what’s new.`),
          dismissText: t(`Later`),
          nextText: t(`Take a Look`),
          hasNextGuide: true,
        },
      ],
    },
    {
      guide: 'for_review_guide',
      requiredTargets: ['for_review_guide_tab', 'inbox_guide_reason', 'is_inbox_tab'],
      steps: [
        {
          target: 'for_review_guide_tab',
          description: t(
            `This is a list of Unresolved issues that are new or reopened in the last 7 days.`
          ),
          cantDismiss: true,
        },
        {
          target: 'inbox_guide_reason',
          description: t(`These labels explain why an issue needs review.`),
          cantDismiss: true,
        },
        {
          target: 'inbox_guide_review',
          description: t(
            `Mark Reviewed removes the issue from this list and also removes the label.`
          ),
          nextText: t(`When does this end?`),
          cantDismiss: true,
        },
        {
          target: 'inbox_guide_ignore',
          description: t(`Resolving or ignoring an issue also marks it reviewed.`),
          nextText: t(`Seriously, there's more?`),
          cantDismiss: true,
        },
        {
          target: 'for_review_guide_tab',
          description: t(
            `Everything is automatically reviewed after seven days, preventing
            issues from piling up and you from losing your damn mind.`
          ),
          nextText: t(`Make It Stop Already`),
        },
      ],
    },
    {
      guide: 'assigned_or_suggested_guide',
      dateThreshold: new Date(2021, 4, 1),
      requiredTargets: ['assigned_or_suggested_query'],
      steps: [
        {
          target: 'assigned_or_suggested_query',
          description: tct(
            "Tip: use [assignedOrSuggested] to include search results based on your [ownership:ownership rules] and [committed:code you've committed].",
            {
              assignedOrSuggested: <code>assigned_or_suggested</code>,
              ownership: (
                <ExternalLink href="https://docs.sentry.io/product/error-monitoring/issue-owners/" />
              ),
              committed: (
                <ExternalLink href="https://docs.sentry.io/product/sentry-basics/guides/integrate-frontend/configure-scms/" />
              ),
            }
          ),
        },
      ],
    },
    {
      guide: 'alerts_write_owner',
      requiredTargets: ['alerts_write_owner'],
      steps: [
        {
          target: 'alerts_write_owner',
          description: tct(
            `Today only admins in your organization can create alert rules but we recommend [link:allowing members to create alerts], too.`,
            {
              link: <Link to={orgSlug ? `/settings/${orgSlug}` : `/settings`} />,
            }
          ),
          nextText: t(`Allow`),
          hasNextGuide: true,
        },
      ],
    },
    {
      guide: 'release_adoption',
      requiredTargets: ['release_adoption'],
      steps: [
        {
          title: t('Recalculating Adoption'),
          target: 'release_adoption',
          description: t(
            `Adoption now compares the sessions or users of a release with the total sessions or users for this project in the last 24 hours.`
          ),
        },
      ],
    },
    {
      guide: 'user_misery',
      requiredTargets: ['user_misery'],
      steps: [
        {
          title: t('User Misery'),
          target: 'user_misery',
          description: t(
            `Make users less miserable. Our User Misery Index now combines unique miserable users both by number and percentage. Plus, you can sort User Misery to identify your site’s most frustrating transactions.`
          ),
        },
      ],
    },
    {
      guide: 'stack_trace_preview',
      requiredTargets: ['issue_stream_title'],
      dateThreshold: new Date(2021, 2, 15),
      steps: [
        {
          title: t('Stack Trace Preview'),
          target: 'issue_stream_title',
          description: t(
            `Hover over the issue title to see the stack trace of the latest event.`
          ),
        },
      ],
    },
  ];
}

function getDemoModeGuides(): GuidesContent {
  return [
    {
      guide: 'sidebar',
      requiredTargets: ['projects', 'issues'],
      priority: 1, //lower number means higher priority
      markOthersAsSeen: true,
      steps: [
        {
          title: t('Projects'),
          target: 'projects',
          description: t(
            `Create a project for any type of application you want to monitor.`
          ),
        },
        {
          title: t('Issues'),
          target: 'issues',
          description: t(
            `Here's a list of what's broken with your applicaiton. And everything you need to know to fix it.`
          ),
        },
        {
          title: t('Performance'),
          target: 'performance',
          description: t(
            `See slow faster. Trace slow-loading pages back to its API call as well as surface all related errors.`
          ),
        },
        {
          title: t('Releases'),
          target: 'releases',
          description: t(
            `Track the health of every release, see differences between releases from crash analytics to adoption rates.`
          ),
        },
        {
          title: t('Discover'),
          target: 'discover',
          description: t(
            `Query and unlock insights into the health of your entire system and get answers to critical business questions all in one place.`
          ),
          nextText: t(`Got it`),
        },
      ],
    },
    {
      guide: 'issue_stream_v2',
      requiredTargets: ['issue_stream_title'],
      steps: [
        {
          title: t('Issue'),
          target: 'issue_stream_title',
          description: t(
            `Click here to get a full error report down to the line of code that caused the error.`
          ),
        },
      ],
    },
    {
      guide: 'issue_v2',
      requiredTargets: ['issue_details', 'exception'],
      steps: [
        {
          title: t('Details'),
          target: 'issue_details',
          description: t(`See the who, what, and where of every error right at the top`),
        },
        {
          title: t('Exception'),
          target: 'exception',
          description: t(
            `Source code right in the stack trace, so you don’t need to find it yourself.`
          ),
        },
        {
          title: t('Tags'),
          target: 'tags',
          description: t(
            `Tags help you quickly access related events and view the tag distribution for a set of events.`
          ),
        },
        {
          title: t('Breadcrumbs'),
          target: 'breadcrumbs',
          description: t(
            `Check out the play by play of what your user experienced till they encountered the exception.`
          ),
        },
        {
          title: t('Discover'),
          target: 'open_in_discover',
          description: t(
            `Uncover trends with Discover — analyze errors by URL, geography, device, browser, etc.`
          ),
        },
      ],
    },
    {
      guide: 'releases',
      requiredTargets: ['release_version'],
      steps: [
        {
          title: t('Release'),
          target: 'release_version',
          description: t(
            `Click here to easily identify new issues, regressions, and track the health every release.`
          ),
        },
      ],
    },
    {
      guide: 'release_details',
      requiredTargets: ['release_chart'],
      steps: [
        {
          title: t('Chart'),
          target: 'release_chart',
          description: t(
            `Click and drag to zoom in on a specific section of the histogram.`
          ),
        },
        {
          title: t('Discover'),
          target: 'release_issues_open_in_discover',
          description: t(`Aalyze these errors by URL, geography, device, browser, etc.`),
        },
        {
          title: t('Discover'),
          target: 'release_transactions_open_in_discover',
          description: t(
            `Analyze these performance issues by URL, geography, device, browser, etc.`
          ),
        },
      ],
    },
    {
      guide: 'discover_landing',
      requiredTargets: ['discover_landing_header'],
      steps: [
        {
          title: t('Discover'),
          target: 'discover_landing_header',
          description: t(
            `Click into any of the queries below to identify trends in event data.`
          ),
        },
      ],
    },
    {
      guide: 'discover_event_view',
      requiredTargets: ['create_alert_from_discover'],
      steps: [
        {
          title: t('Create Alert'),
          target: 'create_alert_from_discover',
          description: t(
            `Create an alert based on this query to get notified when an event exceeds user-defined thresholds.`
          ),
        },
        {
          title: t('Columns'),
          target: 'columns_header_button',
          description: t(
            `There's a whole lot more to... _discover_. View all the query conditions.`
          ),
        },
      ],
    },
    {
      guide: 'transaction_details',
      requiredTargets: ['span_tree'],
      steps: [
        {
          title: t('Span Tree'),
          target: 'span_tree',
          description: t(
            `Expand the spans to see span details from start date, end date to the operation.`
          ),
        },
        {
          title: t('Breadcrumbs'),
          target: 'breadcrumbs',
          description: t(
            `Check out the play by play of what your user experienced till they encountered the performance issue.`
          ),
        },
      ],
    },
  ];
}
