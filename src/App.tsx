import { Box, Typography } from '@mui/material';
import { TableCard } from './components/TableCard';
import { ChartCard } from './components/ChartCard';
import { useLatencySeries } from './components/useLatencySeries';
import { participantScenario } from './scenarios/participantUser';
import { nodeScenario } from './scenarios/nodeInstanceUser';

function App() {
  // One controller per scenario, lifted here so each scenario's table (top row)
  // and chart (bottom row) can live in separate cards yet stay wired together.
  const participant = useLatencySeries(participantScenario.fetchSeries);
  const node = useLatencySeries(nodeScenario.fetchSeries);

  return (
    <Box
      sx={{
        height: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: 2.5,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flex: '0 0 auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Nested Latency Explorer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Two hierarchies, each with its own latency chart. Toggle the eye to compare rows;
          double-click to focus one lineage.
        </Typography>
      </Box>

      {/* Tables (top row) and charts (bottom row) each take half the remaining height. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gridTemplateRows: { xs: '1fr 1fr 1fr 1fr', lg: '1fr 1fr' },
        }}
      >
        <TableCard
          {...participantScenario}
          onRowActivate={participant.focus}
          onToggleShown={participant.toggleShown}
          shownIds={participant.shownIds}
          colorOf={participant.colorOf}
        />
        <TableCard
          {...nodeScenario}
          onRowActivate={node.focus}
          onToggleShown={node.toggleShown}
          shownIds={node.shownIds}
          colorOf={node.colorOf}
        />

        <ChartCard
          title={participantScenario.chartTitle}
          entities={participant.entities}
          loading={participant.loading}
        />
        <ChartCard
          title={nodeScenario.chartTitle}
          entities={node.entities}
          loading={node.loading}
        />
      </Box>
    </Box>
  );
}

export default App;
