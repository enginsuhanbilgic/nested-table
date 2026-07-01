import { useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import ClearIcon from '@mui/icons-material/Clear';
import { LatencyChart } from './chart/LatencyChart';
import type { ChartEntity, LatencyMetric } from './chart/LatencyChart';

interface Props {
  title: string;
  entities: ChartEntity[];
  loading: boolean;
  onClear?: () => void;
  sx?: SxProps<Theme>;
}

/** Card wrapping one scenario's latency chart. */
export function ChartCard({ title, entities, loading, onClear, sx }: Props) {
  const [metric, setMetric] = useState<LatencyMetric>('med');

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
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: '#fbfcfe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {title}
          </Typography>
          {entities.length > 0 && (
            <Chip
              size="small"
              label={`${entities.length} series`}
              sx={{ height: 22, bgcolor: '#eef6ff', color: 'primary.main', fontWeight: 700 }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={metric}
            onChange={(_event, nextMetric: LatencyMetric | null) => {
              if (nextMetric) setMetric(nextMetric);
            }}
            aria-label="latency metric"
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.15,
                py: 0.35,
                minWidth: 44,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'none',
              },
            }}
          >
            <ToggleButton value="med" aria-label="median latency">
              Med
            </ToggleButton>
            <ToggleButton value="avg" aria-label="average latency">
              Avg
            </ToggleButton>
            <ToggleButton value="max" aria-label="maximum latency">
              Max
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="Clear chart" disableInteractive>
            <span>
              <IconButton
                size="small"
                aria-label="clear chart"
                disabled={entities.length === 0}
                onClick={onClear}
                sx={{ color: 'text.secondary' }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ position: 'relative', p: 1, flex: 1, minHeight: 0 }}>
        {entities.length === 0 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 4,
              textAlign: 'center',
              color: 'text.secondary',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              No latency series selected
            </Typography>
          </Box>
        ) : (
          <LatencyChart entities={entities} metric={metric} height="100%" />
        )}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(255,255,255,0.58)',
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
