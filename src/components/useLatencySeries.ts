import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartEntity } from './chart/LatencyChart';
import type { RowActivatePath } from './NestedDataGrid';
import type { EntityNode, MinutePoint } from '../types';

// Distinct, stable hues for comparison. Each shown entity claims one.
const PALETTE = [
  '#2563eb', // blue
  '#0891b2', // cyan
  '#d97706', // amber
  '#7c3aed', // violet
  '#16a34a', // green
  '#db2777', // pink
  '#dc2626', // red
  '#4f46e5', // indigo
];

interface Meta {
  label: string;
  depth: number;
}

type ColorMap = Record<string, string>;

function assignMissingColors(colors: ColorMap, ids: string[]): ColorMap {
  let next = colors;
  const used = new Set(Object.values(colors));
  for (const id of ids) {
    if (next[id]) continue;
    if (next === colors) next = { ...colors };
    const color = PALETTE.find((candidate) => !used.has(candidate)) ?? PALETTE[used.size % PALETTE.length];
    next[id] = color;
    used.add(color);
  }
  return next;
}

function colorsForLineage(nodes: EntityNode[]): ColorMap {
  return nodes.reduce<ColorMap>((acc, node, index) => {
    acc[node.id] = PALETTE[index % PALETTE.length];
    return acc;
  }, {});
}

/**
 * Owns the chart's comparison set for one scenario. Any number of rows can be
 * shown at once; each shown entity keeps a stable color (matched to its eye).
 *
 * - `toggleShown` (eye): turning a row on also pulls in its ancestors (e.g. a
 *   user brings its participant); turning it off removes only that row. This
 *   lets you start from "participant + user" and then prune/add freely.
 * - `focus`: replaces the set with just this row's lineage.
 */
export function useLatencySeries(fetchSeries: (id: string) => Promise<MinutePoint[]>) {
  const [shownIdList, setShownIdList] = useState<string[]>([]);
  const [metaById, setMetaById] = useState<Record<string, Meta>>({});
  const [seriesById, setSeriesById] = useState<Record<string, MinutePoint[]>>({});
  const [colorById, setColorById] = useState<ColorMap>({});

  const requestedRef = useRef<Set<string>>(new Set());

  const ensureSeries = useCallback(
    (node: EntityNode) => {
      setMetaById((m) => (m[node.id] ? m : { ...m, [node.id]: { label: node.name, depth: node.level } }));
      if (requestedRef.current.has(node.id)) return;
      requestedRef.current.add(node.id);
      fetchSeries(node.id).then((series) => {
        setSeriesById((s) => ({ ...s, [node.id]: series }));
      });
    },
    [fetchSeries],
  );

  const toggleShown = useCallback(
    ({ node, ancestors }: RowActivatePath) => {
      if (shownIdList.includes(node.id)) {
        setShownIdList((prev) => prev.filter((id) => id !== node.id));
        setColorById((prev) => {
          if (!prev[node.id]) return prev;
          const next = { ...prev };
          delete next[node.id];
          return next;
        });
        return;
      }
      const toAdd = [...ancestors, node]; // ancestors come along by default
      toAdd.forEach(ensureSeries);
      setColorById((prev) => assignMissingColors(prev, toAdd.map((n) => n.id)));
      setShownIdList((prev) => {
        const next = [...prev];
        for (const n of toAdd) if (!next.includes(n.id)) next.push(n.id);
        return next;
      });
    },
    [ensureSeries, shownIdList],
  );

  const focus = useCallback(
    ({ node, ancestors }: RowActivatePath) => {
      const lineage = [...ancestors, node];
      lineage.forEach(ensureSeries);
      setColorById(colorsForLineage(lineage));
      setShownIdList(lineage.map((n) => n.id));
    },
    [ensureSeries],
  );

  const clear = useCallback(() => {
    setShownIdList([]);
    setColorById({});
  }, []);

  const colorOf = useCallback((id: string) => colorById[id], [colorById]);
  const shownIds = useMemo(() => new Set(shownIdList), [shownIdList]);

  const entities = useMemo<ChartEntity[]>(
    () =>
      shownIdList
        .filter((id) => seriesById[id] && metaById[id])
        .map((id) => ({
          key: id,
          label: metaById[id].label,
          depth: metaById[id].depth,
          color: colorById[id] ?? PALETTE[0],
          series: seriesById[id],
        })),
    [shownIdList, seriesById, metaById, colorById],
  );

  const loading = shownIdList.some((id) => !seriesById[id]);

  return { entities, loading, shownIds, toggleShown, focus, colorOf, clear };
}
