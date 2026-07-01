/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption, LineSeriesOption } from "echarts";
import { DataGrid, useGridApiRef } from "@mui/x-data-grid";
import type {
  GridColDef,
  GridEventListener,
  GridRenderCellParams,
  GridSortModel,
} from "@mui/x-data-grid";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ClearIcon from "@mui/icons-material/Clear";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type {
  GatewayLatencyItem,
  GatewayLatencyResponse,
  InstanceLatencyItem,
  InstanceLatencyResponse,
  Location,
  Market,
  NestedLatencyEntityType,
  NestedLatencyFilterOptions,
  NestedLatencyFilters,
  NestedLatencyMetricFields,
  NestedLatencySeriesIdentity,
  NestedLatencySeriesPoint,
  NestedUserLatencyItem,
  NestedUserLatencyResponse,
  PageResponse,
  ParticipantLatencyItem,
  ParticipantLatencyResponse,
  Partition,
  Protocol,
} from "../types/latency";
import { DateDayPicker } from "../components/common/DateDayPicker";
import { MultiSelectFilter } from "../components/common/MultiSelectFilter";
import { TextInputFilterWithDebounce } from "../components/common/TextInputFilterWithDebounce";
import { useSidebar } from "../contexts/SidebarContext";
import { useChartResize } from "../hooks/useChartResize";
import {
  getNestedGatewayInstances,
  getNestedGatewayNodes,
  getNestedInstanceUsers,
  getNestedLatencyFilterOptions,
  getNestedLatencySeries,
  getNestedParticipants,
  getNestedParticipantUsers,
} from "../services/latencyService";
import { getDefaultToDate, numberFormatter } from "../services/utilService";
import { CHART_COLORS } from "../theme/bistTheme";

type HierarchyKind = "gateway" | "participant";
type MetricKey = keyof NestedLatencyMetricFields;
type PageModel = { page: number; pageSize: number };
type NodeEntityType = Exclude<NestedLatencyEntityType, "user">;

type ParentFetchMeta = {
  id: string;
  entityType: NodeEntityType;
  name: string;
  gatewayName?: string;
  instanceName?: string;
  participantName?: string;
  depth: number;
};

type NestedLatencyGridRow = Partial<
  GatewayLatencyItem &
    InstanceLatencyItem &
    ParticipantLatencyItem &
    NestedUserLatencyItem
> & {
  id: string;
  kind: "node" | "loader";
  entityType?: NestedLatencyEntityType;
  label: string;
  chartLabel: string;
  levelLabel: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  loadingChildren: boolean;
  selected: boolean;
  loadingMore?: boolean;
  nextPage?: number;
  identity?: NestedLatencySeriesIdentity;
  fetchMeta?: ParentFetchMeta;
  parentMeta?: ParentFetchMeta | null;
};

type PageState = {
  rows: NestedLatencyGridRow[];
  total: number;
  nextPage: number | null;
  loading: boolean;
};

type ChartEntity = NestedLatencySeriesIdentity & {
  id: string;
  label: string;
  color: string;
  series: NestedLatencySeriesPoint[];
};
type PageMeta = Pick<PageResponse<unknown>, "last" | "page" | "totalElements">;

const PAGE_SIZE = 25;
const MAX_CHART_SERIES = 6;
const MICROSECOND_UNIT = "\u00b5s";

const compactLatencyFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const LEVEL_TAG_STYLES: Record<
  string,
  { bgcolor: string; color: string; borderColor: string }
> = {
  Gateway: { bgcolor: "#e0f2fe", color: "#075985", borderColor: "#7dd3fc" },
  Instance: { bgcolor: "#fef3c7", color: "#92400e", borderColor: "#fbbf24" },
  Participant: { bgcolor: "#dcfce7", color: "#166534", borderColor: "#86efac" },
  User: { bgcolor: "#f3e8ff", color: "#6b21a8", borderColor: "#d8b4fe" },
};

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "me_med", label: "ME Med" },
  { value: "me_avg", label: "ME Avg" },
  { value: "me_max", label: "ME Max" },
  { value: "gw_med", label: "GW Med" },
  { value: "gw_avg", label: "GW Avg" },
  { value: "gw_max", label: "GW Max" },
];

const EMPTY_PAGE_STATE: PageState = {
  rows: [],
  total: 0,
  nextPage: 0,
  loading: false,
};

function makeId(...parts: Array<number | string | undefined>) {
  return parts.map((part) => encodeURIComponent(String(part ?? ""))).join(":");
}

function getNextPage(response: Pick<PageMeta, "last" | "page">) {
  return response.last ? null : response.page + 1;
}

function mergeRows(
  currentRows: NestedLatencyGridRow[],
  incomingRows: NestedLatencyGridRow[],
  page: number,
) {
  if (page === 0) {
    return incomingRows;
  }

  const seen = new Set(currentRows.map((row) => row.id));
  return [
    ...currentRows,
    ...incomingRows.filter((row) => !seen.has(row.id)),
  ];
}

function toPageState(
  response: PageMeta,
  rows: NestedLatencyGridRow[],
  page: number,
  currentRows: NestedLatencyGridRow[] = [],
): PageState {
  return {
    rows: mergeRows(currentRows, rows, page),
    total: response.totalElements,
    nextPage: getNextPage(response),
    loading: false,
  };
}

function toGatewayRow(item: GatewayLatencyItem): NestedLatencyGridRow {
  const id = makeId("gateway", item.name);
  const fetchMeta: ParentFetchMeta = {
    id,
    entityType: "gateway",
    name: item.name,
    gatewayName: item.name,
    depth: 0,
  };

  return {
    ...item,
    id,
    kind: "node",
    entityType: "gateway",
    label: item.name,
    chartLabel: item.name,
    levelLabel: "Gateway",
    depth: 0,
    hasChildren: item.num_instances > 0,
    expanded: false,
    loadingChildren: false,
    selected: false,
    identity: {
      entityType: "gateway",
      name: item.name,
      gatewayName: item.name,
    },
    fetchMeta,
  };
}

function toInstanceRow(item: InstanceLatencyItem): NestedLatencyGridRow {
  const id = makeId("gateway", item.gateway_name, "instance", item.name);
  const fetchMeta: ParentFetchMeta = {
    id,
    entityType: "instance",
    name: item.name,
    gatewayName: item.gateway_name,
    instanceName: item.name,
    depth: 1,
  };

  return {
    ...item,
    id,
    kind: "node",
    entityType: "instance",
    label: item.name,
    chartLabel: `${item.gateway_name} / ${item.name}`,
    levelLabel: "Instance",
    depth: 1,
    hasChildren: item.num_users > 0,
    expanded: false,
    loadingChildren: false,
    selected: false,
    identity: {
      entityType: "instance",
      name: item.name,
      gatewayName: item.gateway_name,
      instanceName: item.name,
    },
    fetchMeta,
  };
}

function toParticipantRow(item: ParticipantLatencyItem): NestedLatencyGridRow {
  const id = makeId("participant", item.name);
  const fetchMeta: ParentFetchMeta = {
    id,
    entityType: "participant",
    name: item.name,
    participantName: item.name,
    depth: 0,
  };

  return {
    ...item,
    id,
    kind: "node",
    entityType: "participant",
    label: item.name,
    chartLabel: item.name,
    levelLabel: "Participant",
    depth: 0,
    hasChildren: item.num_users > 0,
    expanded: false,
    loadingChildren: false,
    selected: false,
    identity: {
      entityType: "participant",
      name: item.name,
      participantName: item.name,
    },
    fetchMeta,
  };
}

function toInstanceUserRow(item: NestedUserLatencyItem): NestedLatencyGridRow {
  const gatewayName = item.gw_node ?? "";
  const instanceName = item.node_instance ?? "";
  const id = makeId(
    "gateway",
    gatewayName,
    "instance",
    instanceName,
    "user",
    item.name,
    item.port,
  );

  return {
    ...item,
    id,
    kind: "node",
    entityType: "user",
    label: item.name,
    chartLabel: `${gatewayName} / ${instanceName} / ${item.name}`,
    levelLabel: "User",
    depth: 2,
    hasChildren: false,
    expanded: false,
    loadingChildren: false,
    selected: false,
    identity: {
      entityType: "user",
      name: item.name,
      participantName: item.participant_name,
      gatewayName,
      instanceName,
    },
  };
}

function toParticipantUserRow(
  item: NestedUserLatencyItem,
  participantName: string,
): NestedLatencyGridRow {
  const id = makeId(
    "participant",
    participantName,
    "user",
    item.name,
    item.port,
  );

  return {
    ...item,
    id,
    kind: "node",
    entityType: "user",
    label: item.name,
    chartLabel: `${participantName} / ${item.name}`,
    levelLabel: "User",
    depth: 1,
    hasChildren: false,
    expanded: false,
    loadingChildren: false,
    selected: false,
    identity: {
      entityType: "user",
      name: item.name,
      participantName: item.participant_name ?? participantName,
      gatewayName: item.gw_node,
      instanceName: item.node_instance,
    },
  };
}

function toLoaderRow(
  parentMeta: ParentFetchMeta | null,
  depth: number,
  nextPage: number,
  loading: boolean,
): NestedLatencyGridRow {
  return {
    id: makeId("loader", parentMeta?.id ?? "root", nextPage),
    kind: "loader",
    label: loading ? "Loading rows" : "Load more rows",
    chartLabel: "",
    levelLabel: "",
    depth,
    hasChildren: false,
    expanded: false,
    loadingChildren: false,
    selected: false,
    loadingMore: loading,
    nextPage,
    parentMeta,
  };
}

function formatTime(point: NestedLatencySeriesPoint) {
  return `${String(point.hour).padStart(2, "0")}:${String(point.minute).padStart(2, "0")}`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null) {
    return "";
  }

  return numberFormatter.format(value);
}

function formatLatency(value: number | null | undefined, compact = false) {
  if (value == null) {
    return "";
  }

  const formatter =
    compact && Math.abs(value) >= 100_000
      ? compactLatencyFormatter
      : numberFormatter;

  return `${formatter.format(Math.round(value))} ${MICROSECOND_UNIT}`;
}

function formatLatencyDetail(value: number | null | undefined) {
  if (value == null) {
    return "";
  }

  if (Math.abs(value) >= 1_000_000) {
    return `${formatLatency(value)} (${(value / 1_000_000).toLocaleString(
      "en-US",
      { maximumFractionDigits: 2 },
    )} s)`;
  }

  return formatLatency(value);
}

function shouldUseLogScale(values: number[]) {
  const positiveValues = values.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (positiveValues.length < 2) {
    return false;
  }

  const min = Math.min(...positiveValues);
  const max = Math.max(...positiveValues);

  return max >= 1_000_000 && max / Math.max(min, 1) >= 1_000;
}

function getLatencyClass(value: unknown) {
  if (typeof value !== "number") {
    return "";
  }

  if (value >= 10_000_000) {
    return "latency-critical";
  }

  if (value >= 1_000_000) {
    return "latency-high";
  }

  if (value >= 100_000) {
    return "latency-warn";
  }

  return "latency-good";
}

function useNestedLatencyRows({
  hierarchy,
  filters,
  filtersReady,
  selectedIds,
  onError,
}: {
  hierarchy: HierarchyKind;
  filters: NestedLatencyFilters;
  filtersReady: boolean;
  selectedIds: Set<string>;
  onError: (message: string | null) => void;
}) {
  const [rootState, setRootState] = useState<PageState>(EMPTY_PAGE_STATE);
  const [childrenState, setChildrenState] = useState<Record<string, PageState>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const requestVersion = useRef(0);
  const requested = useRef<Set<string>>(new Set());

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const fetchRootPage = useCallback(
    async (page: number, version: number) => {
      const pageModel: PageModel = { page, pageSize: PAGE_SIZE };

      if (hierarchy === "gateway") {
        const response: GatewayLatencyResponse = await getNestedGatewayNodes(
          filters,
          pageModel,
          sortModel,
        );
        if (version !== requestVersion.current) {
          return;
        }
        const rows = response.content.map(toGatewayRow);
        setRootState((current) =>
          toPageState(response, rows, page, current.rows),
        );
        return;
      }

      const response: ParticipantLatencyResponse = await getNestedParticipants(
        filters,
        pageModel,
        sortModel,
      );
      if (version !== requestVersion.current) {
        return;
      }
      const rows = response.content.map(toParticipantRow);
      setRootState((current) => toPageState(response, rows, page, current.rows));
    },
    [filters, hierarchy, sortModel],
  );

  useEffect(() => {
    requestVersion.current += 1;
    requested.current.clear();
    setExpanded(new Set());
    setChildrenState({});

    if (!filtersReady) {
      setRootState({ ...EMPTY_PAGE_STATE, nextPage: null });
      return;
    }

    const version = requestVersion.current;
    const key = `${hierarchy}:root:0:${JSON.stringify(sortModel)}`;
    requested.current.add(key);
    setRootState({ ...EMPTY_PAGE_STATE, loading: true });

    void fetchRootPage(0, version).catch((error) => {
      if (version !== requestVersion.current) {
        return;
      }
      console.error(error);
      setRootState((current) => ({ ...current, loading: false }));
      onError(`Could not load ${hierarchy} latency rows`);
    });
  }, [fetchRootPage, filterKey, filtersReady, hierarchy, onError, sortModel]);

  const loadRootPage = useCallback(
    (page: number) => {
      if (!filtersReady || rootState.loading) {
        return;
      }

      const key = `${hierarchy}:root:${page}:${JSON.stringify(sortModel)}`;
      if (requested.current.has(key)) {
        return;
      }

      requested.current.add(key);
      const version = requestVersion.current;
      setRootState((current) => ({ ...current, loading: true }));

      void fetchRootPage(page, version).catch((error) => {
        if (version !== requestVersion.current) {
          return;
        }
        console.error(error);
        setRootState((current) => ({ ...current, loading: false }));
        onError(`Could not load more ${hierarchy} latency rows`);
      });
    },
    [
      fetchRootPage,
      filtersReady,
      hierarchy,
      onError,
      rootState.loading,
      sortModel,
    ],
  );

  const loadChildrenPage = useCallback(
    (parentMeta: ParentFetchMeta, page: number) => {
      if (!filtersReady) {
        return;
      }

      const currentState = childrenState[parentMeta.id];
      if (currentState?.loading) {
        return;
      }

      const key = `${hierarchy}:children:${parentMeta.id}:${page}:${JSON.stringify(sortModel)}`;
      if (requested.current.has(key)) {
        return;
      }

      requested.current.add(key);
      const version = requestVersion.current;
      const pageModel: PageModel = { page, pageSize: PAGE_SIZE };

      setChildrenState((current) => ({
        ...current,
        [parentMeta.id]: {
          ...(current[parentMeta.id] ?? EMPTY_PAGE_STATE),
          loading: true,
        },
      }));

      const resolveRows = async () => {
        if (parentMeta.entityType === "gateway") {
          const response: InstanceLatencyResponse =
            await getNestedGatewayInstances(
              {
                ...filters,
                gatewayName: parentMeta.gatewayName ?? parentMeta.name,
              },
              pageModel,
              sortModel,
            );
          return {
            response,
            rows: response.content.map(toInstanceRow),
          };
        }

        if (parentMeta.entityType === "instance") {
          const response: NestedUserLatencyResponse =
            await getNestedInstanceUsers(
              {
                ...filters,
                gatewayName: parentMeta.gatewayName ?? "",
                instanceName: parentMeta.instanceName ?? parentMeta.name,
              },
              pageModel,
              sortModel,
            );
          return {
            response,
            rows: response.content.map(toInstanceUserRow),
          };
        }

        const participantName =
          parentMeta.participantName ?? parentMeta.name;
        const response: NestedUserLatencyResponse =
          await getNestedParticipantUsers(
            {
              ...filters,
              participantName,
            },
            pageModel,
            sortModel,
          );
        return {
          response,
          rows: response.content.map((item) =>
            toParticipantUserRow(item, participantName),
          ),
        };
      };

      void resolveRows()
        .then(({ response, rows }) => {
          if (version !== requestVersion.current) {
            return;
          }

          setChildrenState((current) => {
            const currentPageState =
              current[parentMeta.id] ?? EMPTY_PAGE_STATE;
            return {
              ...current,
              [parentMeta.id]: toPageState(
                response,
                rows,
                page,
                currentPageState.rows,
              ),
            };
          });
        })
        .catch((error) => {
          if (version !== requestVersion.current) {
            return;
          }
          console.error(error);
          setChildrenState((current) => ({
            ...current,
            [parentMeta.id]: {
              ...(current[parentMeta.id] ?? EMPTY_PAGE_STATE),
              loading: false,
            },
          }));
          onError(`Could not load children for ${parentMeta.name}`);
        });
    },
    [childrenState, filters, filtersReady, hierarchy, onError, sortModel],
  );

  const toggleExpanded = useCallback(
    (row: NestedLatencyGridRow) => {
      if (row.kind !== "node" || !row.hasChildren || !row.fetchMeta) {
        return;
      }

      const willExpand = !expanded.has(row.id);
      setExpanded((current) => {
        const next = new Set(current);
        if (willExpand) {
          next.add(row.id);
        } else {
          next.delete(row.id);
        }
        return next;
      });

      if (willExpand && !childrenState[row.id]) {
        loadChildrenPage(row.fetchMeta, 0);
      }
    },
    [childrenState, expanded, loadChildrenPage],
  );

  const loadMoreForRow = useCallback(
    (row: NestedLatencyGridRow) => {
      if (row.kind !== "loader" || row.nextPage == null) {
        return;
      }

      if (row.parentMeta) {
        loadChildrenPage(row.parentMeta, row.nextPage);
      } else {
        loadRootPage(row.nextPage);
      }
    },
    [loadChildrenPage, loadRootPage],
  );

  const handleSortModelChange = useCallback((nextSortModel: GridSortModel) => {
    setSortModel(nextSortModel);
  }, []);

  const rows = useMemo(() => {
    const output: NestedLatencyGridRow[] = [];

    const walk = (nodes: NestedLatencyGridRow[]) => {
      for (const node of nodes) {
        const childState = childrenState[node.id];
        const isExpanded = expanded.has(node.id);

        output.push({
          ...node,
          expanded: isExpanded,
          loadingChildren: Boolean(
            childState?.loading && childState.rows.length === 0,
          ),
          selected: selectedIds.has(node.id),
        });

        if (isExpanded && childState) {
          walk(childState.rows);
          if (childState.nextPage != null && node.fetchMeta) {
            output.push(
              toLoaderRow(
                node.fetchMeta,
                node.depth + 1,
                childState.nextPage,
                childState.loading,
              ),
            );
          }
        }
      }
    };

    walk(rootState.rows);

    if (rootState.nextPage != null) {
      output.push(toLoaderRow(null, 0, rootState.nextPage, rootState.loading));
    }

    return output;
  }, [childrenState, expanded, rootState, selectedIds]);

  return {
    rows,
    rootLoading: rootState.loading && rootState.rows.length === 0,
    sortModel,
    setSortModel: handleSortModelChange,
    toggleExpanded,
    loadMoreForRow,
  };
}

function useLatencySeriesSelection({
  filters,
  filtersReady,
  onError,
}: {
  filters: NestedLatencyFilters;
  filtersReady: boolean;
  onError: (message: string | null) => void;
}) {
  const [entities, setEntities] = useState<ChartEntity[]>([]);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    setEntities([]);
    setLoadingIds(new Set());
  }, [filterKey]);

  const selectedIds = useMemo(
    () => new Set(entities.map((entity) => entity.id)),
    [entities],
  );

  const toggle = useCallback(
    (row: NestedLatencyGridRow) => {
      if (row.kind !== "node" || !row.identity) {
        return;
      }

      if (selectedIds.has(row.id)) {
        setEntities((current) =>
          current.filter((entity) => entity.id !== row.id),
        );
        return;
      }

      if (!filtersReady) {
        onError("Select filter values before adding a chart series");
        return;
      }

      if (entities.length >= MAX_CHART_SERIES) {
        onError(`Compare up to ${MAX_CHART_SERIES} series at once`);
        return;
      }

      setLoadingIds((current) => new Set(current).add(row.id));
      onError(null);

      const identity = row.identity;

      void getNestedLatencySeries({
        ...filters,
        ...identity,
      })
        .then((series) => {
          setEntities((current) => {
            if (current.some((entity) => entity.id === row.id)) {
              return current;
            }

            const color = CHART_COLORS[current.length % CHART_COLORS.length];
            return [
              ...current,
              {
                ...identity,
                id: row.id,
                label: row.chartLabel,
                color,
                series,
              },
            ];
          });
        })
        .catch((error) => {
          console.error(error);
          onError(`Could not load chart series for ${row.label}`);
        })
        .finally(() => {
          setLoadingIds((current) => {
            const next = new Set(current);
            next.delete(row.id);
            return next;
          });
        });
    },
    [entities.length, filters, filtersReady, onError, selectedIds],
  );

  const clear = useCallback(() => {
    setEntities([]);
    setLoadingIds(new Set());
  }, []);

  const colorOf = useCallback(
    (id: string) => entities.find((entity) => entity.id === id)?.color,
    [entities],
  );

  return {
    entities,
    loading: loadingIds.size > 0,
    loadingIds,
    selectedIds,
    toggle,
    clear,
    colorOf,
  };
}

function renderTextCell(
  params: GridRenderCellParams<NestedLatencyGridRow, string | undefined>,
) {
  return params.row.kind === "loader" ? "" : (params.value ?? "");
}

function renderNumberCell(
  params: GridRenderCellParams<NestedLatencyGridRow, number | undefined>,
) {
  return params.row.kind === "loader" ? "" : formatNumber(params.value);
}

function renderLatencyCell(
  params: GridRenderCellParams<NestedLatencyGridRow, number | undefined>,
) {
  if (params.row.kind === "loader" || params.value == null) {
    return "";
  }

  return (
    <Tooltip title={formatLatencyDetail(params.value)} disableInteractive>
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {formatLatency(params.value, true)}
      </Box>
    </Tooltip>
  );
}

function buildColumns({
  onToggleExpanded,
  onToggleSeries,
  onLoadMore,
  loadingIds,
  colorOf,
}: {
  onToggleExpanded: (row: NestedLatencyGridRow) => void;
  onToggleSeries: (row: NestedLatencyGridRow) => void;
  onLoadMore: (row: NestedLatencyGridRow) => void;
  loadingIds: Set<string>;
  colorOf: (id: string) => string | undefined;
}): GridColDef<NestedLatencyGridRow>[] {
  return [
    {
      field: "chart",
      headerName: "",
      width: 48,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => {
        if (params.row.kind === "loader") {
          return null;
        }

        const loading = loadingIds.has(params.row.id);
        const selectedColor = colorOf(params.row.id);

        return (
          <Tooltip
            title={params.row.selected ? "Hide from chart" : "Show on chart"}
            disableInteractive
          >
            <span>
              <IconButton
                size="small"
                disabled={loading}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSeries(params.row);
                }}
                sx={{
                  color: selectedColor ?? "text.disabled",
                  bgcolor: selectedColor ? alpha(selectedColor, 0.12) : "transparent",
                  "&:hover": {
                    bgcolor: selectedColor
                      ? alpha(selectedColor, 0.18)
                      : "action.hover",
                  },
                }}
              >
                {loading ? (
                  <CircularProgress size={16} />
                ) : params.row.selected ? (
                  <VisibilityIcon fontSize="small" />
                ) : (
                  <VisibilityOffIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        );
      },
    },
    {
      field: "label",
      headerName: "Name",
      minWidth: 300,
      flex: 1.4,
      sortable: true,
      renderCell: (params) => {
        if (params.row.kind === "loader") {
          return (
            <Box
              sx={{
                pl: params.row.depth * 2.5,
                width: "100%",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Button
                size="small"
                disabled={params.row.loadingMore}
                onClick={(event) => {
                  event.stopPropagation();
                  onLoadMore(params.row);
                }}
                startIcon={
                  params.row.loadingMore ? (
                    <CircularProgress size={14} />
                  ) : undefined
                }
                sx={{ minHeight: 30, px: 1 }}
              >
                {params.row.label}
              </Button>
            </Box>
          );
        }

        return (
          <Box
            sx={{
              pl: params.row.depth * 2.5,
              width: "100%",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
            }}
          >
            {params.row.hasChildren ? (
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpanded(params.row);
                }}
                sx={{ width: 28, height: 28 }}
              >
                {params.row.loadingChildren ? (
                  <CircularProgress size={16} />
                ) : params.row.expanded ? (
                  <KeyboardArrowDownIcon fontSize="small" />
                ) : (
                  <KeyboardArrowRightIcon fontSize="small" />
                )}
              </IconButton>
            ) : (
              <Box sx={{ width: 28, flex: "0 0 auto" }} />
            )}

            <Chip
              size="small"
              label={params.row.levelLabel}
              sx={{
                height: 22,
                borderRadius: 1,
                fontSize: 11,
                fontWeight: 800,
                border: "1px solid",
                ...(LEVEL_TAG_STYLES[params.row.levelLabel] ?? {
                  bgcolor: "action.hover",
                  color: "text.secondary",
                  borderColor: "divider",
                }),
              }}
            />
            <Typography
              variant="body2"
              noWrap
              sx={{
                minWidth: 0,
                fontWeight: params.row.depth === 0 ? 800 : 650,
              }}
            >
              {params.row.label}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "gateway_name",
      headerName: "Gateway",
      width: 150,
      renderCell: renderTextCell,
    },
    {
      field: "partition",
      headerName: "Partition",
      width: 120,
      renderCell: renderTextCell,
    },
    {
      field: "participant_name",
      headerName: "Participant",
      width: 170,
      renderCell: renderTextCell,
    },
    {
      field: "node_instance",
      headerName: "Instance",
      width: 150,
      renderCell: renderTextCell,
    },
    {
      field: "port",
      headerName: "Port",
      width: 100,
      renderCell: renderTextCell,
    },
    {
      field: "num_instances",
      headerName: "Inst.",
      width: 95,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    {
      field: "num_users",
      headerName: "Users",
      width: 105,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    {
      field: "num_orders",
      headerName: "Orders",
      width: 115,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    {
      field: "num_orders_in_peak_times",
      headerName: "Peak Orders",
      width: 130,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    ...METRIC_OPTIONS.map<GridColDef<NestedLatencyGridRow>>((metric) => ({
      field: metric.value,
      headerName: metric.label,
      width: 112,
      align: "right",
      headerAlign: "right",
      renderCell: renderLatencyCell,
      cellClassName: (params) =>
        `latency-cell ${getLatencyClass(params.value)}`,
    })),
  ];
}

function NestedLatencyGrid({
  title,
  rows,
  loading,
  sortModel,
  onSortModelChange,
  onToggleExpanded,
  onToggleSeries,
  onLoadMore,
  loadingSeriesIds,
  colorOf,
}: {
  title: string;
  rows: NestedLatencyGridRow[];
  loading: boolean;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onToggleExpanded: (row: NestedLatencyGridRow) => void;
  onToggleSeries: (row: NestedLatencyGridRow) => void;
  onLoadMore: (row: NestedLatencyGridRow) => void;
  loadingSeriesIds: Set<string>;
  colorOf: (id: string) => string | undefined;
}) {
  const theme = useTheme();
  const apiRef = useGridApiRef();
  const columns = useMemo(
    () =>
      buildColumns({
        onToggleExpanded,
        onToggleSeries,
        onLoadMore,
        loadingIds: loadingSeriesIds,
        colorOf,
      }),
    [
      colorOf,
      loadingSeriesIds,
      onLoadMore,
      onToggleExpanded,
      onToggleSeries,
    ],
  );

  useEffect(() => {
    apiRef.current?.setState((state) => {
      if (!state.pagination?.enabled) {
        return state;
      }

      return {
        ...state,
        pagination: {
          ...state.pagination,
          enabled: false,
        },
      };
    });
  }, [apiRef]);

  useEffect(() => {
    return apiRef.current?.subscribeEvent("scrollPositionChange", (params) => {
      const renderContext = params.renderContext;
      if (!renderContext) {
        return;
      }

      const start = Math.max(0, renderContext.firstRowIndex - 3);
      const end = Math.min(rows.length, renderContext.lastRowIndex + 6);
      for (let index = start; index < end; index += 1) {
        const row = rows[index];
        if (row?.kind === "loader") {
          onLoadMore(row);
        }
      }
    });
  }, [apiRef, onLoadMore, rows]);

  useEffect(() => {
    const firstLoader = rows.find(
      (row, index) => row.kind === "loader" && index < 12,
    );
    if (firstLoader) {
      onLoadMore(firstLoader);
    }
  }, [onLoadMore, rows]);

  const handleRowClick: GridEventListener<"rowClick"> = (params) => {
    const row = params.row as NestedLatencyGridRow;
    if (row.kind === "loader") {
      onLoadMore(row);
    }
  };

  const handleRowDoubleClick: GridEventListener<"rowDoubleClick"> = (
    params,
  ) => {
    const row = params.row as NestedLatencyGridRow;
    if (row.kind === "node" && row.hasChildren) {
      onToggleExpanded(row);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.035),
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        <Chip
          size="small"
          label={`${rows.filter((row) => row.kind === "node").length} rows`}
          sx={{ height: 22, borderRadius: 1 }}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          apiRef={apiRef}
          rows={rows}
          columns={columns}
          loading={loading}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={onSortModelChange}
          hideFooter
          disableColumnMenu
          disableRowSelectionOnClick
          density="compact"
          rowHeight={44}
          columnHeaderHeight={42}
          getRowClassName={(params) =>
            [
              `nested-depth-${params.row.depth}`,
              params.row.kind === "loader" ? "nested-loader-row" : "",
              params.row.selected ? "nested-selected-row" : "",
            ].join(" ")
          }
          onRowClick={handleRowClick}
          onRowDoubleClick={handleRowDoubleClick}
          sx={{
            border: 0,
            "& .MuiDataGrid-columnHeader": {
              bgcolor: alpha(theme.palette.text.primary, 0.035),
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontSize: 12,
              fontWeight: 800,
            },
            "& .MuiDataGrid-cell": {
              borderColor: alpha(theme.palette.divider, 0.72),
            },
            "& .MuiDataGrid-row": {
              cursor: "default",
            },
            "& .MuiDataGrid-row:hover": {
              bgcolor: alpha(theme.palette.primary.main, 0.055),
            },
            "& .MuiDataGrid-row.nested-depth-1": {
              bgcolor: alpha(theme.palette.info.main, 0.045),
            },
            "& .MuiDataGrid-row.nested-depth-2": {
              bgcolor: alpha(theme.palette.warning.main, 0.045),
            },
            "& .MuiDataGrid-row.nested-selected-row": {
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              boxShadow: `inset 3px 0 0 ${theme.palette.primary.main}`,
            },
            "& .MuiDataGrid-row.nested-selected-row:hover": {
              bgcolor: alpha(theme.palette.primary.main, 0.16),
            },
            "& .MuiDataGrid-row.nested-loader-row": {
              bgcolor: alpha(theme.palette.text.primary, 0.025),
            },
            "& .latency-cell": {
              fontWeight: 750,
              fontVariantNumeric: "tabular-nums",
            },
            "& .latency-good": {
              color: theme.palette.success.main,
            },
            "& .latency-warn": {
              color: theme.palette.warning.dark,
            },
            "& .latency-high": {
              color: theme.palette.error.main,
            },
            "& .latency-critical": {
              color: theme.palette.error.dark,
              fontWeight: 850,
            },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: -2,
            },
            "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
              {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: -2,
              },
          }}
        />
      </Box>
    </Paper>
  );
}

function LatencyChartCard({
  title,
  entities,
  loading,
  onClear,
  registerChart,
}: {
  title: string;
  entities: ChartEntity[];
  loading: boolean;
  onClear: () => void;
  registerChart: (ref: unknown) => void;
}) {
  const theme = useTheme();
  const [metric, setMetric] = useState<MetricKey>("me_med");

  const option = useMemo<EChartsOption>(() => {
    const times = Array.from(
      new Set(
        entities.flatMap((entity) => entity.series.map((point) => formatTime(point))),
      ),
    ).sort();
    const metricValues = entities.flatMap((entity) =>
      entity.series.map((point) => point[metric]),
    );
    const useLogScale = shouldUseLogScale(metricValues);

    const series: LineSeriesOption[] = entities.map((entity) => {
      const pointsByTime = new Map(
        entity.series.map((point) => [formatTime(point), point]),
      );

      return {
        name: entity.label,
        type: "line",
        smooth: true,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 6,
        sampling: "lttb",
        emphasis: {
          focus: "series",
          lineStyle: { width: 3.4 },
        },
        lineStyle: { width: 2.4, color: entity.color },
        itemStyle: { color: entity.color },
        data: times.map((time) => pointsByTime.get(time)?.[metric] ?? null),
      };
    });

    return {
      animationDuration: 300,
      color: entities.map((entity) => entity.color),
      grid: { left: 18, right: 22, top: 50, bottom: 58, containLabel: true },
      legend: {
        type: "scroll",
        top: 8,
        left: 8,
        right: 96,
        itemWidth: 16,
        itemHeight: 10,
        icon: "roundRect",
        textStyle: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          fontWeight: 650,
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: {
            color: theme.palette.text.secondary,
            width: 1,
            type: "dashed",
          },
        },
        backgroundColor: theme.palette.background.paper,
        borderColor: theme.palette.divider,
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: theme.palette.text.primary, fontSize: 12 },
        extraCssText:
          "box-shadow:0 12px 30px rgba(15,23,42,0.16);border-radius:8px;",
        valueFormatter: (value) =>
          typeof value === "number" ? formatLatency(value, true) : "",
      },
      toolbox: {
        right: 8,
        top: 4,
        itemSize: 14,
        feature: {
          dataZoom: {
            yAxisIndex: "none",
            title: { zoom: "Zoom", back: "Back" },
          },
          restore: { title: "Reset" },
          saveAsImage: { title: "Save" },
        },
      },
      xAxis: {
        type: "category",
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.palette.divider } },
        axisTick: { lineStyle: { color: theme.palette.divider } },
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          interval: (_index: number, value: string) =>
            value.endsWith(":00") || value.endsWith(":30"),
        },
      },
      yAxis: {
        type: useLogScale ? "log" : "value",
        scale: true,
        min: useLogScale ? 1 : undefined,
        logBase: 10,
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          formatter: (value: number) => formatLatency(value, true),
        },
        splitLine: {
          lineStyle: { color: theme.palette.divider },
        },
      },
      dataZoom: [
        { type: "inside", start: 0, end: 100 },
        {
          type: "slider",
          height: 18,
          bottom: 18,
          borderColor: theme.palette.divider,
          fillerColor: alpha(theme.palette.primary.main, 0.16),
          handleStyle: { color: theme.palette.primary.main },
          textStyle: { color: theme.palette.text.secondary, fontSize: 10 },
        },
      ],
      series,
    };
  }, [entities, metric, theme]);

  const selectedMetricLabel =
    METRIC_OPTIONS.find((optionItem) => optionItem.value === metric)?.label ??
    "";

  const handleMetricChange = (event: SelectChangeEvent<MetricKey>) => {
    setMetric(event.target.value as MetricKey);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.035),
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }} noWrap>
            {title}
          </Typography>
          <Chip
            size="small"
            label={`${entities.length} series`}
            sx={{ height: 22, borderRadius: 1 }}
          />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id={`${title}-metric-label`}>Metric</InputLabel>
            <Select
              labelId={`${title}-metric-label`}
              label="Metric"
              value={metric}
              onChange={handleMetricChange}
              renderValue={() => selectedMetricLabel}
            >
              {METRIC_OPTIONS.map((optionItem) => (
                <MenuItem key={optionItem.value} value={optionItem.value}>
                  {optionItem.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title="Clear chart" disableInteractive>
            <span>
              <IconButton
                size="small"
                disabled={entities.length === 0 && !loading}
                onClick={onClear}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ position: "relative", flex: 1, minHeight: 0, p: 1 }}>
        {entities.length === 0 ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              No series selected
            </Typography>
          </Box>
        ) : (
          <ReactECharts
            ref={registerChart}
            option={option}
            notMerge
            lazyUpdate
            style={{ height: "100%", width: "100%" }}
          />
        )}

        {loading && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: alpha(theme.palette.background.paper, 0.62),
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export function NestedLatencyPage() {
  const theme = useTheme();
  const { collapsed } = useSidebar();
  const { registerChart } = useChartResize(collapsed);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
  const [filterOptions, setFilterOptions] =
    useState<NestedLatencyFilterOptions>({
      locations: [],
      markets: [],
      partitions: [],
      protocols: [],
    });
  const [filters, setFilters] = useState<NestedLatencyFilters>({
    locations: [],
    markets: [],
    partitions: [],
    protocols: [],
    queryString: "",
    date: getDefaultToDate(),
  });

  const filtersReady = Boolean(
    filters.date &&
      filters.locations.length > 0 &&
      filters.markets.length > 0 &&
      filters.partitions.length > 0 &&
      filters.protocols.length > 0,
  );

  const fetchFilterOptions = useCallback(async () => {
    try {
      setFilterOptionsLoading(true);
      setErrorMessage(null);

      const options = await getNestedLatencyFilterOptions();
      setFilterOptions(options);
      setFilters((current) => ({
        ...current,
        locations: options.locations.map((option) => option.id),
        markets: options.markets.map((option) => option.id),
        partitions: options.partitions.map((option) => option.id),
        protocols: options.protocols.map((option) => option.id),
        queryString: "",
      }));
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not load latency filter options");
    } finally {
      setFilterOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFilterOptions();
  }, [fetchFilterOptions]);

  const gatewayChart = useLatencySeriesSelection({
    filters,
    filtersReady,
    onError: setErrorMessage,
  });
  const participantChart = useLatencySeriesSelection({
    filters,
    filtersReady,
    onError: setErrorMessage,
  });

  const gatewayRows = useNestedLatencyRows({
    hierarchy: "gateway",
    filters,
    filtersReady: filtersReady && !filterOptionsLoading,
    selectedIds: gatewayChart.selectedIds,
    onError: setErrorMessage,
  });
  const participantRows = useNestedLatencyRows({
    hierarchy: "participant",
    filters,
    filtersReady: filtersReady && !filterOptionsLoading,
    selectedIds: participantChart.selectedIds,
    onError: setErrorMessage,
  });

  const handleDateDayChange = (date: string) => {
    setFilters((current) => ({ ...current, date }));
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 32px)",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        <Typography variant="h5" sx={{ fontWeight: 850 }}>
          Nested Latency Explorer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Gateway, participant, instance, and user latency
        </Typography>
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <DateDayPicker
          selectedDate={filters.date}
          onDateChange={handleDateDayChange}
          isLoading={filterOptionsLoading}
          isDisabled={false}
        />

        <TextInputFilterWithDebounce
          onDebouncedChange={(queryString) => {
            setFilters((current) => ({ ...current, queryString }));
          }}
        />

        <Box sx={{ width: 220 }}>
          <MultiSelectFilter<Location>
            label="Locations"
            value={filters.locations}
            options={filterOptions.locations}
            disabled={filterOptionsLoading}
            onChange={(locations) =>
              setFilters((current) => ({ ...current, locations }))
            }
          />
        </Box>

        <Box sx={{ width: 200 }}>
          <MultiSelectFilter<Market>
            label="Markets"
            value={filters.markets}
            options={filterOptions.markets}
            disabled={filterOptionsLoading}
            onChange={(markets) =>
              setFilters((current) => ({ ...current, markets }))
            }
          />
        </Box>

        <Box sx={{ width: 220 }}>
          <MultiSelectFilter<Partition>
            label="Partitions"
            value={filters.partitions}
            options={filterOptions.partitions}
            disabled={filterOptionsLoading}
            onChange={(partitions) =>
              setFilters((current) => ({ ...current, partitions }))
            }
          />
        </Box>

        <Box sx={{ width: 200 }}>
          <MultiSelectFilter<Protocol>
            label="Protocols"
            value={filters.protocols}
            options={filterOptions.protocols}
            disabled={filterOptionsLoading}
            onChange={(protocols) =>
              setFilters((current) => ({ ...current, protocols }))
            }
          />
        </Box>
      </Paper>

      {errorMessage && (
        <Paper
          variant="outlined"
          sx={{
            px: 1.5,
            py: 1,
            borderColor: alpha(theme.palette.error.main, 0.35),
            bgcolor: alpha(theme.palette.error.main, 0.08),
          }}
        >
          <Typography variant="body2" color="error" sx={{ fontWeight: 700 }}>
            {errorMessage}
          </Typography>
        </Paper>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gridTemplateRows: "minmax(0, 1fr) minmax(260px, 0.8fr)",
          gap: 1.5,
        }}
      >
        <NestedLatencyGrid
          title="Gateway hierarchy"
          rows={gatewayRows.rows}
          loading={gatewayRows.rootLoading}
          sortModel={gatewayRows.sortModel}
          onSortModelChange={gatewayRows.setSortModel}
          onToggleExpanded={gatewayRows.toggleExpanded}
          onToggleSeries={gatewayChart.toggle}
          onLoadMore={gatewayRows.loadMoreForRow}
          loadingSeriesIds={gatewayChart.loadingIds}
          colorOf={gatewayChart.colorOf}
        />

        <NestedLatencyGrid
          title="Participant hierarchy"
          rows={participantRows.rows}
          loading={participantRows.rootLoading}
          sortModel={participantRows.sortModel}
          onSortModelChange={participantRows.setSortModel}
          onToggleExpanded={participantRows.toggleExpanded}
          onToggleSeries={participantChart.toggle}
          onLoadMore={participantRows.loadMoreForRow}
          loadingSeriesIds={participantChart.loadingIds}
          colorOf={participantChart.colorOf}
        />

        <LatencyChartCard
          title="Gateway hierarchy chart"
          entities={gatewayChart.entities}
          loading={gatewayChart.loading}
          onClear={gatewayChart.clear}
          registerChart={registerChart}
        />

        <LatencyChartCard
          title="Participant hierarchy chart"
          entities={participantChart.entities}
          loading={participantChart.loading}
          onClear={participantChart.clear}
          registerChart={registerChart}
        />
      </Box>
    </Box>
  );
}
