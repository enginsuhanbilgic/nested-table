import { apiClient } from "./apiClient";
import type { GridSortModel } from "@mui/x-data-grid";
import type {
  DataFreshnessInfo,
  ExchangeBaseline,
  GatewayLatencyResponse,
  InstanceLatencyResponse,
  LatencyDailyAverageStatsFilters,
  LatencyDailyAverageStatsItem,
  LatencyDailyAverageStatsResponse,
  LatencyFilterOption,
  LatencyFilterOptions,
  LatencyMinuteStatsFilters,
  LatencyMinuteStatsItem,
  LatencyMinuteStatsResponse,
  Location,
  Market,
  NestedGatewayInstancesFilters,
  NestedInstanceUsersFilters,
  NestedLatencyDailyHistoryResponse,
  NestedLatencyFilters,
  NestedLatencyGridFilters,
  NestedLatencySeriesFilters,
  NestedLatencySeriesResponse,
  NestedParticipantUsersFilters,
  NestedUserLatencyResponse,
  PageResponse,
  ParticipantLatencyResponse,
  Partition,
  Protocol,
  RttBucketRange,
  RttFilterOptions,
  RttGateway,
  RttLatency,
  RttRangeFilters,
  RttRangeItem,
  RttRangeResponse,
  SeriesHistoryFilters,
  SeriesLatencyResponse,
  UserLatencyFilterOptions,
  UserLatencyFilters,
  UserLatencyItem,
  UserLatencyResponse,
} from "../types/latency";

type LatencyTypeName =
  | "location"
  | "market"
  | "partition"
  | "protocol"
  | "rtt/gateway"
  | "rtt/latency";

function serializeLatencyDailyAverageFilter(
  filter: LatencyDailyAverageStatsFilters,
): URLSearchParams {
  const params = new URLSearchParams();

  filter.markets.forEach((value) => params.append("markets", value));
  filter.partitions.forEach((value) => params.append("partitions", value));
  filter.protocols.forEach((value) => params.append("protocols", value));
  filter.locations.forEach((value) => params.append("locations", value));

  params.append("from", filter.from);
  params.append("to", filter.to);

  return params;
}

function serializeLatencyMinuteFilter(
  filter: LatencyMinuteStatsFilters,
): URLSearchParams {
  const params = new URLSearchParams();

  filter.markets.forEach((value) => params.append("markets", value));
  filter.partitions.forEach((value) => params.append("partitions", value));
  filter.protocols.forEach((value) => params.append("protocols", value));
  filter.locations.forEach((value) => params.append("locations", value));

  params.append("date", filter.date);

  return params;
}

function serializeRttRangeFilter(
  filter: RttRangeFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = new URLSearchParams();

  params.append("latencyType", filter.latencyType);
  params.append("gatewayType", filter.gatewayType);
  params.append("from", filter.from);
  params.append("to", filter.to);

  params.append("page", paginationModel.page.toString());
  params.append("size", paginationModel.pageSize.toString());

  if (sortModel.length > 0) {
    const sort = sortModel[0];
    const sortDirection = sort.sort === "asc" ? "asc" : "desc";
    params.append("sort", `${sort.field},${sortDirection}`);
  }

  return params;
}

function serializeUserLatencyFilter(
  filter: UserLatencyFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = new URLSearchParams();

  filter.partitions.forEach((value) => params.append("partitions", value));
  filter.protocols.forEach((value) => params.append("protocols", value));
  filter.locations.forEach((value) => params.append("locations", value));

  params.append("date", filter.date);
  params.append("queryString", filter.queryString);

  params.append("page", paginationModel.page.toString());
  params.append("size", paginationModel.pageSize.toString());

  if (sortModel.length > 0) {
    const sort = sortModel[0];
    const sortDirection = sort.sort === "asc" ? "asc" : "desc";
    params.append("sort", `${sort.field},${sortDirection}`);
  }

  return params;
}

function appendCommonNestedLatencyFilters(
  params: URLSearchParams,
  filter: NestedLatencyFilters,
) {
  params.append("date", filter.date);

  if (filter.minOrders > 0) {
    params.append("minOrders", filter.minOrders.toString());
  }

  if (filter.threshold) {
    params.append("thresholdMetric", filter.threshold.metric);
    params.append("thresholdOp", filter.threshold.operator);
    params.append("thresholdValue", filter.threshold.value.toString());
  }
}

function appendGridQuery(
  params: URLSearchParams,
  filter: NestedLatencyGridFilters,
) {
  if (filter.queryString) {
    params.append("queryString", filter.queryString);
  }
}

function appendPagingAndSorting(
  params: URLSearchParams,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
) {
  params.append("page", paginationModel.page.toString());
  params.append("size", paginationModel.pageSize.toString());

  if (sortModel.length > 0) {
    const sort = sortModel[0];
    const sortDirection = sort.sort === "asc" ? "asc" : "desc";
    params.append("sort", `${sort.field},${sortDirection}`);
  }
}

function serializeNestedLatencyPageFilter(
  filter: NestedLatencyGridFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = new URLSearchParams();

  appendCommonNestedLatencyFilters(params, filter);
  appendGridQuery(params, filter);
  appendPagingAndSorting(params, paginationModel, sortModel);

  return params;
}

function serializeNestedGatewayInstancesFilter(
  filter: NestedGatewayInstancesFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = serializeNestedLatencyPageFilter(
    filter,
    paginationModel,
    sortModel,
  );
  params.append("gatewayName", filter.gatewayName);
  return params;
}

function serializeNestedInstanceUsersFilter(
  filter: NestedInstanceUsersFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = serializeNestedLatencyPageFilter(
    filter,
    paginationModel,
    sortModel,
  );
  params.append("gatewayName", filter.gatewayName);
  params.append("instanceName", filter.instanceName);
  return params;
}

function serializeNestedParticipantUsersFilter(
  filter: NestedParticipantUsersFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = serializeNestedLatencyPageFilter(
    filter,
    paginationModel,
    sortModel,
  );
  params.append("participantName", filter.participantName);
  return params;
}

function serializeNestedLatencySeriesFilter(
  filter: NestedLatencySeriesFilters,
): URLSearchParams {
  const params = new URLSearchParams();

  appendCommonNestedLatencyFilters(params, filter);
  params.append("entityType", filter.entityType);
  params.append("name", filter.name);

  if (filter.participantName) {
    params.append("participantName", filter.participantName);
  }
  if (filter.gatewayName) {
    params.append("gatewayName", filter.gatewayName);
  }
  if (filter.instanceName) {
    params.append("instanceName", filter.instanceName);
  }

  return params;
}

function normalizeDailyStatsResponse(
  response: LatencyDailyAverageStatsResponse,
): LatencyDailyAverageStatsItem[] {
  return [...response].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeMinuteStatsResponse(
  response: LatencyMinuteStatsResponse,
): LatencyMinuteStatsItem[] {
  return [...response].sort((a, b) => {
    if (a.hour !== b.hour) {
      return a.hour - b.hour;
    }
    return a.minute - b.minute;
  });
}

function normalizeRttRangeResponse(
  response: RttRangeResponse,
): PageResponse<RttRangeItem> {
  return {
    content: [...response.content].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    page: response.page,
    size: response.size,
    totalElements: response.totalElements,
    totalPages: response.totalPages,
    first: response.first,
    last: response.last,
  };
}

function normalizeUserLatencyResponse(
  response: UserLatencyResponse,
): PageResponse<UserLatencyItem> {
  return {
    content: [...response.content].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    page: response.page,
    size: response.size,
    totalElements: response.totalElements,
    totalPages: response.totalPages,
    first: response.first,
    last: response.last,
  };
}

///
/// General latency stats
///

export async function getDailyAverageLatencyStats(
  filter: LatencyDailyAverageStatsFilters,
): Promise<LatencyDailyAverageStatsResponse> {
  const params = serializeLatencyDailyAverageFilter(filter);

  const response = await apiClient.get<LatencyDailyAverageStatsResponse>(
    "/latency/getLatencyDailyAverageStats",
    { params },
  );

  return normalizeDailyStatsResponse(response.data);
}

export async function getMinuteLatencyStats(
  filter: LatencyMinuteStatsFilters,
): Promise<LatencyMinuteStatsResponse> {
  const params = serializeLatencyMinuteFilter(filter);

  const response = await apiClient.get<LatencyMinuteStatsResponse>(
    "/latency/getLatencyMinuteStats",
    { params },
  );

  return normalizeMinuteStatsResponse(response.data);
}

///
/// Rtt Latency Stats
///

export async function getRttLatencyStats(
  filter: RttRangeFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<RttRangeResponse> {
  const params = serializeRttRangeFilter(filter, paginationModel, sortModel);

  const response = await apiClient.get<RttRangeResponse>(
    "/latency/getRttRangeStats",
    { params },
  );

  return normalizeRttRangeResponse(response.data);
}

///
/// User Latency Stats (legacy)
///

export async function getUserLatencyStats(
  filter: UserLatencyFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<UserLatencyResponse> {
  const params = serializeUserLatencyFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<UserLatencyResponse>(
    "/latency/getUserLatencyStats",
    { params },
  );

  return normalizeUserLatencyResponse(response.data);
}

///
/// Nested Latency Explorer
///

export async function getNestedGatewayNodes(
  filter: NestedLatencyGridFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<GatewayLatencyResponse> {
  const params = serializeNestedLatencyPageFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<GatewayLatencyResponse>(
    "/latency/nested/gateways",
    { params },
  );

  return response.data;
}

export async function getNestedGatewayInstances(
  filter: NestedGatewayInstancesFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<InstanceLatencyResponse> {
  const params = serializeNestedGatewayInstancesFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<InstanceLatencyResponse>(
    "/latency/nested/gateway-instances",
    { params },
  );

  return response.data;
}

export async function getNestedInstanceUsers(
  filter: NestedInstanceUsersFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<NestedUserLatencyResponse> {
  const params = serializeNestedInstanceUsersFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<NestedUserLatencyResponse>(
    "/latency/nested/instance-users",
    { params },
  );

  return response.data;
}

export async function getNestedParticipants(
  filter: NestedLatencyGridFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<ParticipantLatencyResponse> {
  const params = serializeNestedLatencyPageFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<ParticipantLatencyResponse>(
    "/latency/nested/participants",
    { params },
  );

  return response.data;
}

export async function getNestedParticipantUsers(
  filter: NestedParticipantUsersFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<NestedUserLatencyResponse> {
  const params = serializeNestedParticipantUsersFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<NestedUserLatencyResponse>(
    "/latency/nested/participant-users",
    { params },
  );

  return response.data;
}

export async function getNestedSeriesLeaderboard(
  filter: NestedLatencyGridFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<SeriesLatencyResponse> {
  const params = serializeNestedLatencyPageFilter(
    filter,
    paginationModel,
    sortModel,
  );

  const response = await apiClient.get<SeriesLatencyResponse>(
    "/latency/nested/series",
    { params },
  );

  return response.data;
}

export async function getNestedLatencySeries(
  filter: NestedLatencySeriesFilters,
): Promise<NestedLatencySeriesResponse> {
  const params = serializeNestedLatencySeriesFilter(filter);

  const response = await apiClient.get<NestedLatencySeriesResponse>(
    "/latency/nested/series-minute",
    { params },
  );

  return response.data;
}

export async function getNestedLatencyDailyHistory(
  filter: SeriesHistoryFilters,
): Promise<NestedLatencyDailyHistoryResponse> {
  const params = new URLSearchParams();
  params.append("name", filter.name);
  params.append("days", filter.days.toString());

  const response = await apiClient.get<NestedLatencyDailyHistoryResponse>(
    "/latency/nested/series-history",
    { params },
  );

  return response.data;
}

export async function getDataFreshness(): Promise<DataFreshnessInfo> {
  const response = await apiClient.get<DataFreshnessInfo>(
    "/latency/nested/freshness",
  );
  return response.data;
}

export async function getExchangeBaseline(
  date: string,
): Promise<ExchangeBaseline> {
  const params = new URLSearchParams();
  params.append("date", date);

  const response = await apiClient.get<ExchangeBaseline>(
    "/latency/nested/baseline",
    { params },
  );

  return response.data;
}

///
/// Filters related to legacy latency pages
///

async function getLatencyTypeOptions<TId extends string>(
  type: LatencyTypeName,
): Promise<LatencyFilterOption<TId>[]> {
  const response = await apiClient.get<LatencyFilterOption<TId>[]>(
    `/latency/types/${type}`,
  );
  return response.data;
}

export async function getLocationTypes(): Promise<
  LatencyFilterOption<Location>[]
> {
  return getLatencyTypeOptions<Location>("location");
}

export async function getMarketTypes(): Promise<
  LatencyFilterOption<Market>[]
> {
  return getLatencyTypeOptions<Market>("market");
}

export async function getPartitionTypes(): Promise<
  LatencyFilterOption<Partition>[]
> {
  return getLatencyTypeOptions<Partition>("partition");
}

export async function getProtocolTypes(): Promise<
  LatencyFilterOption<Protocol>[]
> {
  return getLatencyTypeOptions<Protocol>("protocol");
}

export async function getLatencyFilterOptions(): Promise<LatencyFilterOptions> {
  const [locations, markets, partitions, protocols] = await Promise.all([
    getLocationTypes(),
    getMarketTypes(),
    getPartitionTypes(),
    getProtocolTypes(),
  ]);

  return {
    markets,
    partitions,
    protocols,
    locations,
  };
}

export async function getRttLatencyTypes(): Promise<
  LatencyFilterOption<RttLatency>[]
> {
  return getLatencyTypeOptions<RttLatency>("rtt/latency");
}

export async function getRttGatewayTypes(): Promise<
  LatencyFilterOption<RttGateway>[]
> {
  return getLatencyTypeOptions<RttGateway>("rtt/gateway");
}

// Placeholder ladder used until the backend serves the real bucket
// boundaries via /latency/types/rtt/ranges. 36 buckets: 10µs steps to
// 100µs, 25µs steps to 300µs, 100µs steps to 800µs, then 800→1200 and
// doubling up to 2.46s, with an open-ended last bucket.
function buildDefaultRttBucketRanges(): RttBucketRange[] {
  const edges: number[] = [];
  for (let value = 0; value <= 100; value += 10) edges.push(value);
  for (let value = 125; value <= 300; value += 25) edges.push(value);
  for (let value = 400; value <= 800; value += 100) edges.push(value);
  edges.push(1200);
  for (let value = 2400; value <= 2_457_600; value *= 2) edges.push(value);

  return edges.map((fromMicros, i) => ({
    index: i + 1,
    fromMicros,
    toMicros: i + 1 < edges.length ? edges[i + 1] : null,
  }));
}

export const DEFAULT_RTT_BUCKET_RANGES: RttBucketRange[] =
  buildDefaultRttBucketRanges();

export async function getRttBucketRanges(): Promise<RttBucketRange[]> {
  try {
    const response = await apiClient.get<RttBucketRange[]>(
      "/latency/types/rtt/ranges",
    );

    const ranges = [...response.data].sort((a, b) => a.index - b.index);

    return ranges.length > 0 ? ranges : DEFAULT_RTT_BUCKET_RANGES;
  } catch (error) {
    console.warn(
      "Could not load RTT bucket ranges from backend; using built-in defaults",
      error,
    );
    return DEFAULT_RTT_BUCKET_RANGES;
  }
}

export async function getRttFilterOptions(): Promise<RttFilterOptions> {
  const [rttLatencyTypes, rttGatewayTypes, rttBucketRanges] =
    await Promise.all([
      getRttLatencyTypes(),
      getRttGatewayTypes(),
      getRttBucketRanges(),
    ]);

  return {
    rttLatencyTypes,
    rttGatewayTypes,
    rttBucketRanges,
  };
}

export async function getUserLatencyFilterOptions(): Promise<UserLatencyFilterOptions> {
  const [locations, partitions, protocols] = await Promise.all([
    getLocationTypes(),
    getPartitionTypes(),
    getProtocolTypes(),
  ]);

  return {
    locations,
    partitions,
    protocols,
  };
}
