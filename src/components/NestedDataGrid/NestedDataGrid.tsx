import { useMemo } from 'react';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridEventListener } from '@mui/x-data-grid';
import type { EntityNode } from '../../api/mockApi';
import type { FlatRow, NestedLevel, RowActivatePath } from './types';
import { TREE_FIELD } from './types';
import { useNestedRows } from './useNestedRows';
import { TreeCell } from './TreeCell';
import { EyeCell } from './EyeCell';

const EYE_FIELD = '__eye__';

interface Props {
  /** Column config per depth. Columns shared across levels are merged by field. */
  levels: NestedLevel[];
  /** Header label for the indented tree column. */
  treeHeader: string;
  fetchRoot: () => Promise<EntityNode[]>;
  fetchChildren: (parentId: string) => Promise<EntityNode[]>;
  /** Fired on row double-click — focus this lineage (row + ancestors) on the chart. */
  onRowActivate: (path: RowActivatePath) => void;
  /** Fired when a row's eye is toggled — add/remove it from the comparison. */
  onToggleShown: (path: RowActivatePath) => void;
  /** Ids currently displayed on the chart. */
  shownIds: Set<string>;
  /** Chart color for a shown id, used to tint its eye. */
  colorOf?: (id: string) => string | undefined;
  height?: number | string;
}

/**
 * Builds the grid's column model: a leftmost eye column, the indented tree
 * column, then the union of every level's columns (deduped by field). Siblings
 * sort within their parent (see useNestedRows), so the tree stays intact.
 */
function buildColumns(
  levels: NestedLevel[],
  treeHeader: string,
  onToggle: (id: string) => void,
  onToggleShown: (path: RowActivatePath) => void,
  colorOf?: (id: string) => string | undefined,
): GridColDef<FlatRow>[] {
  const eyeCol: GridColDef<FlatRow> = {
    field: EYE_FIELD,
    headerName: '',
    width: 48,
    sortable: false,
    filterable: false,
    resizable: false,
    align: 'center',
    headerAlign: 'center',
    renderCell: (params) => (
      <EyeCell
        shown={params.row._shown}
        color={colorOf?.(params.row.id)}
        onToggle={() =>
          onToggleShown({ node: params.row._node, ancestors: params.row._ancestors })
        }
      />
    ),
  };

  const treeCol: GridColDef<FlatRow> = {
    field: TREE_FIELD,
    headerName: treeHeader,
    flex: 1.4,
    minWidth: 190,
    renderCell: (params) => <TreeCell params={params} onToggle={onToggle} />,
  };

  const cols: GridColDef<FlatRow>[] = [eyeCol, treeCol];
  const seen = new Set<string>([EYE_FIELD, TREE_FIELD]);
  for (const level of levels) {
    for (const col of level.columns) {
      if (seen.has(col.field)) continue;
      seen.add(col.field);
      cols.push(col as GridColDef<FlatRow>);
    }
  }
  // Columns are sortable (siblings sort within their parent — see useNestedRows);
  // filtering stays off to keep the tree compact.
  return cols.map((c) => ({ sortable: true, filterable: false, ...c }));
}

const TINT = '#0ea5a0';

export function NestedDataGrid({
  levels,
  treeHeader,
  fetchRoot,
  fetchChildren,
  onRowActivate,
  onToggleShown,
  shownIds,
  colorOf,
  height = 340,
}: Props) {
  const { rows, toggle, rootLoading, sortModel, setSortModel } = useNestedRows({
    fetchRoot,
    fetchChildren,
    shownIds,
  });

  const columns = useMemo(
    () => buildColumns(levels, treeHeader, toggle, onToggleShown, colorOf),
    [levels, treeHeader, toggle, onToggleShown, colorOf],
  );

  const handleDoubleClick: GridEventListener<'rowDoubleClick'> = (params) => {
    const row = params.row as FlatRow;
    onRowActivate({ node: row._node, ancestors: row._ancestors });
  };

  return (
    <Box sx={{ height, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={rootLoading}
        density="compact"
        disableColumnMenu
        disableRowSelectionOnClick
        columnHeaderHeight={40}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        onRowDoubleClick={handleDoubleClick}
        getRowClassName={(params) =>
          `depth-${params.row._depth}${params.row._shown ? ' nested-row--shown' : ''}`
        }
        sx={{
          fontSize: 13,
          border: 0,
          '& .MuiDataGrid-columnHeader': { backgroundColor: 'grey.100' },
          '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          // Per-depth background tints so nesting levels read as distinct layers.
          '& .MuiDataGrid-row.depth-1': { backgroundColor: alpha(TINT, 0.05) },
          '& .MuiDataGrid-row.depth-2': { backgroundColor: alpha(TINT, 0.1) },
          // Rows currently shown on the chart get a stronger highlight.
          '& .MuiDataGrid-row.nested-row--shown': { backgroundColor: alpha(TINT, 0.22) },
          '& .MuiDataGrid-row.nested-row--shown:hover': { backgroundColor: alpha(TINT, 0.26) },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
            outline: 'none',
          },
        }}
      />
    </Box>
  );
}
