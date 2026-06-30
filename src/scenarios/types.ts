import type { NestedLevel } from '../components/NestedDataGrid';
import type { EntityNode, MinutePoint } from '../api/mockApi';

/** Everything needed to drive one scenario's table card + chart card. */
export interface ScenarioConfig {
  /** Table card title. */
  title: string;
  /** Chart card title. */
  chartTitle: string;
  /** Header label for the indented tree column. */
  treeHeader: string;
  levels: NestedLevel[];
  fetchRoot: () => Promise<EntityNode[]>;
  fetchChildren: (parentId: string) => Promise<EntityNode[]>;
  fetchSeries: (entityId: string) => Promise<MinutePoint[]>;
}
