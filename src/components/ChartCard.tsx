import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { LatencyChart } from './chart/LatencyChart';
import type { ChartEntity } from './chart/LatencyChart';

interface Props {
  title: string;
  entities: ChartEntity[];
  loading: boolean;
  sx?: SxProps<Theme>;
}

/** Card wrapping one scenario's latency chart. */
export function ChartCard({ title, entities, loading, sx }: Props) {
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
          Median shown by default — toggle avg / max in the legend · drag the slider to zoom
        </Typography>
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
            <Typography variant="body2">
              Toggle a row's eye (or double-click a row) to load its latency series.
            </Typography>
          </Box>
        ) : (
          <LatencyChart entities={entities} height="100%" />
        )}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(255,255,255,0.5)',
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
