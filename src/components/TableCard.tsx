import { Box, Paper, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { NestedDataGrid } from './NestedDataGrid';
import type { NestedLevel, RowActivatePath } from './NestedDataGrid';
import type { EntityNode, PageRequest, PagedResult } from '../types';

interface Props {
  title: string;
  treeHeader: string;
  levels: NestedLevel[];
  fetchRoot: (request: PageRequest) => Promise<PagedResult<EntityNode>>;
  fetchChildren: (parentId: string, request: PageRequest) => Promise<PagedResult<EntityNode>>;
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
        {
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
          height: '100%',
          borderColor: '#d8e1ec',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          px: 2,
          py: 1.2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: '#fbfcfe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
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
