import { Box, Paper, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { NestedDataGrid } from './NestedDataGrid';
import type { NestedLevel, RowActivatePath } from './NestedDataGrid';
import type { EntityNode } from '../api/mockApi';

interface Props {
  title: string;
  treeHeader: string;
  levels: NestedLevel[];
  fetchRoot: () => Promise<EntityNode[]>;
  fetchChildren: (parentId: string) => Promise<EntityNode[]>;
  onRowActivate: (path: RowActivatePath) => void;
  onToggleShown: (path: RowActivatePath) => void;
  shownIds: Set<string>;
  colorOf?: (id: string) => string | undefined;
  sx?: SxProps<Theme>;
}

/** Card wrapping one scenario's nested table. */
export function TableCard({
  title,
  treeHeader,
  levels,
  fetchRoot,
  fetchChildren,
  onRowActivate,
  onToggleShown,
  shownIds,
  colorOf,
  sx,
}: Props) {
  return (
    <Paper
      variant="outlined"
      sx={[
        { display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, height: '100%' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Toggle the eye to show/compare rows · double-click to focus one lineage · sort & page below
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <NestedDataGrid
          levels={levels}
          treeHeader={treeHeader}
          fetchRoot={fetchRoot}
          fetchChildren={fetchChildren}
          onRowActivate={onRowActivate}
          onToggleShown={onToggleShown}
          shownIds={shownIds}
          colorOf={colorOf}
          height="100%"
        />
      </Box>
    </Paper>
  );
}
