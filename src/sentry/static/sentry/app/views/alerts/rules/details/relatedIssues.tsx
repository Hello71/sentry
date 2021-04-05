import React from 'react';
import styled from '@emotion/styled';

import Button from 'app/components/button';
import {SectionHeading} from 'app/components/charts/styles';
import EmptyStateWarning from 'app/components/emptyStateWarning';
import GroupList from 'app/components/issues/groupList';
import {Panel, PanelBody} from 'app/components/panels';
import Tooltip from 'app/components/tooltip';
import {IconInfo} from 'app/icons';
import {t} from 'app/locale';
import space from 'app/styles/space';
import {OrganizationSummary, Project} from 'app/types';
import {IncidentRule} from 'app/views/settings/incidentRules/types';
import {TimePeriodType} from 'app/views/alerts/rules/details/body';

type Props = {
  organization: OrganizationSummary;
  rule: IncidentRule;
  projects: Project[];
  filter: string;
  timePeriod: TimePeriodType;
};

class RelatedIssues extends React.Component<Props> {
  renderEmptyMessage = () => {
    return (
      <Panel>
        <PanelBody>
          <EmptyStateWarning small withIcon={false}>
            {t('No issues for this alert rule')}
          </EmptyStateWarning>
        </PanelBody>
      </Panel>
    );
  };

  render() {
    const {rule, projects, filter, organization, timePeriod} = this.props;
    const {start, end, label} = timePeriod;

    const path = `/organizations/${organization.slug}/issues/`;
    const queryParams = {
      start,
      end,
      groupStatsPeriod: 'auto',
      limit: 5,
      sort: rule.aggregate === 'count_unique(user)' ? 'user' : 'freq',
      query: `${rule.query} ${filter}`,
      project: projects.map(project => project.id),
    };
    const issueSearch = {
      pathname: `/organizations/${organization.slug}/issues/`,
      query: queryParams,
    };

    return (
      <React.Fragment>
        <ControlsWrapper>
          <SectionHeading>
            {t('Related Issues')}
            <Tooltip title={t('Top issues containing events matching the metric.')}>
              <IconInfo size="xs" />
            </Tooltip>
          </SectionHeading>
          <Button data-test-id="issues-open" size="small" to={issueSearch}>
            {t('Open in Issues')}
          </Button>
        </ControlsWrapper>

        <TableWrapper>
          <GroupList
            orgId={organization.slug}
            endpointPath={path}
            queryParams={queryParams}
            query={`start=${start}&end=${end}&groupStatsPeriod=auto`}
            canSelectGroups={false}
            renderEmptyMessage={this.renderEmptyMessage}
            withChart
            withPagination={false}
            useFilteredStats={true}
            statsPeriodSummary={label.toLowerCase()}
          />
        </TableWrapper>
      </React.Fragment>
    );
  }
}

const ControlsWrapper = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${space(1)};
`;

const TableWrapper = styled('div')`
  margin-bottom: ${space(4)};
  ${Panel} {
    /* smaller space between table and pagination */
    margin-bottom: -${space(1)};
  }
`;

export default RelatedIssues;
