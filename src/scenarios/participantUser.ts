import { fetchChildren, fetchRoot, fetchSeries } from '../api/mockApi';
import type { ScenarioConfig } from './types';
import { metricCols, textCol } from './columns';

// Scenario 1 — two levels. Participants and users share avg/med/max, but each
// level adds its own descriptive column (Region vs Device/Status) to show that
// columns can differ per level.
export const participantScenario: ScenarioConfig = {
  title: 'Participants → Users',
  chartTitle: 'Latency over time — participant & user',
  treeHeader: 'Participant / User',
  levels: [
    { label: 'Participant', columns: [textCol('region', 'Region', 96), ...metricCols] },
    {
      label: 'User',
      columns: [
        textCol('device', 'Device', 88),
        textCol('status', 'Status', 80),
        ...metricCols,
      ],
    },
  ],
  fetchRoot: (request) => fetchRoot('participant', request),
  fetchChildren,
  fetchSeries,
};
