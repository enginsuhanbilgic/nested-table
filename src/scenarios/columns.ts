import { createElement } from 'react';
import type { GridColDef } from '@mui/x-data-grid';

const MICROSECOND_UNIT = '\u00b5s';

const numberFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatLatency(value: number, compact = false) {
  const formatter =
    compact && Math.abs(value) >= 100_000 ? compactFormatter : numberFormatter;
  return `${formatter.format(Math.round(value))} ${MICROSECOND_UNIT}`;
}

function formatLatencyDetail(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${formatLatency(value)} (${(value / 1_000_000).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    })} s)`;
  }

  return formatLatency(value);
}

function latencySeverity(value: number) {
  if (value >= 10_000_000) return 'critical';
  if (value >= 1_000_000) return 'high';
  if (value >= 100_000) return 'warn';
  return 'good';
}

/** Right-aligned numeric latency column rendered as microseconds. */
export function metricCol(field: 'avg' | 'med' | 'max', headerName: string): GridColDef {
  return {
    field,
    headerName,
    width: 86,
    type: 'number',
    align: 'right',
    headerAlign: 'right',
    valueFormatter: (value) => (value == null ? '' : formatLatency(Number(value), true)),
    renderCell: (params) => {
      const value = Number(params.value);
      if (!Number.isFinite(value)) return '';
      return createElement(
        'span',
        {
          title: formatLatencyDetail(value),
          style: {
            display: 'block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
        formatLatency(value, true),
      );
    },
    cellClassName: (params) => {
      const value = Number(params.value);
      if (!Number.isFinite(value)) return 'latency-cell';
      return `latency-cell latency-${latencySeverity(value)}`;
    },
  };
}

/** Plain text column for a level-specific field (blank on rows that lack it). */
export function textCol(field: string, headerName: string, width = 100): GridColDef {
  return { field, headerName, width };
}

/** Shared daily-aggregate columns reused by every level. */
export const metricCols: GridColDef[] = [
  metricCol('med', 'Med'),
  metricCol('avg', 'Avg'),
  metricCol('max', 'Max'),
];
