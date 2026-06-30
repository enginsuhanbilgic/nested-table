import { fetchChildren, fetchRoot, fetchSeries } from '../api/mockApi';
import type { ScenarioConfig } from './types';
import { metricCols, textCol } from './columns';

// Scenario 2 — three levels. Each level contributes a distinct descriptive
// column (Region / Status / Connection) alongside the shared metric columns.
export const nodeScenario: ScenarioConfig = {
  title: 'Gateway Nodes → Instances → Users',
  chartTitle: 'Latency over time — node, instance & user',
  treeHeader: 'Node / Instance / User',
  levels: [
    { columns: [textCol('region', 'Region', 96), ...metricCols] },
    { columns: [textCol('status', 'Status', 84), ...metricCols] },
    { columns: [textCol('connection', 'Connection', 118), ...metricCols] },
  ],
  fetchRoot: () => fetchRoot('node'),
  fetchChildren,
  fetchSeries,
};
