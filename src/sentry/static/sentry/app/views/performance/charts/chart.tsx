import React from 'react';
import * as ReactRouter from 'react-router';
import max from 'lodash/max';
import min from 'lodash/min';

import AreaChart from 'app/components/charts/areaChart';
import ChartZoom from 'app/components/charts/chartZoom';
import {Series} from 'app/types/echarts';
import {axisLabelFormatter, tooltipFormatter} from 'app/utils/discover/charts';
import {aggregateOutputType} from 'app/utils/discover/fields';
import theme from 'app/utils/theme';

type Props = {
  data: Series[];
  router: ReactRouter.InjectedRouter;
  statsPeriod: string | undefined;
  utc: boolean;
  height?: number;
  grid?: AreaChart['props']['grid'];
  disableMultiAxis?: boolean;
  loading: boolean;
};

// adapted from https://stackoverflow.com/questions/11397239/rounding-up-for-a-graph-maximum
function computeAxisMax(data) {
  // assumes min is 0
  const valuesDict = data.map(value => value.data.map(point => point.value));
  const maxValue = max(valuesDict.map(max)) as number;

  if (maxValue <= 1) {
    return 1;
  }

  const power = Math.log10(maxValue);
  const magnitude = min([max([10 ** (power - Math.floor(power)), 0]), 10]) as number;

  let scale: number;
  if (magnitude <= 2.5) {
    scale = 0.2;
  } else if (magnitude <= 5) {
    scale = 0.5;
  } else if (magnitude <= 7.5) {
    scale = 1.0;
  } else {
    scale = 2.0;
  }

  const step = 10 ** Math.floor(power) * scale;
  return Math.round(Math.ceil(maxValue / step) * step);
}

class Chart extends React.Component<Props> {
  render() {
    const {
      data,
      router,
      statsPeriod,
      utc,
      loading,
      height,
      grid,
      disableMultiAxis,
    } = this.props;

    if (!data || data.length <= 0) {
      return null;
    }
    const colors = theme.charts.getColorPalette(4);

    const durationOnly = data.every(
      value => aggregateOutputType(value.seriesName) === 'duration'
    );
    const dataMax = durationOnly ? computeAxisMax(data) : undefined;

    const xAxes = disableMultiAxis
      ? undefined
      : [
          {
            gridIndex: 0,
            type: 'time' as const,
          },
          {
            gridIndex: 1,
            type: 'time' as const,
          },
        ];

    const yAxes = disableMultiAxis
      ? undefined
      : [
          {
            gridIndex: 0,
            scale: true,
            max: dataMax,
            axisLabel: {
              color: theme.chartLabel,
              formatter(value: number) {
                return axisLabelFormatter(value, data[0].seriesName);
              },
            },
          },
          {
            gridIndex: 1,
            scale: true,
            max: dataMax,
            axisLabel: {
              color: theme.chartLabel,
              formatter(value: number) {
                return axisLabelFormatter(value, data[1].seriesName);
              },
            },
          },
        ];

    const axisPointer = disableMultiAxis
      ? undefined
      : {
          // Link the two series x-axis together.
          link: [{xAxisIndex: [0, 1]}],
        };

    const areaChartProps = {
      seriesOptions: {
        showSymbol: false,
      },
      grid: disableMultiAxis
        ? grid
        : [
            {
              top: '8px',
              left: '24px',
              right: '52%',
              bottom: '16px',
            },
            {
              top: '8px',
              left: '52%',
              right: '24px',
              bottom: '16px',
            },
          ],
      axisPointer,
      xAxes,
      yAxes,
      utc,
      isGroupedByDate: true,
      showTimeInTooltip: true,
      colors: [colors[0], colors[1]] as string[],
      tooltip: {
        valueFormatter: (value, seriesName) => {
          return tooltipFormatter(value, seriesName);
        },
        nameFormatter(value: string) {
          return value === 'epm()' ? 'tpm()' : value;
        },
      },
    };

    if (loading) {
      return <AreaChart series={[]} {...areaChartProps} />;
    }
    const series = data.map((values, i: number) => ({
      ...values,
      yAxisIndex: i,
      xAxisIndex: i,
    }));

    return (
      <ChartZoom
        router={router}
        period={statsPeriod}
        utc={utc}
        xAxisIndex={disableMultiAxis ? undefined : [0, 1]}
      >
        {zoomRenderProps => (
          <AreaChart
            height={height}
            {...zoomRenderProps}
            series={series}
            {...areaChartProps}
          />
        )}
      </ChartZoom>
    );
  }
}

export default Chart;
