# CLAUDE.md

Guidance for AI agents working in this repo. Read this first, then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data-flow details.

## What this is

A **Nested Latency Explorer**: a reusable nested-row data grid (built on the
**free** MUI X Data Grid) paired with Apache ECharts line charts. It renders two
hierarchies side by side, each with its own chart:

- **Participants → Users** (2 levels)
- **Gateway Nodes → Instances → Users** (3 levels)

Every entity has a daily avg/med/max latency (table columns) and a minute-by-minute
series 09:30→18:00 (the chart). All data is mock/generated — there is no backend.

The whole thing is a front-end demo/prototype; the grid + chart are meant to be
**reusable components** driven by per-scenario config.

## Commands

```bash
npm run dev       # Vite dev server (esbuild) — primary way to run/verify
npm run build     # tsc -b && vite build — MUST stay green
npm run preview   # serve the production build
npm run lint      # eslint
```

There are no unit tests. Verify changes by running `npm run dev` and, for UI
behavior, driving the page with a headless browser (Chrome is installed; scripts
have used `puppeteer-core` installed with `--no-save`, then `npm prune`d).

## Critical constraints (do not "fix" these)

- **Pinned to Vite 7 + @vitejs/plugin-react 5 on purpose.** Vite 8's rolldown
  bundler cannot resolve MUI's two-hop `export *` chain (`vite build` fails with
  `hexToRgb ... not exported by @mui/system`). Dev works on Vite 8, prod build does
  not. **Do not upgrade to vite@8 / plugin-react@6** until rolldown fixes nested
  `export *`. (Also recorded in the agent memory file `vite7-pinned-for-mui-build`.)
- **Free MUI X Data Grid only** (`@mui/x-data-grid`, MIT). No Pro features
  (tree data, master-detail/detail panels, row grouping, column pinning). Nesting
  is done manually — see ARCHITECTURE.
- **MUI v9**: `Typography` no longer accepts system props like `fontWeight` directly
  — use `sx={{ fontWeight: 700 }}`.

## TypeScript / lint rules that bite

`tsconfig.app.json` enables:
- `verbatimModuleSyntax` → type-only imports **must** use `import type { ... }`.
- `erasableSyntaxOnly` → **no** TS enums / namespaces / param-properties. Use string
  literal unions and `const` objects.
- `noUnusedLocals` / `noUnusedParameters` → prefix intentionally-unused params with `_`.

MUI X v9 `valueFormatter` signature is `(value, row, column, apiRef) => string`
(value first).

## Layout model

`src/App.tsx` is a full-height (`100vh`) flex column: a fixed header, then a grid
that fills the rest. **Tables row (top) and charts row (bottom) each take half the
remaining height** via `gridTemplateRows: 1fr 1fr`; four cards flow into a 2×2 grid.
Cards are `height: 100%` and their grid/chart sit in a `flex: 1, minHeight: 0`
region so they grow to fill the cell.

## File map

```
src/
  api/mockApi.ts                 Mock "server": types, series generator, async fetchers
  theme.ts                       Compact light MUI theme
  App.tsx                        Full-height 2×2 layout; instantiates one controller/scenario
  components/
    useLatencySeries.ts          Controller hook: multi-select comparison set + stable colors
    TableCard.tsx                Paper wrapper around NestedDataGrid
    ChartCard.tsx                Paper wrapper around LatencyChart (+ placeholder / loading)
    NestedDataGrid/
      NestedDataGrid.tsx         The reusable grid; builds column model, wires DataGrid
      useNestedRows.ts           Tree state: lazy children, expand set, sort, flatten → rows
      TreeCell.tsx               Indented name cell + expand/collapse arrow
      EyeCell.tsx                Eye toggle (show/hide a row on the chart)
      types.ts                   TREE_FIELD, NestedLevel, RowActivatePath, FlatRow
      index.ts                   Public exports
    chart/
      EChart.tsx                 Minimal bare-echarts React wrapper
      LatencyChart.tsx           Dual-axis latency chart (ChartEntity[] → ECharts option)
  scenarios/
    types.ts                     ScenarioConfig
    columns.ts                   metricCol / textCol helpers + shared metricCols
    participantUser.ts           participantScenario (2 levels)
    nodeInstanceUser.ts          nodeScenario (3 levels)
```

## Adding a new scenario

Create a `ScenarioConfig` (see `src/scenarios/participantUser.ts`): give it a
`levels[]` (columns per depth), a `treeHeader`, and bind `fetchRoot`/`fetchChildren`/
`fetchSeries` from `mockApi`. Then add a `useLatencySeries` controller + a
`TableCard`/`ChartCard` pair in `App.tsx`. No changes to `NestedDataGrid`,
`LatencyChart`, or the controller are needed — they are generic.

## Key behaviors to preserve

- **Eye icon (leftmost column)** toggles a row on/off the chart. Turning one **on**
  also pulls in its ancestors (a user brings its participant); turning it **off**
  removes only that row. Multiple rows compare at once.
- **Double-click a row** = focus: replace the comparison set with just that row's
  lineage (row + ancestors).
- **Sorting** sorts siblings *within each parent* (tree stays intact) — this is why
  the grid uses `sortingMode="server"` and sorts in `useNestedRows`.
- **Chart**: each entity has one stable color (matching its eye); metric is shown by
  line style — med solid / avg dashed / max dotted. avg+med on the LEFT axis, max on
  the RIGHT axis. Only medians are visible by default; the legend toggles avg/max.
  There is a zoom slider + toolbox.
