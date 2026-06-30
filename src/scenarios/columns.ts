import type { GridColDef } from '@mui/x-data-grid';

/** Right-aligned numeric latency column rendered as "<n> ms". */
export function metricCol(field: 'avg' | 'med' | 'max', headerName: string): GridColDef {
  return {
    field,
    headerName,
    width: 78,
    type: 'number',
    align: 'right',
    headerAlign: 'right',
    valueFormatter: (value) => (value == null ? '' : `${value as number} ms`),
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
