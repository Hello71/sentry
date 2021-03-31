import React from 'react';
import {css} from '@emotion/core';
import styled from '@emotion/styled';
import omit from 'lodash/omit';
import PropTypes from 'prop-types';

import {fetchOrgMembers} from 'app/actionCreators/members';
import {Client} from 'app/api';
import AssigneeSelector from 'app/components/assigneeSelector';
import GuideAnchor from 'app/components/assistant/guideAnchor';
import Badge from 'app/components/badge';
import Count from 'app/components/count';
import EventOrGroupTitle from 'app/components/eventOrGroupTitle';
import ErrorLevel from 'app/components/events/errorLevel';
import EventAnnotation from 'app/components/events/eventAnnotation';
import EventMessage from 'app/components/events/eventMessage';
import InboxReason from 'app/components/group/inboxBadges/inboxReason';
import UnhandledInboxTag from 'app/components/group/inboxBadges/unhandledTag';
import ProjectBadge from 'app/components/idBadge/projectBadge';
import ExternalLink from 'app/components/links/externalLink';
import Link from 'app/components/links/link';
import ListLink from 'app/components/links/listLink';
import NavTabs from 'app/components/navTabs';
import SeenByList from 'app/components/seenByList';
import ShortId from 'app/components/shortId';
import Tooltip from 'app/components/tooltip';
import {IconChat} from 'app/icons';
import {t} from 'app/locale';
import SentryTypes from 'app/sentryTypes';
import space from 'app/styles/space';
import {Group, Project} from 'app/types';
import {Event} from 'app/types/event';
import {getMessage} from 'app/utils/events';
import withApi from 'app/utils/withApi';

import GroupActions from './actions';
import UnhandledTag, {TagAndMessageWrapper} from './unhandledTag';
import {ReprocessingStatus} from './utils';

const TAB = {
  DETAILS: 'details',
  ACTIVITY: 'activity',
  USER_FEEDBACK: 'user-feedback',
  ATTACHMENTS: 'attachments',
  TAGS: 'tags',
  EVENTS: 'events',
  MERGED: 'merged',
  SIMILAR_ISSUES: 'similar-issues',
};

type Props = {
  currentTab: string;
  baseUrl: string;
  group: Group;
  groupReprocessingStatus: ReprocessingStatus;
  project: Project;
  api: Client;
  event?: Event;
};

type MemberList = NonNullable<
  React.ComponentProps<typeof AssigneeSelector>['memberList']
>;

type State = {
  memberList?: MemberList;
};

class GroupHeader extends React.Component<Props, State> {
  static contextTypes = {
    location: PropTypes.object,
    organization: SentryTypes.Organization,
  };

  state: State = {};

  componentDidMount() {
    const {organization} = this.context;
    const {group, api} = this.props;
    const {project} = group;

    fetchOrgMembers(api, organization.slug, [project.id]).then(memberList => {
      const users = memberList.map(member => member.user);
      this.setState({memberList: users});
    });
  }

  getDisabledTabs() {
    const {organization} = this.context;

    const hasReprocessingV2Feature = organization.features.includes('reprocessing-v2');

    if (!hasReprocessingV2Feature) {
      return [];
    }

    const {groupReprocessingStatus} = this.props;

    if (groupReprocessingStatus === ReprocessingStatus.REPROCESSING) {
      return [
        TAB.ACTIVITY,
        TAB.USER_FEEDBACK,
        TAB.ATTACHMENTS,
        TAB.EVENTS,
        TAB.MERGED,
        TAB.SIMILAR_ISSUES,
        TAB.TAGS,
      ];
    }

    if (groupReprocessingStatus === ReprocessingStatus.REPROCESSED_AND_HASNT_EVENT) {
      return [
        TAB.DETAILS,
        TAB.ATTACHMENTS,
        TAB.EVENTS,
        TAB.MERGED,
        TAB.SIMILAR_ISSUES,
        TAB.TAGS,
        TAB.USER_FEEDBACK,
      ];
    }

    return [];
  }

  render() {
    const {project, group, currentTab, baseUrl, event} = this.props;
    const {organization, location} = this.context;
    const projectFeatures = new Set(project ? project.features : []);
    const organizationFeatures = new Set(organization ? organization.features : []);
    const userCount = group.userCount;

    const hasSimilarView = projectFeatures.has('similarity-view');
    const hasEventAttachments = organizationFeatures.has('event-attachments');

    let className = 'group-detail';

    if (group.isBookmarked) {
      className += ' isBookmarked';
    }

    if (group.hasSeen) {
      className += ' hasSeen';
    }

    if (group.status === 'resolved') {
      className += ' isResolved';
    }

    const {memberList} = this.state;
    const orgId = organization.slug;
    const message = getMessage(group);
    const hasInbox = organization.features?.includes('inbox');

    const searchTermWithoutQuery = omit(location.query, 'query');
    const eventRouteToObject = {
      pathname: `${baseUrl}events/`,
      query: searchTermWithoutQuery,
    };

    const disabledTabs = this.getDisabledTabs();
    const disableActions = !!disabledTabs.length;

    return (
      <div className={className}>
        <div className="row">
          <div className="col-sm-7">
            <TitleWrapper>
              <h3>
                <EventOrGroupTitle hasGuideAnchor data={group} />
              </h3>
              {hasInbox && group.inbox && (
                <InboxReasonWrapper>
                  <InboxReason inbox={group.inbox} fontSize="md" />
                </InboxReasonWrapper>
              )}
            </TitleWrapper>
            <StyledTagAndMessageWrapper>
              {hasInbox && group.level && <ErrorLevel level={group.level} size="11px" />}
              {group.isUnhandled && (hasInbox ? <UnhandledInboxTag /> : <UnhandledTag />)}
              <EventMessage
                message={message}
                level={hasInbox ? undefined : group.level}
                annotations={
                  <React.Fragment>
                    {group.logger && (
                      <EventAnnotationWithSpace>
                        <Link
                          to={{
                            pathname: `/organizations/${orgId}/issues/`,
                            query: {query: 'logger:' + group.logger},
                          }}
                        >
                          {group.logger}
                        </Link>
                      </EventAnnotationWithSpace>
                    )}
                    {group.annotations.map((annotation, i) => (
                      <EventAnnotationWithSpace
                        key={i}
                        dangerouslySetInnerHTML={{__html: annotation}}
                      />
                    ))}
                  </React.Fragment>
                }
              />
            </StyledTagAndMessageWrapper>
          </div>

          <div className="col-sm-5 stats">
            <div className="flex flex-justify-right">
              {group.shortId && (
                <GuideAnchor target="issue_number" position="bottom">
                  <div className="short-id-box count align-right">
                    <h6 className="nav-header">
                      <Tooltip
                        className="help-link"
                        title={t(
                          'This identifier is unique across your organization, and can be used to reference an issue in various places, like commit messages.'
                        )}
                        position="bottom"
                      >
                        <ExternalLink href="https://docs.sentry.io/product/integrations/github/#resolve-via-commit-or-pull-request">
                          {t('Issue #')}
                        </ExternalLink>
                      </Tooltip>
                    </h6>
                    <ShortId
                      shortId={group.shortId}
                      avatar={
                        <StyledProjectBadge project={project} avatarSize={20} hideName />
                      }
                    />
                  </div>
                </GuideAnchor>
              )}
              <div className="count align-right m-l-1">
                <h6 className="nav-header">{t('Events')}</h6>
                {disableActions ? (
                  <Count className="count" value={group.count} />
                ) : (
                  <Link to={eventRouteToObject}>
                    <Count className="count" value={group.count} />
                  </Link>
                )}
              </div>
              <div className="count align-right m-l-1">
                <h6 className="nav-header">{t('Users')}</h6>
                {userCount !== 0 ? (
                  disableActions ? (
                    <Count className="count" value={userCount} />
                  ) : (
                    <Link to={`${baseUrl}tags/user/${location.search}`}>
                      <Count className="count" value={userCount} />
                    </Link>
                  )
                ) : (
                  <span>0</span>
                )}
              </div>
              <div className="assigned-to m-l-1">
                <h6 className="nav-header">{t('Assignee')}</h6>
                <AssigneeSelector
                  id={group.id}
                  memberList={memberList}
                  disabled={disableActions}
                />
              </div>
            </div>
          </div>
        </div>
        <SeenByList
          seenBy={group.seenBy}
          iconTooltip={t('People who have viewed this issue')}
        />
        <GroupActions
          group={group}
          project={project}
          disabled={disableActions}
          event={event}
        />
        <NavTabs>
          <ListLink
            to={`${baseUrl}${location.search}`}
            isActive={() => currentTab === TAB.DETAILS}
            disabled={disabledTabs.includes(TAB.DETAILS)}
          >
            {t('Details')}
          </ListLink>
          <StyledListLink
            to={`${baseUrl}activity/${location.search}`}
            isActive={() => currentTab === TAB.ACTIVITY}
            disabled={disabledTabs.includes(TAB.ACTIVITY)}
          >
            {t('Activity')}

            <Badge
              css={css`
                padding: 0 ${space(1)};
              `}
            >
              <TabCount>{group.numComments}</TabCount>
              <IconChat size="xs" color="white" />
            </Badge>
          </StyledListLink>
          <StyledListLink
            to={`${baseUrl}feedback/${location.search}`}
            isActive={() => currentTab === TAB.USER_FEEDBACK}
            disabled={disabledTabs.includes(TAB.USER_FEEDBACK)}
          >
            {t('User Feedback')} <Badge text={group.userReportCount} />
          </StyledListLink>
          {hasEventAttachments && (
            <ListLink
              to={`${baseUrl}attachments/${location.search}`}
              isActive={() => currentTab === TAB.ATTACHMENTS}
              disabled={disabledTabs.includes(TAB.ATTACHMENTS)}
            >
              {t('Attachments')}
            </ListLink>
          )}
          <ListLink
            to={`${baseUrl}tags/${location.search}`}
            isActive={() => currentTab === TAB.TAGS}
            disabled={disabledTabs.includes(TAB.TAGS)}
          >
            {t('Tags')}
          </ListLink>
          <ListLink
            to={eventRouteToObject}
            isActive={() => currentTab === TAB.EVENTS}
            disabled={disabledTabs.includes(TAB.EVENTS)}
          >
            {t('Events')}
          </ListLink>
          <ListLink
            to={`${baseUrl}merged/${location.search}`}
            isActive={() => currentTab === TAB.MERGED}
            disabled={disabledTabs.includes(TAB.MERGED)}
          >
            {t('Merged Issues')}
          </ListLink>
          {hasSimilarView && (
            <ListLink
              to={`${baseUrl}similar/${location.search}`}
              isActive={() => currentTab === TAB.SIMILAR_ISSUES}
              disabled={disabledTabs.includes(TAB.SIMILAR_ISSUES)}
            >
              {t('Similar Issues')}
            </ListLink>
          )}
        </NavTabs>
      </div>
    );
  }
}

export {GroupHeader, TAB};

export default withApi(GroupHeader);

const TitleWrapper = styled('div')`
  display: flex;
  line-height: 24px;
`;

const InboxReasonWrapper = styled('div')`
  margin-left: ${space(1)};
`;

const StyledTagAndMessageWrapper = styled(TagAndMessageWrapper)`
  display: grid;
  grid-auto-flow: column;
  gap: ${space(1)};
  justify-content: flex-start;
  line-height: 1.2;

  @media (max-width: ${p => p.theme.breakpoints[0]}) {
    margin-bottom: ${space(2)};
  }
`;

const StyledListLink = styled(ListLink)`
  svg {
    margin-left: ${space(0.5)};
    margin-bottom: ${space(0.25)};
    vertical-align: middle;
  }
`;

const TabCount = styled('span')`
  color: ${p => p.theme.white};
  font-weight: 600;
`;

const StyledProjectBadge = styled(ProjectBadge)`
  flex-shrink: 0;
`;

const EventAnnotationWithSpace = styled(EventAnnotation)`
  margin-left: ${space(1)};
`;
