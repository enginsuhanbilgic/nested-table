import { Box, CircularProgress, IconButton } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { GridRenderCellParams } from '@mui/x-data-grid';
import type { FlatRow } from './types';

const LEVEL_TAG_STYLES: Record<string, { bgcolor: string; color: string; borderColor: string }> = {
  Gateway: { bgcolor: '#e0f2fe', color: '#075985', borderColor: '#7dd3fc' },
  Instance: { bgcolor: '#fef3c7', color: '#92400e', borderColor: '#fbbf24' },
  Participant: { bgcolor: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  User: { bgcolor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe' },
  Region: { bgcolor: '#e0f2fe', color: '#075985', borderColor: '#7dd3fc' },
  DC: { bgcolor: '#fef3c7', color: '#92400e', borderColor: '#fbbf24' },
  Server: { bgcolor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe' },
};

const FALLBACK_LEVEL_TAG_STYLES = [
  { bgcolor: '#e0f2fe', color: '#075985', borderColor: '#7dd3fc' },
  { bgcolor: '#fef3c7', color: '#92400e', borderColor: '#fbbf24' },
  { bgcolor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe' },
];

function getLevelTagStyle(levelLabel: string, depth: number) {
  return LEVEL_TAG_STYLES[levelLabel] ?? FALLBACK_LEVEL_TAG_STYLES[depth % FALLBACK_LEVEL_TAG_STYLES.length];
}

interface Props {
  params: GridRenderCellParams<FlatRow>;
  onToggle: (id: string) => void;
  levelLabel?: string;
}

/** Indented name cell with an expand/collapse control (spinner while loading children). */
export function TreeCell({ params, onToggle, levelLabel }: Props) {
  const row = params.row;

  if (row._kind === 'loader') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          pl: `${row._depth * 20 + 34}px`,
          gap: 1,
          color: 'text.secondary',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <CircularProgress size={14} thickness={5} />
        <Box component="span">{params.value as string}</Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        pl: `${row._depth * 20}px`,
        gap: 0.75,
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
            sx={{
              color: row._expanded ? 'primary.main' : 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' },
            }}
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
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          fontWeight: row._depth === 0 ? 650 : 500,
        }}
      >
        {params.value as string}
      </Box>
      {levelLabel && (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            px: 0.75,
            py: 0.15,
            borderRadius: 1,
            border: '1px solid',
            ...getLevelTagStyle(levelLabel, row._depth),
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {levelLabel}
        </Box>
      )}
    </Box>
  );
}
