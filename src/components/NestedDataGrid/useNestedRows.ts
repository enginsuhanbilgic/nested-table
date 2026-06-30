import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridSortModel } from '@mui/x-data-grid';
import type { EntityNode } from '../../api/mockApi';
import type { FlatRow } from './types';
import { TREE_FIELD } from './types';

/** Resolve the sortable value for a node + column field across heterogeneous levels. */
function sortValue(node: EntityNode, field: string): string | number | undefined {
  if (field === TREE_FIELD) return node.name;
  if (field === 'avg' || field === 'med' || field === 'max') return node.daily[field];
  return node.extra[field];
}

/**
 * Sort a single set of siblings by the active sort model. Sorting per sibling
 * group (rather than the whole flattened list) keeps the parent→child tree
 * intact while still ordering rows. Levels that lack the field sort to the end.
 */
function sortSiblings(nodes: EntityNode[], sortModel: GridSortModel): EntityNode[] {
  const sort = sortModel[0];
  if (!sort || !sort.sort) return nodes;
  const dir = sort.sort === 'desc' ? -1 : 1;
  return [...nodes].sort((a, b) => {
    const av = sortValue(a, sort.field);
    const bv = sortValue(b, sort.field);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

interface Args {
  fetchRoot: () => Promise<EntityNode[]>;
  fetchChildren: (parentId: string) => Promise<EntityNode[]>;
  /** Ids currently displayed on the chart (drives the eye icon + row highlight). */
  shownIds: Set<string>;
}

function toFlatRow(
  node: EntityNode,
  ancestors: EntityNode[],
  expanded: boolean,
  loading: boolean,
  shown: boolean,
): FlatRow {
  return {
    id: node.id,
    [TREE_FIELD]: node.name,
    _depth: node.level,
    _hasChildren: node.hasChildren,
    _expanded: expanded,
    _loading: loading,
    _shown: shown,
    _node: node,
    _ancestors: ancestors,
    avg: node.daily.avg,
    med: node.daily.med,
    max: node.daily.max,
    ...node.extra,
  };
}

/**
 * Owns the nested-tree state for the grid: top-level rows, a lazily-loaded
 * children cache, and the expand/collapse set. Returns a flattened row array
 * (only descendants of expanded rows are included) plus a `toggle` handler.
 */
export function useNestedRows({ fetchRoot, fetchChildren, shownIds }: Args) {
  const [roots, setRoots] = useState<EntityNode[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<string, EntityNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [rootLoading, setRootLoading] = useState(true);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // Mirror of `expanded` so the click handler can read the latest value.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  // Guards against duplicate child fetches for the same parent.
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setRootLoading(true);
    fetchRoot().then((r) => {
      if (!alive) return;
      setRoots(r);
      setRootLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchRoot]);

  const ensureChildren = useCallback(
    (id: string) => {
      if (requested.current.has(id)) return;
      requested.current.add(id);
      setLoading((prev) => new Set(prev).add(id));
      fetchChildren(id).then((kids) => {
        setChildrenMap((m) => ({ ...m, [id]: kids }));
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    },
    [fetchChildren],
  );

  const toggle = useCallback(
    (id: string) => {
      const willExpand = !expandedRef.current.has(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (willExpand) next.add(id);
        else next.delete(id);
        return next;
      });
      if (willExpand) ensureChildren(id);
    },
    [ensureChildren],
  );

  const rows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    const walk = (nodes: EntityNode[], ancestors: EntityNode[]) => {
      for (const node of sortSiblings(nodes, sortModel)) {
        const isExpanded = expanded.has(node.id);
        out.push(
          toFlatRow(node, ancestors, isExpanded, loading.has(node.id), shownIds.has(node.id)),
        );
        if (isExpanded) {
          const kids = childrenMap[node.id];
          if (kids) walk(kids, [...ancestors, node]);
        }
      }
    };
    walk(roots, []);
    return out;
  }, [roots, childrenMap, expanded, loading, sortModel, shownIds]);

  return { rows, toggle, rootLoading, sortModel, setSortModel };
}
