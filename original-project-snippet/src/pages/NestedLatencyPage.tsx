/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption, LineSeriesOption, BarSeriesOption } from "echarts";
import { DataGrid, useGridApiRef } from "@mui/x-data-grid";
import type {
  GridCellParams,
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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ClearIcon from "@mui/icons-material/Clear";
import DownloadIcon from "@mui/icons-material/Download";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type {
  DataFreshnessInfo,
  ExchangeBaseline,
  GatewayLatencyItem,
  GatewayLatencyResponse,
  InstanceLatencyItem,
  InstanceLatencyResponse,
  NestedLatencyDailyHistoryPoint,
  NestedLatencyEntityType,
  NestedLatencyFilters,
  NestedLatencyGridFilters,
  NestedLatencyMetricFields,
  NestedLatencyMetricKey,
  NestedLatencySeriesIdentity,
  NestedLatencySeriesPoint,
  NestedLatencyThreshold,
  NestedLatencyThresholdOperator,
  NestedLatencyViewMode,
  NestedUserLatencyItem,
  NestedUserLatencyResponse,
  PageResponse,
  ParticipantLatencyItem,
  ParticipantLatencyResponse,
  SeriesLatencyItem,
  SeriesLatencyResponse,
} from "../types/latency";
import { DateDayPicker } from "../components/common/DateDayPicker";
import { TextInputFilterWithDebounce } from "../components/common/TextInputFilterWithDebounce";
import { useSidebar } from "../contexts/SidebarContext";
import { useChartResize } from "../hooks/useChartResize";
import {
  getDataFreshness,
  getExchangeBaseline,
  getNestedGatewayInstances,
  getNestedGatewayNodes,
  getNestedInstanceUsers,
  getNestedLatencyDailyHistory,
  getNestedLatencySeries,
  getNestedParticipantUsers,
  getNestedParticipants,
  getNestedSeriesLeaderboard,
} from "../services/latencyService";
import { getDefaultToDate, numberFormatter } from "../services/utilService";
import { CHART_COLORS } from "../theme/bistTheme";

type HierarchyKind = "gateway" | "participant";
type MetricKey = NestedLatencyMetricKey;
type PageModel = { page: number; pageSize: number };
type NodeEntityType = Exclude<NestedLatencyEntityType, "user" | "series">;

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
  portsDisplay?: string;
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
  previousDaySeries?: NestedLatencySeriesPoint[];
};

type PageMeta = Pick<PageResponse<unknown>, "last" | "page" | "totalElements">;

const PAGE_SIZE = 25;
// The flat series leaderboard has far more rows than the hierarchy grids,
// so it pages in bigger chunks.
const SERIES_PAGE_SIZE = 100;
const MAX_CHART_SERIES = 6;
const MICROSECOND_UNIT = "µs";
const FRESHNESS_POLL_MS = 5 * 60 * 1000;
const LOCAL_STORAGE_KEY = "nested-latency-explorer:v1";
const DEFAULT_SORT_FIELD = "name";

// Peak windows (server timezone) shaded on the minute chart.
const PEAK_WINDOWS: Array<{ start: string; end: string; label: string }> = [
  { start: "09:39:50", end: "09:41:00", label: "Peak 1" },
  { start: "09:59:50", end: "10:01:00", label: "Peak 2" },
];

// Relative colour thresholds vs. the day's exchange-wide baseline.
const COLOUR_THRESHOLDS = {
  warn: 3,
  high: 6,
  critical: 10,
};

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
  Series: { bgcolor: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" },
};

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "me_med", label: "ME Med" },
  { value: "me_avg", label: "ME Avg" },
  { value: "me_p99", label: "ME p99" },
  { value: "me_max", label: "ME Max" },
  { value: "me_min", label: "ME Min" },
  { value: "gw_med", label: "GW Med" },
  { value: "gw_avg", label: "GW Avg" },
  { value: "gw_p99", label: "GW p99" },
  { value: "gw_max", label: "GW Max" },
  { value: "gw_min", label: "GW Min" },
];

const THRESHOLD_OPERATORS: NestedLatencyThresholdOperator[] = [
  ">",
  ">=",
  "<",
  "<=",
];

const VIEW_MODE_OPTIONS: { value: NestedLatencyViewMode; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "gateway", label: "Gateway" },
  { value: "participant", label: "Participant" },
  { value: "series", label: "Series" },
];

const EMPTY_PAGE_STATE: PageState = {
  rows: [],
  total: 0,
  nextPage: 0,
  loading: false,
};

type PersistedPrefs = {
  metric?: MetricKey;
  minOrders?: number;
  threshold?: NestedLatencyThreshold | null;
  comparePreviousDay?: boolean;
};

function loadPersistedPrefs(): PersistedPrefs {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedPrefs) : {};
  } catch {
    return {};
  }
}

function savePersistedPrefs(prefs: PersistedPrefs) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const current = loadPersistedPrefs();
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ ...current, ...prefs }),
    );
  } catch {
    // ignore quota errors
  }
}

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
  return [...currentRows, ...incomingRows.filter((row) => !seen.has(row.id))];
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

function toInstanceUserRow(
  item: NestedUserLatencyItem,
): NestedLatencyGridRow {
  const gatewayName = item.gw_node ?? "";
  const instanceName = item.node_instance ?? "";
  const id = makeId(
    "gateway",
    gatewayName,
    "instance",
    instanceName,
    "user",
    item.name,
    (item.ports ?? []).join("-"),
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
    portsDisplay: (item.ports ?? []).join(", "),
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
    (item.ports ?? []).join("-"),
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
    portsDisplay: (item.ports ?? []).join(", "),
  };
}

function toSeriesRow(item: SeriesLatencyItem): NestedLatencyGridRow {
  const id = makeId("series", item.name);
  return {
    ...item,
    id,
    kind: "node",
    entityType: "series",
    label: item.name,
    chartLabel: item.name,
    levelLabel: "Series",
    depth: 0,
    hasChildren: false,
    expanded: false,
    loadingChildren: false,
    selected: false,
    identity: {
      entityType: "series",
      name: item.name,
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
  return `${String(point.hour).padStart(2, "0")}:${String(
    point.minute,
  ).padStart(2, "0")}`;
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

function shouldUseLogScale(values: Array<number | null>) {
  const positiveValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (positiveValues.length < 2) {
    return false;
  }
  const min = Math.min(...positiveValues);
  const max = Math.max(...positiveValues);
  return max >= 1_000_000 && max / Math.max(min, 1) >= 1_000;
}

function baselineForMetric(
  baseline: ExchangeBaseline | null,
  metric: MetricKey,
): number | null {
  if (!baseline) {
    return null;
  }
  const isP99 = metric.endsWith("p99");
  const isMe = metric.startsWith("me");
  if (isP99) {
    return isMe ? baseline.me_p99 : baseline.gw_p99;
  }
  // For all other metrics we compare against the median baseline.
  return isMe ? baseline.me_med : baseline.gw_med;
}

function getLatencyClass(
  value: unknown,
  metric: MetricKey,
  baseline: ExchangeBaseline | null,
) {
  if (typeof value !== "number") {
    return "";
  }

  const ref = baselineForMetric(baseline, metric);
  if (ref && ref > 0) {
    const ratio = value / ref;
    if (ratio >= COLOUR_THRESHOLDS.critical) return "latency-critical";
    if (ratio >= COLOUR_THRESHOLDS.high) return "latency-high";
    if (ratio >= COLOUR_THRESHOLDS.warn) return "latency-warn";
    return "latency-good";
  }

  // Fallback (baseline not available yet): tuned to the actual distribution
  // -- most rows sit around 200-500 us, so warn kicks in at 5 ms.
  if (value >= 100_000) return "latency-critical";
  if (value >= 20_000) return "latency-high";
  if (value >= 5_000) return "latency-warn";
  return "latency-good";
}

function csvEscape(value: unknown) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(fileName: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatMaybeNumber(value: unknown) {
  return typeof value === "number" ? value.toString() : "";
}

function useUrlState<T extends string>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return (params.get(key) as T) ?? defaultValue;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const search = params.toString();
      const url = `${window.location.pathname}${search ? `?${search}` : ""}`;
      window.history.replaceState(null, "", url);
    },
    [defaultValue, key],
  );

  return [value, update];
}

function useDataFreshness() {
  const [info, setInfo] = useState<DataFreshnessInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await getDataFreshness();
      setInfo(next);
    } catch {
      // silently ignore; freshness is a hint, not required for the page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, FRESHNESS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { info, loading, refresh };
}

function useExchangeBaseline(date: string) {
  const [baseline, setBaseline] = useState<ExchangeBaseline | null>(null);

  useEffect(() => {
    if (!date) {
      setBaseline(null);
      return;
    }
    let cancelled = false;
    void getExchangeBaseline(date)
      .then((next) => {
        if (!cancelled) setBaseline(next);
      })
      .catch(() => {
        if (!cancelled) setBaseline(null);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  return baseline;
}

function useNestedLatencyRows({
  hierarchy,
  filters,
  filtersReady,
  selectedIds,
  onError,
}: {
  hierarchy: HierarchyKind;
  filters: NestedLatencyGridFilters;
  filtersReady: boolean;
  selectedIds: Set<string>;
  onError: (message: string | null) => void;
}) {
  const [rootState, setRootState] = useState<PageState>(EMPTY_PAGE_STATE);
  const [childrenState, setChildrenState] = useState<Record<string, PageState>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: DEFAULT_SORT_FIELD, sort: "asc" },
  ]);
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
        if (version !== requestVersion.current) return;
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
      if (version !== requestVersion.current) return;
      const rows = response.content.map(toParticipantRow);
      setRootState((current) =>
        toPageState(response, rows, page, current.rows),
      );
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
      if (version !== requestVersion.current) return;
      console.error(error);
      setRootState((current) => ({ ...current, loading: false }));
      onError(`Could not load ${hierarchy} latency rows`);
    });
  }, [fetchRootPage, filterKey, filtersReady, hierarchy, onError, sortModel]);

  const loadRootPage = useCallback(
    (page: number) => {
      if (!filtersReady || rootState.loading) return;

      const key = `${hierarchy}:root:${page}:${JSON.stringify(sortModel)}`;
      if (requested.current.has(key)) return;

      requested.current.add(key);
      const version = requestVersion.current;
      setRootState((current) => ({ ...current, loading: true }));

      void fetchRootPage(page, version).catch((error) => {
        if (version !== requestVersion.current) return;
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
      if (!filtersReady) return;

      const currentState = childrenState[parentMeta.id];
      if (currentState?.loading) return;

      const key = `${hierarchy}:children:${parentMeta.id}:${page}:${JSON.stringify(sortModel)}`;
      if (requested.current.has(key)) return;

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

        const participantName = parentMeta.participantName ?? parentMeta.name;
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
          if (version !== requestVersion.current) return;
          setChildrenState((current) => {
            const currentPageState = current[parentMeta.id] ?? EMPTY_PAGE_STATE;
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
          if (version !== requestVersion.current) return;
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
      if (row.kind !== "node" || !row.hasChildren || !row.fetchMeta) return;
      const willExpand = !expanded.has(row.id);
      setExpanded((current) => {
        const next = new Set(current);
        if (willExpand) next.add(row.id);
        else next.delete(row.id);
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
      if (row.kind !== "loader" || row.nextPage == null) return;
      if (row.parentMeta) {
        loadChildrenPage(row.parentMeta, row.nextPage);
      } else {
        loadRootPage(row.nextPage);
      }
    },
    [loadChildrenPage, loadRootPage],
  );

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
    total: rootState.total,
    loadedCount: rootState.rows.length,
    rootLoading: rootState.loading && rootState.rows.length === 0,
    sortModel,
    setSortModel,
    toggleExpanded,
    loadMoreForRow,
  };
}

function useLatencySeriesSelection({
  filters,
  filtersReady,
  comparePreviousDay,
  onError,
  initialIds,
  onSelectionChange,
}: {
  filters: NestedLatencyFilters;
  filtersReady: boolean;
  comparePreviousDay: boolean;
  onError: (message: string | null) => void;
  initialIds?: NestedLatencySeriesIdentity[];
  onSelectionChange?: (identities: NestedLatencySeriesIdentity[]) => void;
}) {
  const [entities, setEntities] = useState<ChartEntity[]>([]);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const identitiesToRestoreRef = useRef(initialIds ?? []);
  const notifyRef = useRef(onSelectionChange);
  notifyRef.current = onSelectionChange;

  useEffect(() => {
    setEntities([]);
    setLoadingIds(new Set());
  }, [filterKey]);

  const selectedIds = useMemo(
    () => new Set(entities.map((entity) => entity.id)),
    [entities],
  );

  useEffect(() => {
    if (notifyRef.current) {
      notifyRef.current(entities.map((entity) => ({
        entityType: entity.entityType,
        name: entity.name,
        participantName: entity.participantName,
        gatewayName: entity.gatewayName,
        instanceName: entity.instanceName,
      })));
    }
  }, [entities]);

  const previousDate = useMemo(() => {
    if (!filters.date) return "";
    const d = new Date(`${filters.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [filters.date]);

  const fetchEntity = useCallback(
    async (identity: NestedLatencySeriesIdentity, id: string, label: string) => {
      const series = await getNestedLatencySeries({
        ...filters,
        ...identity,
      });
      let previousDaySeries: NestedLatencySeriesPoint[] | undefined;
      if (comparePreviousDay && previousDate) {
        try {
          previousDaySeries = await getNestedLatencySeries({
            ...filters,
            ...identity,
            date: previousDate,
          });
        } catch {
          previousDaySeries = undefined;
        }
      }
      setEntities((current) => {
        if (current.some((entity) => entity.id === id)) {
          return current;
        }
        const color = CHART_COLORS[current.length % CHART_COLORS.length];
        return [
          ...current,
          {
            ...identity,
            id,
            label,
            color,
            series,
            previousDaySeries,
          },
        ];
      });
    },
    [comparePreviousDay, filters, previousDate],
  );

  // Reload previous-day overlays when the toggle flips.
  useEffect(() => {
    if (!filtersReady || entities.length === 0) return;
    if (!comparePreviousDay) {
      setEntities((current) =>
        current.map((entity) => ({ ...entity, previousDaySeries: undefined })),
      );
      return;
    }
    let cancelled = false;
    void Promise.all(
      entities.map(async (entity) => {
        try {
          const previous = await getNestedLatencySeries({
            ...filters,
            entityType: entity.entityType,
            name: entity.name,
            participantName: entity.participantName,
            gatewayName: entity.gatewayName,
            instanceName: entity.instanceName,
            date: previousDate,
          });
          return { id: entity.id, previous };
        } catch {
          return { id: entity.id, previous: undefined };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setEntities((current) =>
        current.map((entity) => {
          const result = results.find((r) => r.id === entity.id);
          return { ...entity, previousDaySeries: result?.previous };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparePreviousDay, previousDate]);

  const toggle = useCallback(
    (row: NestedLatencyGridRow) => {
      if (row.kind !== "node" || !row.identity) return;

      if (selectedIds.has(row.id)) {
        setEntities((current) =>
          current.filter((entity) => entity.id !== row.id),
        );
        return;
      }

      if (!filtersReady) {
        onError("Select a date before adding a chart series");
        return;
      }

      if (entities.length >= MAX_CHART_SERIES) {
        onError(`Compare up to ${MAX_CHART_SERIES} series at once`);
        return;
      }

      setLoadingIds((current) => new Set(current).add(row.id));
      onError(null);

      void fetchEntity(row.identity, row.id, row.chartLabel)
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
    [entities.length, fetchEntity, filtersReady, onError, selectedIds],
  );

  // Restore selections from URL on initial mount / when identities change.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (!filtersReady) return;
    const identities = identitiesToRestoreRef.current;
    if (identities.length === 0) {
      restoredRef.current = true;
      return;
    }
    restoredRef.current = true;
    identities.slice(0, MAX_CHART_SERIES).forEach((identity, index) => {
      const id = makeId(
        identity.entityType,
        identity.gatewayName ?? "",
        identity.instanceName ?? "",
        identity.participantName ?? "",
        identity.name,
      );
      const label = identity.name;
      const color = CHART_COLORS[index % CHART_COLORS.length];
      setEntities((current) => [
        ...current,
        {
          ...identity,
          id,
          label,
          color,
          series: [],
        },
      ]);
      void getNestedLatencySeries({ ...filters, ...identity })
        .then((series) => {
          setEntities((current) =>
            current.map((entity) =>
              entity.id === id ? { ...entity, series } : entity,
            ),
          );
        })
        .catch(() => {
          // ignore
        });
    });
  }, [filters, filtersReady]);

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

// Plain span + native title: with 10 latency columns, a MUI Tooltip plus an
// emotion-styled Box per cell makes each row too expensive to mount while
// scrolling fast.
const LATENCY_VALUE_STYLE = {
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

function LatencyValueCell({
  value,
}: {
  value: number | null | undefined;
}) {
  if (value == null) return null;
  return (
    <span title={formatLatencyDetail(value)} style={LATENCY_VALUE_STYLE}>
      {formatLatency(value, true)}
    </span>
  );
}

function makeLatencyCellRenderer() {
  return function renderLatencyCell(
    params: GridRenderCellParams<NestedLatencyGridRow, number | undefined>,
  ) {
    if (params.row.kind === "loader" || params.value == null) return "";
    return <LatencyValueCell value={params.value} />;
  };
}

function buildColumns({
  hierarchy,
  onToggleExpanded,
  onToggleSeries,
  onLoadMore,
  loadingIds,
  colorOf,
  baseline,
}: {
  hierarchy: HierarchyKind | "series";
  onToggleExpanded: (row: NestedLatencyGridRow) => void;
  onToggleSeries: (row: NestedLatencyGridRow) => void;
  onLoadMore: (row: NestedLatencyGridRow) => void;
  loadingIds: Set<string>;
  colorOf: (id: string) => string | undefined;
  baseline: ExchangeBaseline | null;
}): GridColDef<NestedLatencyGridRow>[] {
  const latencyCol = (metric: { value: MetricKey; label: string }) =>
    ({
      field: metric.value,
      headerName: metric.label,
      width: 96,
      align: "right",
      headerAlign: "right",
      renderCell: makeLatencyCellRenderer(),
      cellClassName: (params: GridCellParams<NestedLatencyGridRow>) =>
        `latency-cell ${getLatencyClass(params.value, metric.value, baseline)}`,
    }) as GridColDef<NestedLatencyGridRow>;

  const commonHierarchyCols: GridColDef<NestedLatencyGridRow>[] = [
    {
      field: "chart",
      headerName: "",
      width: 40,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => {
        if (params.row.kind === "loader") return null;
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
                  bgcolor: selectedColor
                    ? alpha(selectedColor, 0.12)
                    : "transparent",
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
      field: "name",
      headerName: "Name",
      minWidth: 170,
      flex: 0.6,
      sortable: true,
      renderCell: (params) => {
        if (params.row.kind === "loader") {
          return (
            <Box
              sx={{
                pl: params.row.depth * 1.5,
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
              pl: params.row.depth * 1.5,
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
                sx={{ width: 24, height: 24 }}
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
              <Box sx={{ width: 24, flex: "0 0 auto" }} />
            )}

            <Tooltip title={params.row.levelLabel} disableInteractive>
              <Chip
                size="small"
                label={params.row.levelLabel.charAt(0)}
                sx={{
                  height: 18,
                  width: 20,
                  justifyContent: "center",
                  borderRadius: 1,
                  fontSize: 10,
                  fontWeight: 800,
                  border: "1px solid",
                  "& .MuiChip-label": { px: 0 },
                  ...(LEVEL_TAG_STYLES[params.row.levelLabel] ?? {
                    bgcolor: "action.hover",
                    color: "text.secondary",
                    borderColor: "divider",
                  }),
                }}
              />
            </Tooltip>
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
  ];

  const contextCols: GridColDef<NestedLatencyGridRow>[] =
    hierarchy === "series"
      ? []
      : hierarchy === "gateway"
        ? [
            {
              field: "participant_name",
              headerName: "Participant",
              width: 150,
              renderCell: renderTextCell,
            },
          ]
        : [
            {
              field: "gw_node",
              headerName: "Gateway",
              width: 130,
              renderCell: renderTextCell,
            },
            {
              field: "node_instance",
              headerName: "Instance",
              width: 130,
              renderCell: renderTextCell,
            },
          ];

  const portsCols: GridColDef<NestedLatencyGridRow>[] =
    hierarchy === "series"
      ? []
      : [
          {
            field: "portsDisplay",
            headerName: "Ports",
            width: 110,
            renderCell: renderTextCell,
          },
        ];

  const countCols: GridColDef<NestedLatencyGridRow>[] = [
    // num_instances only exists on gateway rows; in the participant grid the
    // column would always be empty.
    ...(hierarchy === "gateway"
      ? ([
          {
            field: "num_instances",
            headerName: "Inst.",
            width: 70,
            align: "right",
            headerAlign: "right",
            renderCell: renderNumberCell,
          },
        ] as GridColDef<NestedLatencyGridRow>[])
      : []),
    {
      field: "num_users",
      headerName: "Users",
      width: 80,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    {
      field: "num_orders",
      headerName: "Orders",
      width: 90,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    {
      field: "num_orders_in_peak_times",
      headerName: "Peak Orders",
      width: 105,
      align: "right",
      headerAlign: "right",
      renderCell: renderNumberCell,
    },
    {
      field: "peak_ratio",
      headerName: "Peak %",
      width: 80,
      align: "right",
      headerAlign: "right",
      renderCell: (
        params: GridRenderCellParams<NestedLatencyGridRow, number | undefined>,
      ) => {
        if (params.row.kind === "loader" || params.value == null) return "";
        return `${params.value.toFixed(2)}%`;
      },
    },
  ];

  // Latency metrics come right after the name; ports stay at the far right.
  return [
    ...commonHierarchyCols,
    ...METRIC_OPTIONS.map(latencyCol),
    ...countCols,
    ...contextCols,
    ...portsCols,
  ];
}

function NestedLatencyGrid({
  title,
  hierarchy,
  rows,
  loading,
  loadedCount,
  totalCount,
  sortModel,
  onSortModelChange,
  onToggleExpanded,
  onToggleSeries,
  onLoadMore,
  loadingSeriesIds,
  colorOf,
  baseline,
  onExportCsv,
}: {
  title: string;
  hierarchy: HierarchyKind | "series";
  rows: NestedLatencyGridRow[];
  loading: boolean;
  loadedCount: number;
  totalCount: number;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onToggleExpanded: (row: NestedLatencyGridRow) => void;
  onToggleSeries: (row: NestedLatencyGridRow) => void;
  onLoadMore: (row: NestedLatencyGridRow) => void;
  loadingSeriesIds: Set<string>;
  colorOf: (id: string) => string | undefined;
  baseline: ExchangeBaseline | null;
  onExportCsv: () => void;
}) {
  const theme = useTheme();
  const apiRef = useGridApiRef();
  const columns = useMemo(
    () =>
      buildColumns({
        hierarchy,
        onToggleExpanded,
        onToggleSeries,
        onLoadMore,
        loadingIds: loadingSeriesIds,
        colorOf,
        baseline,
      }),
    [
      baseline,
      colorOf,
      hierarchy,
      loadingSeriesIds,
      onLoadMore,
      onToggleExpanded,
      onToggleSeries,
    ],
  );

  useEffect(() => {
    apiRef.current?.setState((state) => {
      if (!state.pagination?.enabled) return state;
      return {
        ...state,
        pagination: { ...state.pagination, enabled: false },
      };
    });
  }, [apiRef]);

  useEffect(() => {
    return apiRef.current?.subscribeEvent("scrollPositionChange", (params) => {
      const renderContext = params.renderContext;
      if (!renderContext) return;
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
    if (firstLoader) onLoadMore(firstLoader);
  }, [onLoadMore, rows]);

  const handleRowClick: GridEventListener<"rowClick"> = (params) => {
    const row = params.row as NestedLatencyGridRow;
    if (row.kind === "loader") {
      onLoadMore(row);
      return;
    }
    // Single-click toggles the entity on the chart.
    onToggleSeries(row);
  };

  const handleRowDoubleClick: GridEventListener<"rowDoubleClick"> = (
    params,
  ) => {
    const row = params.row as NestedLatencyGridRow;
    if (row.kind === "node" && row.hasChildren) {
      onToggleExpanded(row);
    }
  };

  const nodeRowsLength = rows.filter((row) => row.kind === "node").length;
  const displayedCount = loadedCount || nodeRowsLength;
  const countLabel =
    totalCount > 0
      ? `${numberFormatter.format(displayedCount)} of ${numberFormatter.format(totalCount)} rows`
      : `${numberFormatter.format(displayedCount)} rows`;

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
          px: 1,
          py: 0.25,
          minHeight: 26,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.035),
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 800 }} noWrap>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {countLabel}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Export as CSV" disableInteractive>
          <span>
            <IconButton
              size="small"
              onClick={onExportCsv}
              disabled={rows.length === 0}
              sx={{ p: 0.25 }}
            >
              <DownloadIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
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
          rowHeight={36}
          columnHeaderHeight={30}
          rowBufferPx={400}
          getRowClassName={(params) =>
            [
              `nested-depth-${params.row.depth}`,
              params.row.kind === "loader" ? "nested-loader-row" : "",
              params.row.selected ? "nested-selected-row" : "",
            ].join(" ")
          }
          onRowClick={handleRowClick}
          onRowDoubleClick={handleRowDoubleClick}
          sx={gridSx(theme)}
        />
      </Box>
    </Paper>
  );
}

function gridSx(theme: Theme) {
  return {
    border: 0,
    "& .MuiDataGrid-columnHeader": {
      bgcolor: alpha(theme.palette.text.primary, 0.035),
    },
    "& .MuiDataGrid-columnHeaderTitle": {
      fontSize: 11,
      fontWeight: 800,
    },
    "& .MuiDataGrid-cell": {
      borderColor: alpha(theme.palette.divider, 0.72),
    },
    "& .MuiDataGrid-row": { cursor: "pointer" },
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
    "& .latency-good": { color: theme.palette.success.main },
    "& .latency-warn": { color: theme.palette.warning.dark },
    "& .latency-high": { color: theme.palette.error.main },
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
  };
}

function LatencyChartCard({
  entities,
  loading,
  onClear,
  registerChart,
  metric,
  comparePreviousDay,
}: {
  entities: ChartEntity[];
  loading: boolean;
  onClear: () => void;
  registerChart: (ref: unknown) => void;
  metric: MetricKey;
  comparePreviousDay: boolean;
}) {
  const theme = useTheme();

  const option = useMemo<EChartsOption>(() => {
    const times = Array.from(
      new Set(
        entities.flatMap((entity) =>
          entity.series.map((point) => formatTime(point)),
        ),
      ),
    ).sort();
    const metricValues = entities.flatMap((entity) =>
      entity.series.map((point) => point[metric]),
    );
    const useLogScale = shouldUseLogScale(metricValues);

    const lineSeries: LineSeriesOption[] = entities.map((entity) => {
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
        emphasis: { focus: "series", lineStyle: { width: 3.4 } },
        lineStyle: { width: 2.4, color: entity.color },
        itemStyle: { color: entity.color },
        yAxisIndex: 0,
        data: times.map((time) => pointsByTime.get(time)?.[metric] ?? null),
        markArea: {
          silent: true,
          itemStyle: {
            color: alpha(theme.palette.warning.main, 0.12),
          },
          data: PEAK_WINDOWS.map((window) => [
            { name: window.label, xAxis: window.start.slice(0, 5) },
            { xAxis: window.end.slice(0, 5) },
          ]),
        },
      };
    });

    const previousDaySeries: LineSeriesOption[] = comparePreviousDay
      ? entities
          .filter((entity) => entity.previousDaySeries?.length)
          .map((entity) => {
            const pointsByTime = new Map(
              (entity.previousDaySeries ?? []).map((point) => [
                formatTime(point),
                point,
              ]),
            );
            return {
              name: `${entity.label} (prev)`,
              type: "line",
              smooth: true,
              showSymbol: false,
              symbol: "circle",
              symbolSize: 4,
              sampling: "lttb",
              lineStyle: {
                width: 1.6,
                color: entity.color,
                type: "dashed",
                opacity: 0.75,
              },
              itemStyle: { color: entity.color },
              yAxisIndex: 0,
              data: times.map(
                (time) => pointsByTime.get(time)?.[metric] ?? null,
              ),
            };
          })
      : [];

    // Aggregate no_ord across selected entities into a single translucent bar
    // series on the secondary axis.
    const volumeSeries: BarSeriesOption[] = entities.length
      ? [
          {
            name: "Orders",
            type: "bar",
            yAxisIndex: 1,
            barMaxWidth: 6,
            itemStyle: {
              color: alpha(theme.palette.info.main, 0.25),
              borderRadius: [2, 2, 0, 0],
            },
            emphasis: {
              itemStyle: { color: alpha(theme.palette.info.main, 0.5) },
            },
            data: times.map((time) => {
              let total = 0;
              for (const entity of entities) {
                const point = entity.series.find(
                  (p) => formatTime(p) === time,
                );
                if (point) total += point.no_ord;
              }
              return total;
            }),
            z: 1,
          },
        ]
      : [];

    return {
      animationDuration: 300,
      color: entities.map((entity) => entity.color),
      grid: { left: 18, right: 50, top: 42, bottom: 50, containLabel: true },
      legend: {
        type: "scroll",
        top: 6,
        left: 8,
        right: 150,
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
      },
      toolbox: {
        right: 44,
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
      yAxis: [
        {
          type: useLogScale ? "log" : "value",
          scale: true,
          min: useLogScale ? 1 : undefined,
          logBase: 10,
          axisLabel: {
            color: theme.palette.text.secondary,
            fontSize: 11,
            formatter: (value: number) => formatLatency(value, true),
          },
          splitLine: { lineStyle: { color: theme.palette.divider } },
        },
        {
          type: "value",
          position: "right",
          alignTicks: true,
          axisLabel: {
            color: theme.palette.text.secondary,
            fontSize: 10,
            formatter: (value: number) =>
              compactLatencyFormatter.format(value),
          },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: "inside", start: 0, end: 100 },
        {
          type: "slider",
          height: 16,
          bottom: 8,
          borderColor: theme.palette.divider,
          fillerColor: alpha(theme.palette.primary.main, 0.16),
          handleStyle: { color: theme.palette.primary.main },
          textStyle: { color: theme.palette.text.secondary, fontSize: 10 },
        },
      ],
      series: [...volumeSeries, ...lineSeries, ...previousDaySeries],
    };
  }, [comparePreviousDay, entities, metric, theme]);

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
      <Box sx={{ position: "relative", flex: 1, minHeight: 0, p: 0.5 }}>
        {(entities.length > 0 || loading) && (
          <Tooltip title="Clear chart" disableInteractive>
            <span
              style={{ position: "absolute", top: 4, right: 6, zIndex: 3 }}
            >
              <IconButton size="small" onClick={onClear}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
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

function FreshnessChip({ info }: { info: DataFreshnessInfo | null }) {
  if (!info) return null;
  const parsed = new Date(info.updated_at);
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mm = String(parsed.getMinutes()).padStart(2, "0");
  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - parsed.getTime()) / 60000),
  );
  const stale = ageMinutes > 45;
  return (
    <Tooltip
      title={`Latest data for ${info.date}, updated ${ageMinutes} min ago`}
      disableInteractive
    >
      <Chip
        size="small"
        label={`Stats as of ${hh}:${mm}`}
        color={stale ? "warning" : "default"}
        sx={{ fontWeight: 700 }}
      />
    </Tooltip>
  );
}

function ThresholdControl({
  value,
  onChange,
}: {
  value: NestedLatencyThreshold | null;
  onChange: (value: NestedLatencyThreshold | null) => void;
}) {
  const active = value !== null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <FormControl size="small" sx={{ width: 110 }}>
        <InputLabel id="threshold-metric-label">Metric</InputLabel>
        <Select
          labelId="threshold-metric-label"
          label="Metric"
          value={value?.metric ?? "me_p99"}
          onChange={(event) => {
            onChange({
              metric: event.target.value as MetricKey,
              operator: value?.operator ?? ">",
              value: value?.value ?? 0,
            });
          }}
        >
          {METRIC_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ width: 72 }}>
        <InputLabel id="threshold-op-label">Op</InputLabel>
        <Select
          labelId="threshold-op-label"
          label="Op"
          value={value?.operator ?? ">"}
          onChange={(event) => {
            onChange({
              metric: value?.metric ?? "me_p99",
              operator: event.target.value as NestedLatencyThresholdOperator,
              value: value?.value ?? 0,
            });
          }}
        >
          {THRESHOLD_OPERATORS.map((op) => (
            <MenuItem key={op} value={op}>
              {op}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        size="small"
        type="number"
        placeholder="µs"
        value={value?.value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) return;
          onChange({
            metric: value?.metric ?? "me_p99",
            operator: value?.operator ?? ">",
            value: parsed,
          });
        }}
        sx={{ width: 110 }}
      />
      {active && (
        <Tooltip title="Clear threshold" disableInteractive>
          <IconButton size="small" onClick={() => onChange(null)}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

function SeriesLeaderboard({
  filters,
  filtersReady,
  baseline,
  onError,
  onSelect,
  selectedName,
}: {
  filters: NestedLatencyGridFilters;
  filtersReady: boolean;
  baseline: ExchangeBaseline | null;
  onError: (message: string | null) => void;
  onSelect: (name: string) => void;
  selectedName: string | null;
}) {
  const theme = useTheme();
  const apiRef = useGridApiRef();
  const [state, setState] = useState<PageState>(EMPTY_PAGE_STATE);
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: DEFAULT_SORT_FIELD, sort: "asc" },
  ]);
  const version = useRef(0);
  const requested = useRef<Set<string>>(new Set());
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const fetchPage = useCallback(
    async (page: number, currentVersion: number) => {
      const response: SeriesLatencyResponse = await getNestedSeriesLeaderboard(
        filters,
        { page, pageSize: SERIES_PAGE_SIZE },
        sortModel,
      );
      if (currentVersion !== version.current) return;
      const rows = response.content.map(toSeriesRow);
      setState((current) => toPageState(response, rows, page, current.rows));
    },
    [filters, sortModel],
  );

  useEffect(() => {
    version.current += 1;
    requested.current.clear();
    if (!filtersReady) {
      setState({ ...EMPTY_PAGE_STATE, nextPage: null });
      return;
    }
    const currentVersion = version.current;
    setState({ ...EMPTY_PAGE_STATE, loading: true });
    void fetchPage(0, currentVersion).catch((error) => {
      if (currentVersion !== version.current) return;
      console.error(error);
      setState((current) => ({ ...current, loading: false }));
      onError("Could not load series leaderboard");
    });
  }, [fetchPage, filterKey, filtersReady, onError, sortModel]);

  const loadMore = useCallback(
    (row: NestedLatencyGridRow) => {
      if (row.kind !== "loader" || row.nextPage == null) return;
      if (state.loading) return;
      const key = `series:root:${row.nextPage}:${JSON.stringify(sortModel)}`;
      if (requested.current.has(key)) return;
      requested.current.add(key);
      const currentVersion = version.current;
      setState((current) => ({ ...current, loading: true }));
      void fetchPage(row.nextPage, currentVersion).catch((error) => {
        if (currentVersion !== version.current) return;
        console.error(error);
        setState((current) => ({ ...current, loading: false }));
        onError("Could not load more series");
      });
    },
    [fetchPage, onError, sortModel, state.loading],
  );

  const rows = useMemo(() => {
    const output: NestedLatencyGridRow[] = state.rows.map((row) => ({
      ...row,
      selected: row.label === selectedName,
    }));
    if (state.nextPage != null) {
      output.push(toLoaderRow(null, 0, state.nextPage, state.loading));
    }
    return output;
  }, [selectedName, state]);

  // The free DataGrid always paginates internally (default 100 rows/page)
  // even with hideFooter; disable it so every fetched row renders and the
  // loader row stays scroll-reachable. Same workaround as NestedLatencyGrid.
  useEffect(() => {
    apiRef.current?.setState((state) => {
      if (!state.pagination?.enabled) return state;
      return {
        ...state,
        pagination: { ...state.pagination, enabled: false },
      };
    });
  }, [apiRef]);

  // Fetch the next page automatically when the loader row scrolls into view.
  useEffect(() => {
    return apiRef.current?.subscribeEvent("scrollPositionChange", (params) => {
      const renderContext = params.renderContext;
      if (!renderContext) return;
      const start = Math.max(0, renderContext.firstRowIndex - 3);
      const end = Math.min(rows.length, renderContext.lastRowIndex + 6);
      for (let index = start; index < end; index += 1) {
        const row = rows[index];
        if (row?.kind === "loader") {
          loadMore(row);
        }
      }
    });
  }, [apiRef, loadMore, rows]);

  useEffect(() => {
    const firstLoader = rows.find(
      (row, index) => row.kind === "loader" && index < 12,
    );
    if (firstLoader) loadMore(firstLoader);
  }, [loadMore, rows]);

  const columns = useMemo<GridColDef<NestedLatencyGridRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Series",
        minWidth: 170,
        flex: 0.6,
        renderCell: (params) => {
          if (params.row.kind === "loader") {
            return (
              <Button
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  loadMore(params.row);
                }}
              >
                {params.row.label}
              </Button>
            );
          }
          return (
            <Box
              sx={{
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 0.75,
              }}
            >
              <Tooltip title="Series" disableInteractive>
                <Chip
                  size="small"
                  label="S"
                  sx={{
                    height: 18,
                    width: 20,
                    justifyContent: "center",
                    borderRadius: 1,
                    fontSize: 10,
                    fontWeight: 800,
                    border: "1px solid",
                    "& .MuiChip-label": { px: 0 },
                    ...LEVEL_TAG_STYLES.Series,
                  }}
                />
              </Tooltip>
              <Typography
                variant="body2"
                sx={{ minWidth: 0, fontWeight: 700 }}
                noWrap
              >
                {params.row.label}
              </Typography>
            </Box>
          );
        },
      },
      // Latency metrics right after the name, coloured against the baseline.
      ...METRIC_OPTIONS.map(
        (metric): GridColDef<NestedLatencyGridRow> => ({
          field: metric.value,
          headerName: metric.label,
          width: 96,
          align: "right",
          headerAlign: "right",
          renderCell: makeLatencyCellRenderer(),
          cellClassName: (params: GridCellParams<NestedLatencyGridRow>) =>
            `latency-cell ${getLatencyClass(params.value, metric.value, baseline)}`,
        }),
      ),
      {
        field: "num_orders",
        headerName: "Orders",
        width: 90,
        align: "right",
        headerAlign: "right",
        renderCell: renderNumberCell,
      },
      {
        field: "num_users",
        headerName: "Users",
        width: 80,
        align: "right",
        headerAlign: "right",
        renderCell: renderNumberCell,
      },
    ],
    [baseline, loadMore],
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 1,
          py: 0.25,
          minHeight: 26,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.035),
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 800 }} noWrap>
          Series leaderboard
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {`${numberFormatter.format(state.rows.length)} of ${numberFormatter.format(
            state.total,
          )} series`}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          apiRef={apiRef}
          rows={rows}
          columns={columns}
          loading={state.loading && state.rows.length === 0}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          hideFooter
          disableColumnMenu
          disableRowSelectionOnClick
          density="compact"
          rowHeight={36}
          columnHeaderHeight={30}
          rowBufferPx={400}
          onRowClick={(params) => {
            const row = params.row as NestedLatencyGridRow;
            if (row.kind === "loader") {
              loadMore(row);
              return;
            }
            onSelect(row.label);
          }}
          sx={gridSx(theme)}
        />
      </Box>
    </Paper>
  );
}

function SeriesDailyHistoryChart({
  seriesName,
  metric,
  registerChart,
}: {
  seriesName: string | null;
  metric: MetricKey;
  registerChart: (ref: unknown) => void;
}) {
  const theme = useTheme();
  const [points, setPoints] = useState<NestedLatencyDailyHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!seriesName) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getNestedLatencyDailyHistory({ name: seriesName, days: 90 })
      .then((result) => {
        if (!cancelled) setPoints(result);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seriesName]);

  const option = useMemo<EChartsOption>(() => {
    const dates = points.map((p) => p.date);
    const values = points.map((p) => p[metric]);
    return {
      title: seriesName
        ? {
            text: `Daily history — ${seriesName}`,
            left: 8,
            top: 4,
            textStyle: {
              fontSize: 12,
              fontWeight: 700,
              color: theme.palette.text.primary,
            },
          }
        : undefined,
      grid: { left: 18, right: 22, top: 40, bottom: 32, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) =>
          typeof value === "number" ? formatLatency(value, true) : "",
      },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: false,
        axisLabel: { color: theme.palette.text.secondary, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: theme.palette.text.secondary,
          formatter: (value: number) => formatLatency(value, true),
        },
      },
      series: [
        {
          name: seriesName ?? "",
          type: "line",
          smooth: true,
          showSymbol: true,
          symbolSize: 4,
          lineStyle: { color: theme.palette.primary.main, width: 2 },
          itemStyle: { color: theme.palette.primary.main },
          data: values,
        },
      ],
    };
  }, [metric, points, seriesName, theme.palette]);

  return (
    <Paper
      variant="outlined"
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box sx={{ position: "relative", flex: 1, minHeight: 0, p: 0.5 }}>
        {!seriesName ? (
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
              Select a series to see its daily history
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

function encodeIdentitiesForUrl(identities: NestedLatencySeriesIdentity[]) {
  return identities
    .map((identity) =>
      [
        identity.entityType,
        identity.gatewayName ?? "",
        identity.instanceName ?? "",
        identity.participantName ?? "",
        identity.name,
      ]
        .map((part) => encodeURIComponent(part))
        .join(":"),
    )
    .join(",");
}

function decodeIdentitiesFromUrl(raw: string): NestedLatencySeriesIdentity[] {
  if (!raw) return [];
  return raw.split(",").flatMap((entry) => {
    const parts = entry.split(":").map(decodeURIComponent);
    if (parts.length < 5) return [];
    const [entityType, gatewayName, instanceName, participantName, name] =
      parts as [
        NestedLatencyEntityType,
        string,
        string,
        string,
        string,
      ];
    return [
      {
        entityType,
        name,
        gatewayName: gatewayName || undefined,
        instanceName: instanceName || undefined,
        participantName: participantName || undefined,
      },
    ];
  });
}

// Reads the exportable rows out of the useNestedLatencyRows output and hands
// downloadCsv a plain matrix. Loader/placeholder rows are dropped.
function buildRowsCsv(
  rows: NestedLatencyGridRow[],
  extraContextFields: Array<{ field: keyof NestedLatencyGridRow; header: string }>,
) {
  const metricHeaders = METRIC_OPTIONS.map((m) => m.label);
  const headers = [
    "Level",
    "Name",
    ...extraContextFields.map((c) => c.header),
    "Users",
    "Orders",
    "Peak Orders",
    "Peak %",
    ...metricHeaders,
  ];
  const data = rows
    .filter((row) => row.kind === "node")
    .map((row) => {
      const metricsForRow: NestedLatencyMetricFields = {
        me_med: row.me_med ?? null,
        me_avg: row.me_avg ?? null,
        me_max: row.me_max ?? null,
        me_min: row.me_min ?? null,
        me_p99: row.me_p99 ?? null,
        gw_med: row.gw_med ?? null,
        gw_avg: row.gw_avg ?? null,
        gw_max: row.gw_max ?? null,
        gw_min: row.gw_min ?? null,
        gw_p99: row.gw_p99 ?? null,
      };
      return [
        row.levelLabel,
        row.label,
        ...extraContextFields.map((c) => {
          const raw = row[c.field];
          return raw == null ? "" : String(raw);
        }),
        formatMaybeNumber(row.num_users),
        formatMaybeNumber(row.num_orders),
        formatMaybeNumber(row.num_orders_in_peak_times),
        row.peak_ratio != null ? `${row.peak_ratio.toFixed(2)}%` : "",
        ...METRIC_OPTIONS.map((m) => formatMaybeNumber(metricsForRow[m.value])),
      ];
    });
  return { headers, data };
}

export function NestedLatencyPage() {
  const theme = useTheme();
  const { collapsed } = useSidebar();
  const { registerChart } = useChartResize(collapsed);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const persisted = useMemo(loadPersistedPrefs, []);

  const [viewMode, setViewMode] = useUrlState<NestedLatencyViewMode>(
    "view",
    "both",
  );
  const [urlDate, setUrlDate] = useUrlState<string>(
    "date",
    getDefaultToDate(),
  );

  const [minOrders, setMinOrders] = useState<number>(
    persisted.minOrders ?? 100,
  );
  const [threshold, setThreshold] = useState<NestedLatencyThreshold | null>(
    persisted.threshold ?? null,
  );
  const [comparePreviousDay, setComparePreviousDay] = useState<boolean>(
    Boolean(persisted.comparePreviousDay),
  );
  const [gatewayQuery, setGatewayQuery] = useState<string>("");
  const [participantQuery, setParticipantQuery] = useState<string>("");
  const [seriesQuery, setSeriesQuery] = useState<string>("");
  const [selectedSeriesName, setSelectedSeriesName] = useState<string | null>(
    null,
  );
  const [chartMetric, setChartMetric] = useState<MetricKey>(
    persisted.metric ?? "me_med",
  );
  const [seriesChartMetric, setSeriesChartMetric] = useState<MetricKey>(
    persisted.metric ?? "me_p99",
  );

  // Persist prefs.
  useEffect(() => {
    savePersistedPrefs({
      metric: chartMetric,
      minOrders,
      threshold,
      comparePreviousDay,
    });
  }, [chartMetric, comparePreviousDay, minOrders, threshold]);

  const filters: NestedLatencyFilters = useMemo(
    () => ({ date: urlDate, minOrders, threshold }),
    [minOrders, threshold, urlDate],
  );

  const gatewayGridFilters: NestedLatencyGridFilters = useMemo(
    () => ({ ...filters, queryString: gatewayQuery }),
    [filters, gatewayQuery],
  );
  const participantGridFilters: NestedLatencyGridFilters = useMemo(
    () => ({ ...filters, queryString: participantQuery }),
    [filters, participantQuery],
  );
  const seriesGridFilters: NestedLatencyGridFilters = useMemo(
    () => ({ ...filters, queryString: seriesQuery }),
    [filters, seriesQuery],
  );

  const filtersReady = Boolean(filters.date);
  const freshness = useDataFreshness();
  const baseline = useExchangeBaseline(filters.date);

  // Restore chart selections from URL, and keep them in sync on change.
  const initialGatewayIdentities = useMemo(() => {
    if (typeof window === "undefined") return [];
    const params = new URLSearchParams(window.location.search);
    return decodeIdentitiesFromUrl(params.get("g") ?? "");
  }, []);
  const initialParticipantIdentities = useMemo(() => {
    if (typeof window === "undefined") return [];
    const params = new URLSearchParams(window.location.search);
    return decodeIdentitiesFromUrl(params.get("p") ?? "");
  }, []);

  const persistIdentities = useCallback(
    (key: "g" | "p", identities: NestedLatencySeriesIdentity[]) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (identities.length === 0) {
        params.delete(key);
      } else {
        params.set(key, encodeIdentitiesForUrl(identities));
      }
      const search = params.toString();
      const url = `${window.location.pathname}${search ? `?${search}` : ""}`;
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const gatewayChart = useLatencySeriesSelection({
    filters,
    filtersReady,
    comparePreviousDay,
    onError: setErrorMessage,
    initialIds: initialGatewayIdentities,
    onSelectionChange: (identities) => persistIdentities("g", identities),
  });
  const participantChart = useLatencySeriesSelection({
    filters,
    filtersReady,
    comparePreviousDay,
    onError: setErrorMessage,
    initialIds: initialParticipantIdentities,
    onSelectionChange: (identities) => persistIdentities("p", identities),
  });

  const gatewayRows = useNestedLatencyRows({
    hierarchy: "gateway",
    filters: gatewayGridFilters,
    filtersReady,
    selectedIds: gatewayChart.selectedIds,
    onError: setErrorMessage,
  });
  const participantRows = useNestedLatencyRows({
    hierarchy: "participant",
    filters: participantGridFilters,
    filtersReady,
    selectedIds: participantChart.selectedIds,
    onError: setErrorMessage,
  });

  const handleDateDayChange = (date: string) => {
    setUrlDate(date);
  };

  // The toolbar metric select drives whichever chart(s) the view shows.
  const handleChartMetricChange = (event: SelectChangeEvent<MetricKey>) => {
    const next = event.target.value as MetricKey;
    if (viewMode === "series") {
      setSeriesChartMetric(next);
    } else {
      setChartMetric(next);
    }
  };

  const handleGatewayCsvExport = useCallback(() => {
    const { headers, data } = buildRowsCsv(gatewayRows.rows, [
      { field: "gateway_name", header: "Gateway" },
      { field: "participant_name", header: "Participant" },
      { field: "node_instance", header: "Instance" },
      { field: "portsDisplay", header: "Ports" },
    ]);
    downloadCsv(`gateway-latency-${filters.date}.csv`, headers, data);
  }, [filters.date, gatewayRows.rows]);

  const handleParticipantCsvExport = useCallback(() => {
    const { headers, data } = buildRowsCsv(participantRows.rows, [
      { field: "gw_node", header: "Gateway" },
      { field: "node_instance", header: "Instance" },
      { field: "portsDisplay", header: "Ports" },
    ]);
    downloadCsv(`participant-latency-${filters.date}.csv`, headers, data);
  }, [filters.date, participantRows.rows]);

  const showGateway = viewMode === "both" || viewMode === "gateway";
  const showParticipant = viewMode === "both" || viewMode === "participant";
  const showSeries = viewMode === "series";

  const gridColumns = viewMode === "both" ? 2 : 1;

  return (
    <Box
      sx={{
        height: "calc(100vh - 32px)",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 1.5,
        bgcolor: "background.default",
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 850, mr: 0.5 }} noWrap>
          Nested Latency Explorer
        </Typography>

        <DateDayPicker
          selectedDate={filters.date}
          onDateChange={handleDateDayChange}
          isLoading={false}
          isDisabled={false}
          sx={{ width: 150 }}
        />

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="chart-metric-label">Chart metric</InputLabel>
          <Select
            labelId="chart-metric-label"
            label="Chart metric"
            value={showSeries ? seriesChartMetric : chartMetric}
            onChange={handleChartMetricChange}
          >
            {METRIC_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {showGateway && (
          <Box sx={{ width: 180 }}>
            <TextInputFilterWithDebounce
              label="Gateway search"
              onDebouncedChange={setGatewayQuery}
            />
          </Box>
        )}

        {showParticipant && (
          <Box sx={{ width: 180 }}>
            <TextInputFilterWithDebounce
              label="Participant search"
              onDebouncedChange={setParticipantQuery}
            />
          </Box>
        )}

        {showSeries && (
          <Box sx={{ width: 180 }}>
            <TextInputFilterWithDebounce
              label="Series search"
              onDebouncedChange={setSeriesQuery}
            />
          </Box>
        )}

        <TextField
          size="small"
          label="Min orders"
          type="number"
          value={minOrders}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            setMinOrders(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
          }}
          sx={{ width: 110 }}
        />

        <ThresholdControl value={threshold} onChange={setThreshold} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_event, next) => {
            if (next) setViewMode(next as NestedLatencyViewMode);
          }}
        >
          {VIEW_MODE_OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <ToggleButton
          size="small"
          value="prev"
          selected={comparePreviousDay}
          onChange={() => setComparePreviousDay((prev) => !prev)}
          sx={{ px: 1.5 }}
        >
          Compare prev day
        </ToggleButton>

        <Box sx={{ ml: "auto" }}>
          <FreshnessChip info={freshness.info} />
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

      {showSeries ? (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            // Charts get the slightly larger share of the height.
            gridTemplateRows: "minmax(0, 1fr) minmax(320px, 1.15fr)",
            gap: 1,
          }}
        >
          <SeriesLeaderboard
            filters={seriesGridFilters}
            filtersReady={filtersReady}
            baseline={baseline}
            onError={setErrorMessage}
            onSelect={setSelectedSeriesName}
            selectedName={selectedSeriesName}
          />
          <SeriesDailyHistoryChart
            seriesName={selectedSeriesName}
            metric={seriesChartMetric}
            registerChart={registerChart}
          />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns:
              gridColumns === 2
                ? "minmax(0, 1fr) minmax(0, 1fr)"
                : "minmax(0, 1fr)",
            // Charts get the slightly larger share of the height.
            gridTemplateRows: "minmax(0, 1fr) minmax(320px, 1.15fr)",
            gap: 1,
          }}
        >
          {showGateway && (
            <NestedLatencyGrid
              title="Gateway hierarchy"
              hierarchy="gateway"
              rows={gatewayRows.rows}
              loading={gatewayRows.rootLoading}
              loadedCount={gatewayRows.loadedCount}
              totalCount={gatewayRows.total}
              sortModel={gatewayRows.sortModel}
              onSortModelChange={gatewayRows.setSortModel}
              onToggleExpanded={gatewayRows.toggleExpanded}
              onToggleSeries={gatewayChart.toggle}
              onLoadMore={gatewayRows.loadMoreForRow}
              loadingSeriesIds={gatewayChart.loadingIds}
              colorOf={gatewayChart.colorOf}
              baseline={baseline}
              onExportCsv={handleGatewayCsvExport}
            />
          )}

          {showParticipant && (
            <NestedLatencyGrid
              title="Participant hierarchy"
              hierarchy="participant"
              rows={participantRows.rows}
              loading={participantRows.rootLoading}
              loadedCount={participantRows.loadedCount}
              totalCount={participantRows.total}
              sortModel={participantRows.sortModel}
              onSortModelChange={participantRows.setSortModel}
              onToggleExpanded={participantRows.toggleExpanded}
              onToggleSeries={participantChart.toggle}
              onLoadMore={participantRows.loadMoreForRow}
              loadingSeriesIds={participantChart.loadingIds}
              colorOf={participantChart.colorOf}
              baseline={baseline}
              onExportCsv={handleParticipantCsvExport}
            />
          )}

          {showGateway && (
            <LatencyChartCard
              entities={gatewayChart.entities}
              loading={gatewayChart.loading}
              onClear={gatewayChart.clear}
              registerChart={registerChart}
              metric={chartMetric}
              comparePreviousDay={comparePreviousDay}
            />
          )}

          {showParticipant && (
            <LatencyChartCard
              entities={participantChart.entities}
              loading={participantChart.loading}
              onClear={participantChart.clear}
              registerChart={registerChart}
              metric={chartMetric}
              comparePreviousDay={comparePreviousDay}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
