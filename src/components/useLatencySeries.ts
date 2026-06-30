import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartEntity } from './chart/LatencyChart';
import type { RowActivatePath } from './NestedDataGrid';
import type { EntityNode, MinutePoint } from '../api/mockApi';

// Distinct, stable hues for comparison. Each shown entity claims one.
const PALETTE = [
  '#13c2c2', // teal
  '#1677ff', // blue
  '#fa8c16', // orange
  '#722ed1', // purple
  '#52c41a', // green
  '#eb2f96', // magenta
  '#13a8a8', // dark teal
  '#faad14', // gold
];

interface Meta {
  label: string;
  depth: number;
}

/**
 * Owns the chart's comparison set for one scenario. Any number of rows can be
 * shown at once; each shown entity keeps a stable color (matched to its eye).
 *
 * - `toggleShown` (eye): turning a row on also pulls in its ancestors (e.g. a
 *   user brings its participant); turning it off removes only that row. This
 *   lets you start from "participant + user" and then prune/add freely.
 * - `focus` (double-click): replaces the set with just this row's lineage.
 */
export function useLatencySeries(fetchSeries: (id: string) => Promise<MinutePoint[]>) {
  const [shownIdList, setShownIdList] = useState<string[]>([]);
  const [metaById, setMetaById] = useState<Record<string, Meta>>({});
  const [seriesById, setSeriesById] = useState<Record<string, MinutePoint[]>>({});

  const shownRef = useRef<string[]>(shownIdList);
  shownRef.current = shownIdList;
  const requestedRef = useRef<Set<string>>(new Set());

  // Stable color assignment: claim the lowest free palette slot per id.
  const colorById = useRef<Map<string, string>>(new Map());
  const freeColors = useRef<string[]>([...PALETTE]);

  const acquireColor = useCallback((id: string) => {
    if (colorById.current.has(id)) return;
    const color = freeColors.current.shift() ?? PALETTE[colorById.current.size % PALETTE.length];
    colorById.current.set(id, color);
  }, []);

  const releaseColor = useCallback((id: string) => {
    const color = colorById.current.get(id);
    if (!color) return;
    colorById.current.delete(id);
    if (!freeColors.current.includes(color)) freeColors.current.unshift(color);
  }, []);

  const ensureSeries = useCallback(
    (node: EntityNode) => {
      acquireColor(node.id);
      setMetaById((m) => (m[node.id] ? m : { ...m, [node.id]: { label: node.name, depth: node.level } }));
      if (requestedRef.current.has(node.id)) return;
      requestedRef.current.add(node.id);
      fetchSeries(node.id).then((series) => {
        setSeriesById((s) => ({ ...s, [node.id]: series }));
      });
    },
    [acquireColor, fetchSeries],
  );

  const toggleShown = useCallback(
    ({ node, ancestors }: RowActivatePath) => {
      if (shownRef.current.includes(node.id)) {
        releaseColor(node.id);
        setShownIdList((prev) => prev.filter((id) => id !== node.id));
        return;
      }
      const toAdd = [...ancestors, node]; // ancestors come along by default
      toAdd.forEach(ensureSeries);
      setShownIdList((prev) => {
        const next = [...prev];
        for (const n of toAdd) if (!next.includes(n.id)) next.push(n.id);
        return next;
      });
    },
    [ensureSeries, releaseColor],
  );

  const focus = useCallback(
    ({ node, ancestors }: RowActivatePath) => {
      const lineage = [...ancestors, node];
      // Reset colors so the focused lineage gets the first palette slots.
      colorById.current.clear();
      freeColors.current = [...PALETTE];
      lineage.forEach(ensureSeries);
      setShownIdList(lineage.map((n) => n.id));
    },
    [ensureSeries],
  );

  const colorOf = useCallback((id: string) => colorById.current.get(id), []);
  const shownIds = useMemo(() => new Set(shownIdList), [shownIdList]);

  const entities = useMemo<ChartEntity[]>(
    () =>
      shownIdList
        .filter((id) => seriesById[id] && metaById[id])
        .map((id) => ({
          key: id,
          label: metaById[id].label,
          depth: metaById[id].depth,
          color: colorById.current.get(id) ?? PALETTE[0],
          series: seriesById[id],
        })),
    [shownIdList, seriesById, metaById],
  );

  const loading = shownIdList.some((id) => !seriesById[id]);

  return { entities, loading, shownIds, toggleShown, focus, colorOf };
}
