import { apiClient } from "./apiClient";
import { GridSortModel } from "@mui/x-data-grid";
import type {
  LatencyDailyAverageStatsFilters,
  LatencyDailyAverageStatsItem,
  LatencyDailyAverageStatsResponse,
  LatencyMinuteStatsFilters,
  LatencyMinuteStatsItem,
  LatencyMinuteStatsResponse,
  LatencyFilterOption,
  LatencyFilterOptions,
  Location,
  Market,
  Partition,
  Protocol,
  RttGateway,
  RttLatency,
  RttFilterOptions,
  RttRangeFilters,
  RttRangeItem,
  RttRangeResponse,
  PageResponse,
  UserLatencyFilterOptions,
  UserLatencyFilters,
  UserLatencyItem,
  UserLatencyResponse,
  NestedLatencyFilterOptions,
  NestedLatencyFilters,
  NestedGatewayInstancesFilters,
  NestedInstanceUsersFilters,
  NestedParticipantUsersFilters,
  NestedLatencySeriesFilters,
  GatewayLatencyResponse,
  InstanceLatencyResponse,
  ParticipantLatencyResponse,
  NestedUserLatencyResponse,
  NestedLatencySeriesResponse,
} from "../types/latency";

type LatencyTypeName =
  | "location"
  | "market"
  | "partition"
  | "protocol"
  | "rtt/gateway"
  | "rtt/latency";

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

  // Paging related parameters: page, size, sort
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
  filter.locations.forEach((value) => params.append("locations", value));
  filter.markets.forEach((value) => params.append("markets", value));
  filter.partitions.forEach((value) => params.append("partitions", value));
  filter.protocols.forEach((value) => params.append("protocols", value));

  params.append("date", filter.date);
  params.append("queryString", filter.queryString);
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
  filter: NestedLatencyFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = new URLSearchParams();

  appendCommonNestedLatencyFilters(params, filter);
  appendPagingAndSorting(params, paginationModel, sortModel);

  return params;
}

function serializeNestedGatewayInstancesFilter(
  filter: NestedGatewayInstancesFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = serializeNestedLatencyPageFilter(filter, paginationModel, sortModel);
  params.append("gatewayName", filter.gatewayName);
  return params;
}

function serializeNestedInstanceUsersFilter(
  filter: NestedInstanceUsersFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = serializeNestedLatencyPageFilter(filter, paginationModel, sortModel);
  params.append("gatewayName", filter.gatewayName);
  params.append("instanceName", filter.instanceName);
  return params;
}

function serializeNestedParticipantUsersFilter(
  filter: NestedParticipantUsersFilters,
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = serializeNestedLatencyPageFilter(filter, paginationModel, sortModel);
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

  const response =
    await apiClient.get<LatencyDailyAverageStatsResponse>(
      "/latency/getLatencyDailyAverageStats",
      {
        params,
      },
    );

  return normalizeDailyStatsResponse(response.data);
}

export async function getMinuteLatencyStats(
  filter: LatencyMinuteStatsFilters,
): Promise<LatencyMinuteStatsResponse> {
  const params = serializeLatencyMinuteFilter(filter);

  const response = await apiClient.get<LatencyMinuteStatsResponse>(
    "/latency/getLatencyMinuteStats",
    {
      params,
    },
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
    {
      params,
    },
  );

  return normalizeRttRangeResponse(response.data);
}

///
/// User Latency Stats
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
    {
      params,
    },
  );

  return normalizeUserLatencyResponse(response.data);
}

///
/// Nested Latency Explorer
///

export async function getNestedGatewayNodes(
  filter: NestedLatencyFilters,
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
    {
      params,
    },
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
    {
      params,
    },
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
    {
      params,
    },
  );

  return response.data;
}

export async function getNestedParticipants(
  filter: NestedLatencyFilters,
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
    {
      params,
    },
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
    {
      params,
    },
  );

  return response.data;
}

export async function getNestedLatencySeries(
  filter: NestedLatencySeriesFilters,
): Promise<NestedLatencySeriesResponse> {
  const params = serializeNestedLatencySeriesFilter(filter);

  const response = await apiClient.get<NestedLatencySeriesResponse>(
    "/latency/nested/series",
    {
      params,
    },
  );

  return response.data;
}

///
/// Filters related to latency
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

export async function getNestedLatencyFilterOptions(): Promise<NestedLatencyFilterOptions> {
  return getLatencyFilterOptions();
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

export async function getRttFilterOptions(): Promise<RttFilterOptions> {
  const [rttLatencyTypes, rttGatewayTypes] = await Promise.all([
    getRttLatencyTypes(),
    getRttGatewayTypes(),
  ]);

  return {
    rttLatencyTypes,
    rttGatewayTypes,
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
