import { useEffect, useMemo } from 'react';
import { Box, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';
import type { GridColDef, GridEventListener } from '@mui/x-data-grid';
import type { EntityNode, PageRequest, PagedResult } from '../../types';
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
  fetchRoot: (request: PageRequest) => Promise<PagedResult<EntityNode>>;
  fetchChildren: (parentId: string, request: PageRequest) => Promise<PagedResult<EntityNode>>;
  /** Fired on row double-click to focus one lineage. */
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
 * Builds the grid's column model: chart actions, the indented tree column, then
 * the union of every level's columns (deduped by field). Siblings sort within
 * their parent (see useNestedRows), so the tree stays intact.
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
    width: 44,
    sortable: false,
    filterable: false,
    resizable: false,
    align: 'center',
    headerAlign: 'center',
    renderHeader: () => (
      <Tooltip title="Show on chart" disableInteractive>
        <VisibilityOutlinedIcon fontSize="small" color="disabled" />
      </Tooltip>
    ),
    renderCell: (params) => (
      params.row._kind === 'node' && params.row._node ? (
        <EyeCell
          shown={params.row._shown}
          color={colorOf?.(params.row.id)}
          onToggle={() =>
            onToggleShown({ node: params.row._node as EntityNode, ancestors: params.row._ancestors })
          }
        />
      ) : null
    ),
  };

  const treeCol: GridColDef<FlatRow> = {
    field: TREE_FIELD,
    headerName: treeHeader,
    flex: 1.4,
    minWidth: 230,
    renderCell: (params) => (
      <TreeCell
        params={params}
        onToggle={onToggle}
        levelLabel={params.row._kind === 'node' ? levels[params.row._depth]?.label : undefined}
      />
    ),
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

const DEPTH_1 = '#0891b2';
const DEPTH_2 = '#d97706';
const SHOWN = '#2563eb';

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
  const apiRef = useGridApiRef();
  const { rows, toggle, rootLoading, sortModel, setSortModel, loadMoreForRow } = useNestedRows({
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
    if (row._kind === 'node' && row._node) {
      onRowActivate({ node: row._node, ancestors: row._ancestors });
    }
  };

  useEffect(() => {
    apiRef.current?.setState((state) => {
      if (!state.pagination?.enabled) return state;
      return {
        ...state,
        pagination: {
          ...state.pagination,
          enabled: false,
        },
      };
    });
  }, [apiRef]);

  useEffect(() => {
    return apiRef.current?.subscribeEvent('scrollPositionChange', (params) => {
      const renderContext = params.renderContext;
      if (!renderContext) return;
      const start = Math.max(0, renderContext.firstRowIndex - 2);
      const end = Math.min(rows.length, renderContext.lastRowIndex + 4);
      for (let index = start; index < end; index += 1) {
        const row = rows[index];
        if (row?._kind === 'loader') loadMoreForRow(row);
      }
    });
  }, [apiRef, loadMoreForRow, rows]);

  useEffect(() => {
    const firstLoader = rows.find((row, index) => row._kind === 'loader' && index < 12);
    if (firstLoader) loadMoreForRow(firstLoader);
  }, [loadMoreForRow, rows]);

  return (
    <Box sx={{ height, width: '100%' }}>
      <DataGrid
        apiRef={apiRef}
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
        hideFooter
        onRowDoubleClick={handleDoubleClick}
        getRowClassName={(params) =>
          `${params.row._kind === 'loader' ? 'nested-row--loader ' : ''}depth-${params.row._depth}${
            params.row._shown ? ' nested-row--shown' : ''
          }`
        }
        sx={{
          fontSize: 13,
          border: 0,
          color: 'text.primary',
          bgcolor: 'background.paper',
          '& .MuiDataGrid-columnHeaders': {
            borderColor: 'divider',
          },
          '& .MuiDataGrid-columnHeader': {
            backgroundColor: '#f8fafc',
            color: 'text.secondary',
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0,
          },
          '& .MuiDataGrid-cell': {
            borderColor: '#edf2f7',
          },
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          '& .MuiDataGrid-row.nested-row--loader': {
            cursor: 'default',
            backgroundColor: '#f8fafc',
          },
          '& .MuiDataGrid-row.nested-row--loader:hover': {
            backgroundColor: '#f8fafc',
          },
          '& .MuiDataGrid-row:hover': { backgroundColor: '#f8fbff' },
          '& .MuiDataGrid-row.depth-1': { backgroundColor: alpha(DEPTH_1, 0.045) },
          '& .MuiDataGrid-row.depth-1:hover': { backgroundColor: alpha(DEPTH_1, 0.08) },
          '& .MuiDataGrid-row.depth-2': { backgroundColor: alpha(DEPTH_2, 0.055) },
          '& .MuiDataGrid-row.depth-2:hover': { backgroundColor: alpha(DEPTH_2, 0.09) },
          '& .MuiDataGrid-row.nested-row--shown': {
            backgroundColor: alpha(SHOWN, 0.12),
            boxShadow: `inset 3px 0 0 ${SHOWN}`,
          },
          '& .MuiDataGrid-row.nested-row--shown:hover': { backgroundColor: alpha(SHOWN, 0.16) },
          '& .latency-cell': {
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
          },
          '& .latency-good': { color: '#047857' },
          '& .latency-warn': { color: '#b45309' },
          '& .latency-high': { color: '#b91c1c' },
          '& .latency-critical': { color: '#7f1d1d', fontWeight: 800 },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: -2,
          },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: -2,
          },
        }}
      />
    </Box>
  );
}
