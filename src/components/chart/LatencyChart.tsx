import { useMemo } from 'react';
import type { EChartsOption, LineSeriesOption } from 'echarts';
import type { MinutePoint } from '../../api/mockApi';
import { EChart } from './EChart';

export interface ChartEntity {
  key: string;
  label: string;
  /** Tree depth (0 = top), kept for reference; color drives identity now. */
  depth: number;
  /** Stable per-entity color (matches the row's eye). */
  color: string;
  series: MinutePoint[];
}

interface Props {
  entities: ChartEntity[];
  height?: number | string;
}

const AXIS = '#8a94a6';
const SPLIT = '#eef1f5';

type Dash = 'solid' | 'dashed' | 'dotted';

/**
 * Dual-axis comparison chart. Each entity has ONE color (matched to its row's
 * eye); the metric is shown by line style — med solid, avg dashed, max dotted.
 * avg & med use the LEFT axis, max uses the RIGHT axis. Only the medians are
 * visible initially; the legend toggles avg/max. Includes a zoom slider
 * (+ inside drag/scroll) and a save/zoom toolbox.
 */
export function LatencyChart({ entities, height = 300 }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const times = entities[0]?.series.map((p) => p.t) ?? [];
    const series: LineSeriesOption[] = [];
    const legendData: string[] = [];
    const selected: Record<string, boolean> = {};

    const line = (
      name: string,
      color: string,
      yAxisIndex: number,
      dash: Dash,
      data: number[],
    ): LineSeriesOption => ({
      name,
      type: 'line',
      yAxisIndex,
      smooth: 0.25,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 6,
      sampling: 'lttb',
      emphasis: { focus: 'series' },
      lineStyle: { width: dash === 'solid' ? 2 : 1.5, type: dash, color },
      itemStyle: { color },
      data,
    });

    for (const e of entities) {
      const medName = `${e.label} · med`;
      const avgName = `${e.label} · avg`;
      const maxName = `${e.label} · max`;

      legendData.push(medName, avgName, maxName);
      selected[medName] = true; // median visible by default
      selected[avgName] = false; // toggled on via the legend
      selected[maxName] = false;

      series.push(
        line(medName, e.color, 0, 'solid', e.series.map((p) => p.med)),
        line(avgName, e.color, 0, 'dashed', e.series.map((p) => p.avg)),
        line(maxName, e.color, 1, 'dotted', e.series.map((p) => p.max)),
      );
    }

    return {
      animationDuration: 400,
      grid: { left: 58, right: 60, top: 74, bottom: 70 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#5b6573' } },
        valueFormatter: (value) => (value == null ? '–' : `${value as number} ms`),
      },
      toolbox: {
        right: 10,
        top: 6,
        itemSize: 14,
        iconStyle: { borderColor: AXIS },
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          restore: {},
          saveAsImage: { name: 'latency' },
        },
      },
      legend: {
        type: 'scroll',
        top: 6,
        left: 8,
        right: 96,
        itemWidth: 20,
        itemHeight: 10,
        textStyle: { fontSize: 11, color: '#5b6573' },
        data: legendData,
        selected,
      },
      xAxis: {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: SPLIT } },
        axisTick: { show: false },
        axisLabel: {
          color: AXIS,
          interval: (_index: number, value: string) =>
            value.endsWith(':00') || value.endsWith(':30'),
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'avg / med (ms) — solid / dashed',
          position: 'left',
          scale: true,
          nameTextStyle: { color: AXIS, fontSize: 11, padding: [0, 0, 0, 40] },
          axisLabel: { color: AXIS },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: SPLIT } },
        },
        {
          type: 'value',
          name: 'max (ms) — dotted',
          position: 'right',
          scale: true,
          splitLine: { show: false },
          nameTextStyle: { color: AXIS, fontSize: 11, padding: [0, 40, 0, 0] },
          axisLabel: { color: AXIS },
          axisLine: { show: true, lineStyle: { color: SPLIT } },
        },
      ],
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        {
          type: 'slider',
          height: 20,
          bottom: 18,
          borderColor: SPLIT,
          fillerColor: 'rgba(19, 194, 194, 0.12)',
          handleStyle: { color: '#13c2c2' },
          dataBackground: { lineStyle: { color: '#9fe3e0' }, areaStyle: { color: '#d6f3f1' } },
        },
      ],
      series,
    };
  }, [entities]);

  return <EChart option={option} height={height} />;
}
