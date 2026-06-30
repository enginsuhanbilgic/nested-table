import { Box, CircularProgress, IconButton } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { GridRenderCellParams } from '@mui/x-data-grid';
import type { FlatRow } from './types';

interface Props {
  params: GridRenderCellParams<FlatRow>;
  onToggle: (id: string) => void;
}

/** Indented name cell with an expand/collapse control (spinner while loading children). */
export function TreeCell({ params, onToggle }: Props) {
  const row = params.row;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        pl: `${row._depth * 20}px`,
      }}
    >
      <Box sx={{ width: 28, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {row._loading ? (
          <CircularProgress size={14} thickness={5} />
        ) : row._hasChildren ? (
          <IconButton
            size="small"
            edge="start"
            aria-label={row._expanded ? 'collapse' : 'expand'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(row.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {row._expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ChevronRightIcon fontSize="small" />
            )}
          </IconButton>
        ) : null}
      </Box>
      <Box
        component="span"
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {params.value as string}
      </Box>
    </Box>
  );
}
