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
    { label: 'Gateway', columns: [textCol('region', 'Region', 96), ...metricCols] },
    { label: 'Instance', columns: [textCol('status', 'Status', 84), ...metricCols] },
    { label: 'User', columns: [textCol('connection', 'Connection', 118), ...metricCols] },
  ],
  fetchRoot: (request) => fetchRoot('node', request),
  fetchChildren,
  fetchSeries,
};
