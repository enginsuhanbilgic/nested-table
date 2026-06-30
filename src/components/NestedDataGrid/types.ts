import type { GridColDef } from '@mui/x-data-grid';
import type { EntityNode } from '../../api/mockApi';

/** Field used for the always-present, indented "tree" column. */
export const TREE_FIELD = '__tree__';

/** Per-depth configuration. Columns may be shared across levels (merged by field). */
export interface NestedLevel {
  columns: GridColDef[];
}

/** Emitted on row double-click: the row plus its full ancestor chain (root -> parent). */
export interface RowActivatePath {
  node: EntityNode;
  ancestors: EntityNode[];
}

/**
 * A grid row produced by flattening the tree against the current expansion state.
 * Entity `daily` metrics and `extra` fields are spread on so standard columns
 * resolve `row[field]` automatically (absent fields render blank).
 */
export interface FlatRow {
  id: string;
  __tree__: string;
  _depth: number;
  _hasChildren: boolean;
  _expanded: boolean;
  _loading: boolean;
  /** Whether this row is currently displayed on the chart (eye toggled on). */
  _shown: boolean;
  _node: EntityNode;
  _ancestors: EntityNode[];
  avg: number;
  med: number;
  max: number;
  [field: string]: unknown;
}
