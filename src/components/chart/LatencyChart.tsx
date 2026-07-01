import { useMemo } from 'react';
import type { EChartsOption, LineSeriesOption } from 'echarts';
import type { MinutePoint } from '../../types';
import { EChart } from './EChart';

export type LatencyMetric = 'med' | 'avg' | 'max';

export interface ChartEntity {
  key: string;
  label: string;
  /** Tree depth (0 = top), kept for reference; color drives identity. */
  depth: number;
  /** Stable per-entity color (matches the row's eye). */
  color: string;
  series: MinutePoint[];
}

interface Props {
  entities: ChartEntity[];
  metric?: LatencyMetric;
  height?: number | string;
}

const AXIS = '#64748b';
const GRID = '#e6edf5';
const TEXT = '#263244';
const ZOOM = '#2563eb';

const METRIC_LABEL: Record<LatencyMetric, string> = {
  med: 'Median',
  avg: 'Average',
  max: 'Maximum',
};

type TooltipItem = {
  axisValueLabel?: string;
  axisValue?: string;
  marker?: string;
  seriesName?: string;
  value?: number;
};

/** Entity comparison chart. Metric selection lives in ChartCard. */
export function LatencyChart({ entities, metric = 'med', height = 300 }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const times = entities[0]?.series.map((p) => p.t) ?? [];
    const label = METRIC_LABEL[metric];

    const series: LineSeriesOption[] = entities.map((entity) => ({
      name: entity.label,
      type: 'line',
      smooth: true,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 7,
      sampling: 'lttb',
      emphasis: {
        focus: 'series',
        lineStyle: { width: 3.4 },
      },
      lineStyle: { width: 2.4, color: entity.color },
      itemStyle: { color: entity.color },
      data: entity.series.map((point) => point[metric]),
    }));

    return {
      animationDuration: 350,
      color: entities.map((entity) => entity.color),
      grid: { left: 12, right: 18, top: 52, bottom: 62, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: AXIS, width: 1, type: 'dashed' } },
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: GRID,
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: TEXT, fontSize: 12 },
        extraCssText: 'box-shadow:0 12px 30px rgba(15,23,42,0.12);border-radius:8px;',
        formatter: (params: unknown) => {
          const items = (Array.isArray(params) ? params : [params]) as TooltipItem[];
          if (!items.length) return '';
          const header = items[0].axisValueLabel ?? items[0].axisValue ?? '';
          const rows = items
            .map((item) => {
              const value = item.value == null ? '-' : `${item.value} ms`;
              return `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:7px;"><span>${item.marker ?? ''}${item.seriesName ?? ''}</span><strong>${value}</strong></div>`;
            })
            .join('');
          return `<div style="min-width:210px;font-weight:700;margin-bottom:2px;">${header} - ${label}</div>${rows}`;
        },
      },
      toolbox: {
        right: 8,
        top: 4,
        itemSize: 14,
        iconStyle: { borderColor: AXIS },
        emphasis: { iconStyle: { borderColor: ZOOM } },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom', back: 'Back' } },
          restore: { title: 'Reset' },
          saveAsImage: { name: 'latency', title: 'Save' },
        },
      },
      legend: {
        type: 'scroll',
        top: 6,
        left: 8,
        right: 92,
        itemWidth: 18,
        itemHeight: 10,
        icon: 'roundRect',
        textStyle: { fontSize: 11, color: '#526173', fontWeight: 600 },
        pageIconColor: ZOOM,
        pageTextStyle: { color: AXIS },
        data: entities.map((entity) => entity.label),
      },
      xAxis: {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: GRID } },
        axisTick: { show: true, alignWithLabel: true, lineStyle: { color: GRID } },
        axisLabel: {
          color: AXIS,
          fontSize: 11,
          interval: (_index: number, value: string) =>
            value.endsWith(':00') || value.endsWith(':30'),
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: AXIS, fontSize: 11 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: GRID } },
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        {
          type: 'slider',
          height: 20,
          bottom: 18,
          borderColor: GRID,
          fillerColor: 'rgba(37, 99, 235, 0.14)',
          handleStyle: { color: ZOOM },
          moveHandleStyle: { color: ZOOM },
          textStyle: { color: AXIS, fontSize: 10 },
          dataBackground: {
            lineStyle: { color: '#9db7d9' },
            areaStyle: { color: '#e7eef8' },
          },
          selectedDataBackground: {
            lineStyle: { color: ZOOM },
            areaStyle: { color: 'rgba(37,99,235,0.18)' },
          },
        },
      ],
      series,
    };
  }, [entities, metric]);

  return <EChart option={option} height={height} />;
}
