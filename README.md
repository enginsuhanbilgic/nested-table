# Nested Latency Explorer

A React + TypeScript + Vite app that pairs a **reusable nested-row data grid**
(built on the free MUI X Data Grid) with **Apache ECharts** latency charts. It shows
two hierarchies side by side, each with its own chart:

- **Participants → Users** (2 levels)
- **Gateway Nodes → Instances → Users** (3 levels)

Each entity has a daily avg/med/max latency (grid columns) and a minute-by-minute
series from 09:30→18:00 (the chart). All data is mock/generated — there is no backend.

## Features

- **Nested rows with different columns per level**, arbitrary depth, lazy-loaded on
  expand — on the free (MIT) Data Grid, no Pro license.
- **Sorting** that keeps the tree intact (siblings sort within their parent).
- **Pagination** and per-level row background tints.
- **Eye icon per row** to show/compare any set of rows on the chart. Turning a row on
  brings its ancestors along by default, but each is independently removable — so you
  can compare, say, several users without their participant.
- **Dual-axis chart**: avg/med on the left, max on the right; each entity gets its own
  color (matching its eye), each metric a line style (med solid / avg dashed / max
  dotted). Median-first, with a legend toggle, a zoom slider, and a toolbox.
- Full-height layout: tables row and charts row split the viewport 50/50.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check + production build
npm run preview   # serve the production build
```

## Tech stack

React 19 · TypeScript · **Vite 7** (see note below) · MUI 9 + MUI X Data Grid 9
(Community) · Apache ECharts 6.

> **Note:** Pinned to Vite 7 on purpose — Vite 8's rolldown bundler cannot build
> MUI's `export *` chain yet. Do not upgrade to Vite 8. See
> [CLAUDE.md](CLAUDE.md#critical-constraints-do-not-fix-these).

## For contributors / AI agents

- [CLAUDE.md](CLAUDE.md) — orientation, commands, constraints, conventions, file map.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data flow and how the nested grid,
  comparison controller, and chart work.
