# Architecture

Deep-dive on how the reusable nested grid + latency chart fit together. Pair with
the high-level [../CLAUDE.md](../CLAUDE.md).

## Data flow at a glance

```
mockApi.ts ──fetchRoot/fetchChildren──▶ useNestedRows ──rows──▶ NestedDataGrid (DataGrid)
                                                                      │
                                          eye / focus action ─────────┤
                                                                      ▼
mockApi.fetchSeries ◀────────────────── useLatencySeries (per scenario, in App.tsx)
                                                                      │
                                                        entities (with colors)
                                                                      ▼
                                                     ChartCard ──▶ LatencyChart ──▶ EChart
```

Everything is wired per scenario in `App.tsx`: one `useLatencySeries` controller +
one `TableCard` + one `ChartCard`. The two scenarios are fully independent
(separate comparison sets, separate charts).

## The mock "server" — `src/api/mockApi.ts`

At module load it builds two entity trees and stores them in `Map`s:
- `rootsByScenario: Map<ScenarioId, EntityNode[]>` — top-level rows.
- `childrenByParent: Map<parentId, EntityNode[]>` — for lazy expansion.
- `seriesById: Map<entityId, MinutePoint[]>` — the minute-by-minute series.

`EntityNode` carries `{ id, name, level, daily: {avg,med,max}, extra, hasChildren }`.
`extra` holds level-specific fields (e.g. `region`, `status`, `device`, `connection`)
which become distinct columns — this is how "different columns per level" is shown.

Async API (each wrapped in a `setTimeout` to fake latency):
- `fetchRoot(scenario, request)` / `fetchChildren(parentId, request)` — table data,
  loaded one backend page at a time. `PageRequest` carries `page`, `pageSize`, and
  the active sort.
- `fetchSeries(entityId)` — the chart series, loaded on demand when a row is shown.

`TIMES` is 511 `"HH:MM"` labels (09:30→18:00, one per minute). `genSeries` keeps
`max ≥ avg ≥ med` and adds a midday bump + occasional spikes.

## Nesting on the FREE DataGrid — `NestedDataGrid/`

The Community grid has no tree-data/detail-panel API, so nesting is done by hand:

1. **`useNestedRows`** owns the tree state: paged root rows, paged child sibling
   groups, an `expanded` set, and a `sortModel`. It **flattens** only loaded and
   visible tree branches into `FlatRow[]`. Normal rows are tagged with `_depth`,
   `_hasChildren`, `_expanded`, `_loading`, `_shown`, `_node`, and `_ancestors`
   (root→parent chain). Loader rows (`_kind: "loader"`) are inserted wherever a
   sibling group has another backend page.
2. **Column model** (`buildColumns`): a leftmost eye column, then the indented tree
   column (`TREE_FIELD = "__tree__"`), then the **union of every level's columns**
   deduped by `field`. Columns are `sortable: true`, `filterable: false`.
3. **Expansion**: the tree column (`TreeCell`) renders indentation (`_depth * 20px`) +
   an expand/collapse `IconButton`; clicking calls `toggle(id)`, which lazily
   `fetchChildren` on first expand (spinner shown via `_loading`).
4. **Sorting keeps the tree**: `sortingMode="server"` so the grid does NOT reorder;
   `PageRequest.sort` is passed to `fetchRoot`/`fetchChildren`, and each backend
   page is expected to sort only that sibling group. Sorting resets loaded pages and
   collapses expanded branches to avoid mixing old and new page order.
5. **Virtualized infinite scrolling** replaces DataGrid footer pagination. The free
   grid forces pagination internally, so `NestedDataGrid` disables
   `state.pagination.enabled` through `apiRef` after initialization; otherwise the
   hidden footer leaves the user trapped on the first internal page. The grid then
   virtualizes the loaded flattened rows; `NestedDataGrid` subscribes to
   `scrollPositionChange` and asks `useNestedRows` to load a loader row's next page
   when that loader enters the render window.
6. **Row tints**: `getRowClassName` emits `depth-N` (per-level background tint) and
   `nested-row--shown` (stronger highlight for rows currently on the chart).

## Comparison controller — `src/components/useLatencySeries.ts`

One instance per scenario, held in `App.tsx`. Owns the **comparison set** (which
entities are on the chart) and their colors.

State: `shownIdList` (ordered ids), `metaById` (label/depth), `seriesById` (fetched
series cache), and `colorById` (stable chart colors). `requestedRef` avoids
duplicate series fetches.

Actions passed down to the grid:
- **`toggleShown({node, ancestors})`** — the eye. If the node is shown, remove only
  it (and release its color). Otherwise add `[...ancestors, node]` (ancestors come
  along by default) and fetch any missing series. This is what lets you start from
  "participant + user" and then hide the participant / add other users.
- **`focus({node, ancestors})`** — double-click. Resets colors and replaces the set
  with just that lineage.
- **`clear()`** — clears the current chart comparison while keeping fetched series
  cached.
- **`colorOf(id)`** — used by the grid to tint each row's eye to match its line.
- **`shownIds`** (a `Set`) — drives eye state + row highlight.

Derived: `entities: ChartEntity[]` (only ids whose series have loaded) and `loading`.

## Chart — `chart/LatencyChart.tsx` + `chart/EChart.tsx`

`EChart` is a tiny wrapper: `echarts.init` on mount, `setOption(option, true)` on
change, a `ResizeObserver` to resize with the container, `dispose` on unmount. No
third-party React binding (keeps it React-19 safe). Pass `height="100%"` to fill a
flex parent.

`ChartCard` owns the active metric (`med`, `avg`, or `max`) through a compact toggle.
`LatencyChart` turns `ChartEntity[]` + the selected metric into the ECharts option:
- **Color = entity identity.** Each entity uses its single `color`, matching the row
  eye. The legend lists entities only.
- **One y-axis per selected metric.** The selected metric is shown by the card
  toggle and tooltip, while the plot area keeps the axis title hidden to avoid
  clipping/collisions with the legend.
- **Zoom**: `dataZoom` slider + inside (drag/scroll); a toolbox offers zoom-select,
  restore, and save-as-image. Lines are smoothed with LTTB sampling.

## Gotchas for future changes

- The chart re-applies its option with `setOption(option, true)` (no merge), so
  toggling series/zoom resets to the full range on each new selection — intended.
- `ChartEntity` requires a `color`; it is assigned by the controller, not the chart.
- When adding columns, remember every level shares one merged column model; give a
  level-specific field a distinct `field` and it will render blank on other levels.
- `colorOf` changes when chart colors change, so the grid column model can rebuild
  after comparison edits. Keep row callbacks memoized enough to avoid unnecessary
  rebuilds during unrelated renders.
