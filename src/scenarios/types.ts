import type { NestedLevel } from '../components/NestedDataGrid';
import type { EntityNode, MinutePoint, PageRequest, PagedResult } from '../types';

/** Everything needed to drive one scenario's table card + chart card. */
export interface ScenarioConfig {
  /** Table card title. */
  title: string;
  /** Chart card title. */
  chartTitle: string;
  /** Header label for the indented tree column. */
  treeHeader: string;
  levels: NestedLevel[];
  fetchRoot: (request: PageRequest) => Promise<PagedResult<EntityNode>>;
  fetchChildren: (parentId: string, request: PageRequest) => Promise<PagedResult<EntityNode>>;
  fetchSeries: (entityId: string) => Promise<MinutePoint[]>;
}
