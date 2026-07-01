// ============================================================================
// EXAMPLE: everything YOU write to add a brand-new hierarchy.
//
// A completely different tree — Regions → Data Centers → Servers — reusing the
// grid + chart engine unchanged. Render <NewHierarchyPanel /> anywhere.
//
// You only import from the engine; you never edit it. The four sections below
// (data → API → columns → wiring) are the whole job.
// ============================================================================

import { Box } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';

// ---- the engine (never edited) --------------------------------------------
import { TableCard } from '../components/TableCard';
import { ChartCard } from '../components/ChartCard';
import { useLatencySeries } from '../components/useLatencySeries';
import type { NestedLevel } from '../components/NestedDataGrid';
// ---- the data contract (just the types) -----------------------------------
import type { EntityNode, MinutePoint, PageRequest, PagedResult } from '../types';

// ============================================================================
// SECTION 1 — YOUR DATA
// A node needs: id, name (shown in the tree column), level (depth), daily
// {avg,med,max} (the numbers your metric columns show), extra (your other
// column values, string|number), and hasChildren (shows the expand arrow).
// ============================================================================

// one minute-by-minute series per entity, 09:30 → 18:00 (what the chart draws)
function genSeries(base: number): MinutePoint[] {
  const out: MinutePoint[] = [];
  let med = base;
  for (let m = 9 * 60 + 30; m <= 18 * 60; m++) {
    med += (Math.random() - 0.5) * base * 0.08;
    med = Math.max(base * 0.5, Math.min(base * 1.8, med));
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const avg = med * (1.05 + Math.random() * 0.1);
    const max = avg * 1.4 + (Math.random() < 0.05 ? base : 0);
    out.push({ t: `${h}:${mm}`, med: Math.round(med), avg: Math.round(avg), max: Math.round(max) });
  }
  return out;
}

const SERIES = new Map<string, MinutePoint[]>();

// helper: build a node, remember its series, derive the daily aggregates
function makeNode(
  id: string,
  name: string,
  level: number,
  base: number,
  extra: Record<string, string | number>,
  hasChildren: boolean,
): EntityNode {
  const series = genSeries(base);
  SERIES.set(id, series);
  const daily = {
    avg: Math.round(series.reduce((s, p) => s + p.avg, 0) / series.length),
    med: Math.round(series.reduce((s, p) => s + p.med, 0) / series.length),
    max: Math.round(Math.max(...series.map((p) => p.max))),
  };
  return { id, name, level, daily, extra, hasChildren };
}

// the tree: top-level rows + a map of children by parent id (loaded on expand)
const ROOTS: EntityNode[] = [
  makeNode('eu', 'Europe', 0, 60, { provider: 'AWS' }, true),
  makeNode('us', 'US', 0, 80, { provider: 'GCP' }, true),
];

const CHILDREN: Record<string, EntityNode[]> = {
  eu: [
    makeNode('eu-fra', 'Frankfurt DC', 1, 55, { tier: 'Tier III' }, true),
    makeNode('eu-dub', 'Dublin DC', 1, 70, { tier: 'Tier IV' }, false),
  ],
  us: [makeNode('us-iad', 'Virginia DC', 1, 75, { tier: 'Tier III' }, true)],
  'eu-fra': [
    makeNode('eu-fra-s1', 'web-01', 2, 45, { role: 'web' }, false),
    makeNode('eu-fra-s2', 'db-01', 2, 120, { role: 'database' }, false),
  ],
  'us-iad': [makeNode('us-iad-s1', 'web-01', 2, 90, { role: 'web' }, false)],
};

// ============================================================================
// SECTION 2 — YOUR API (async so it mimics a real backend). Keep these at
// module scope so their identity is STABLE (the engine depends on that).
// ============================================================================

const delay = <T,>(value: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

function sortValue(node: EntityNode, field: string): string | number | undefined {
  if (field === '__tree__' || field === 'name') return node.name;
  if (field === 'avg' || field === 'med' || field === 'max') return node.daily[field];
  return node.extra[field];
}

function pageEntities(rows: EntityNode[], request: PageRequest): PagedResult<EntityNode> {
  const sorted = request.sort
    ? [...rows].sort((a, b) => {
        const av = sortValue(a, request.sort!.field);
        const bv = sortValue(b, request.sort!.field);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const dir = request.sort!.direction === 'desc' ? -1 : 1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      })
    : rows;
  const start = request.page * request.pageSize;
  const end = start + request.pageSize;
  return {
    rows: sorted.slice(start, end),
    total: sorted.length,
    nextPage: end < sorted.length ? request.page + 1 : null,
  };
}

const fetchRoot = (request: PageRequest) => delay(pageEntities(ROOTS, request));
const fetchChildren = (parentId: string, request: PageRequest) =>
  delay(pageEntities(CHILDREN[parentId] ?? [], request));
const fetchSeries = (entityId: string) => delay(SERIES.get(entityId) ?? []);

// ============================================================================
// SECTION 3 — YOUR COLUMNS (per depth). field = a key on the node: 'avg'/'med'/
// 'max' (from daily) or any key you put in `extra`. Levels can differ; the
// engine merges them and blanks fields a level doesn't have.
// ============================================================================

const metric = (field: 'avg' | 'med' | 'max', headerName: string): GridColDef => ({
  field,
  headerName,
  width: 82,
  type: 'number',
  align: 'right',
  headerAlign: 'right',
  valueFormatter: (value) => (value == null ? '' : `${value as number} ms`),
});

const levels: NestedLevel[] = [
  // level 0 — Regions
  { label: 'Region', columns: [{ field: 'provider', headerName: 'Provider', width: 110 }, metric('med', 'Med'), metric('avg', 'Avg'), metric('max', 'Max')] },
  // level 1 — Data Centers
  { label: 'DC', columns: [{ field: 'tier', headerName: 'Tier', width: 100 }, metric('med', 'Med'), metric('avg', 'Avg'), metric('max', 'Max')] },
  // level 2 — Servers
  { label: 'Server', columns: [{ field: 'role', headerName: 'Role', width: 110 }, metric('med', 'Med'), metric('avg', 'Avg'), metric('max', 'Max')] },
];

// ============================================================================
// SECTION 4 — WIRING (boilerplate; identical for any hierarchy). The controller
// owns the compare-set + colors; pass its callbacks to the grid, its entities
// to the chart.
// ============================================================================

export function NewHierarchyPanel() {
  const chart = useLatencySeries(fetchSeries);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, maxWidth: 1000 }}>
      <Box sx={{ height: 420 }}>
        <TableCard
          title="Regions → Data Centers → Servers"
          treeHeader="Region / DC / Server"
          levels={levels}
          fetchRoot={fetchRoot}
          fetchChildren={fetchChildren}
          onRowActivate={chart.focus}
          onToggleShown={chart.toggleShown} // eye = add/remove from comparison
          shownIds={chart.shownIds}
          colorOf={chart.colorOf}
        />
      </Box>
      <Box sx={{ height: 360 }}>
        <ChartCard
          title="Latency over time"
          entities={chart.entities}
          loading={chart.loading}
          onClear={chart.clear}
        />
      </Box>
    </Box>
  );
}
