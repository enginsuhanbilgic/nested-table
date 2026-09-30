import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridSortModel } from '@mui/x-data-grid';
import type { EntityNode, PageRequest, PageSort, PagedResult } from '../../types';
import type { FlatRow } from './types';
import { TREE_FIELD } from './types';

const DEFAULT_PAGE_SIZE = 10;

interface Args {
  fetchRoot: (request: PageRequest) => Promise<PagedResult<EntityNode>>;
  fetchChildren: (parentId: string, request: PageRequest) => Promise<PagedResult<EntityNode>>;
  /** Ids currently displayed on the chart (drives the eye icon + row highlight). */
  shownIds: Set<string>;
}

interface PageState {
  rows: EntityNode[];
  total: number;
  nextPage: number | null;
  loading: boolean;
}

const emptyPageState = (loading = false): PageState => ({
  rows: [],
  total: 0,
  nextPage: 0,
  loading,
});

const sortFromModel = (sortModel: GridSortModel): PageSort | undefined => {
  const sort = sortModel[0];
  return sort?.sort ? { field: sort.field, direction: sort.sort } : undefined;
};

const requestKey = (scope: string, page: number, sort?: PageSort) =>
  `${scope}:${page}:${sort?.field ?? ''}:${sort?.direction ?? ''}`;

function mergeById(existing: EntityNode[], incoming: EntityNode[], page: number): EntityNode[] {
  if (page === 0) return incoming;
  const seen = new Set(existing.map((node) => node.id));
  return [...existing, ...incoming.filter((node) => !seen.has(node.id))];
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
    _kind: 'node',
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

function toLoaderRow(
  parentId: string | null,
  depth: number,
  nextPage: number,
  loading: boolean,
): FlatRow {
  return {
    id: `__load__:${parentId ?? 'root'}:${nextPage}`,
    [TREE_FIELD]: 'Loading more rows...',
    _kind: 'loader',
    _depth: depth,
    _hasChildren: false,
    _expanded: false,
    _loading: loading,
    _shown: false,
    _ancestors: [],
    _parentId: parentId,
    _nextPage: nextPage,
  };
}

/**
 * Owns nested-tree state for the grid. Data is loaded a page at a time for both
 * roots and child sibling groups, then flattened for the virtualized DataGrid.
 */
export function useNestedRows({ fetchRoot, fetchChildren, shownIds }: Args) {
  const [rootState, setRootState] = useState<PageState>(() => emptyPageState(true));
  const [childrenState, setChildrenState] = useState<Record<string, PageState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  const requested = useRef<Set<string>>(new Set());
  const sort = useMemo(() => sortFromModel(sortModel), [sortModel]);

  useEffect(() => {
    let alive = true;
    const key = requestKey('root', 0, sort);
    requested.current.add(key);
    fetchRoot({ page: 0, pageSize: DEFAULT_PAGE_SIZE, sort }).then((result) => {
      if (!alive) return;
      setRootState({
        rows: result.rows,
        total: result.total,
        nextPage: result.nextPage,
        loading: false,
      });
    });
    return () => {
      alive = false;
    };
  }, [fetchRoot, sort]);

  const loadRootPage = useCallback(
    (page: number) => {
      if (rootState.loading || page == null) return;
      const key = requestKey('root', page, sort);
      if (requested.current.has(key)) return;
      requested.current.add(key);
      setRootState((prev) => ({ ...prev, loading: true }));
      fetchRoot({ page, pageSize: DEFAULT_PAGE_SIZE, sort }).then((result) => {
        setRootState((prev) => ({
          rows: mergeById(prev.rows, result.rows, page),
          total: result.total,
          nextPage: result.nextPage,
          loading: false,
        }));
      });
    },
    [fetchRoot, rootState.loading, sort],
  );

  const loadChildrenPage = useCallback(
    (parentId: string, page: number) => {
      const state = childrenState[parentId] ?? emptyPageState();
      if (state.loading || page == null) return;
      const key = requestKey(`children:${parentId}`, page, sort);
      if (requested.current.has(key)) return;
      requested.current.add(key);
      setChildrenState((prev) => ({
        ...prev,
        [parentId]: { ...(prev[parentId] ?? emptyPageState()), loading: true },
      }));
      fetchChildren(parentId, { page, pageSize: DEFAULT_PAGE_SIZE, sort }).then((result) => {
        setChildrenState((prev) => {
          const current = prev[parentId] ?? emptyPageState();
          return {
            ...prev,
            [parentId]: {
              rows: mergeById(current.rows, result.rows, page),
              total: result.total,
              nextPage: result.nextPage,
              loading: false,
            },
          };
        });
      });
    },
    [childrenState, fetchChildren, sort],
  );

  const toggle = useCallback(
    (id: string) => {
      const willExpand = !expanded.has(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (willExpand) next.add(id);
        else next.delete(id);
        return next;
      });
      if (willExpand && !childrenState[id]) loadChildrenPage(id, 0);
    },
    [childrenState, expanded, loadChildrenPage],
  );

  const loadMoreForRow = useCallback(
    (row: FlatRow) => {
      if (row._kind !== 'loader' || row._nextPage == null) return;
      if (row._parentId) loadChildrenPage(row._parentId, row._nextPage);
      else loadRootPage(row._nextPage);
    },
    [loadChildrenPage, loadRootPage],
  );

  const handleSortModelChange = useCallback((model: GridSortModel) => {
    requested.current.clear();
    setExpanded(new Set());
    setChildrenState({});
    setRootState(emptyPageState(true));
    setSortModel(model);
  }, []);

  const rows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    const walk = (nodes: EntityNode[], ancestors: EntityNode[]) => {
      for (const node of nodes) {
        const isExpanded = expanded.has(node.id);
        const childState = childrenState[node.id];
        const childLoading = childState?.loading && childState.rows.length === 0;
        out.push(
          toFlatRow(node, ancestors, isExpanded, Boolean(childLoading), shownIds.has(node.id)),
        );
        if (isExpanded && childState) {
          const childAncestors = [...ancestors, node];
          walk(childState.rows, childAncestors);
          if (childState.nextPage != null) {
            out.push(
              toLoaderRow(node.id, node.level + 1, childState.nextPage, childState.loading),
            );
          }
        }
      }
    };

    walk(rootState.rows, []);
    if (rootState.nextPage != null) {
      out.push(toLoaderRow(null, 0, rootState.nextPage, rootState.loading));
    }
    return out;
  }, [childrenState, expanded, rootState, shownIds]);

  return {
    rows,
    toggle,
    rootLoading: rootState.loading && rootState.rows.length === 0,
    sortModel,
    setSortModel: handleSortModelChange,
    loadMoreForRow,
  };
}
