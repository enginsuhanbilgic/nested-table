export type Location = string;
export type Market = string;
export type Partition = string;
export type Protocol = string;

export type RttGateway = string;
export type RttLatency = string;

export type DateString = string; //e.g. 2026-05-18

export type Time = {
  hour: number;
  minute: number;
}

export type DateInterval = {
  from: DateString;
  to: DateString;
}

export type DateFilter = {
  date: DateString;
}

export type LatencyFilterOption<TId extends string = string> = {
  id: TId;
  label: string;
}

export type PageResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

///
/// Daily Latency Statistics
///

// This is what we get as filter options from the API for Daily Latency
export type LatencyFilterOptions = {
  locations: LatencyFilterOption<Location>[];
  markets: LatencyFilterOption<Market>[];
  partitions: LatencyFilterOption<Partition>[];
  protocols: LatencyFilterOption<Protocol>[];
}

// This is what we send to the API as filters to get data back
export type GeneralLatencyFilter = {
  locations: Location[];
  markets: Market[];
  partitions: Partition[];
  protocols: Protocol[];
}

// This is what is returned from the API as data
export type GeneralLatencyItem = {
  totalOrderCount: number;
  slaOrderCount: number;
  slaRatio: number;
  median: number;
  average: number;
  min: number;
  max: number;
}

///
/// Rtt Latency Statistics
///

// This is what we get as filter options from the API for RTT
export type RttFilterOptions = {
  rttLatencyTypes: LatencyFilterOption<RttLatency>[];
  rttGatewayTypes: LatencyFilterOption<RttGateway>[];
}

// This is what we send to the API as filters to get data back
export type GeneralRttFilter = {
  latencyType: RttLatency;
  gatewayType: RttGateway;
}

// This is what is returned from the API as data
export type GeneralRttItem = {
  date: DateString;
  gwType: string;
  totalNumberOfOrders: number;
  medLatency: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  gwLatNumberOfOrders: number;
  gwLatmedLatency: number;
  gwLatavgLatency: number;
  gwLatminLatency: number;
  gwLatmaxLatency: number;
  range1: number;
  range2: number;
  range3: number;
  range4: number;
  range5: number;
  range6: number;
  range7: number;
  range8: number;
  range9: number;
  range10: number;
  range11: number;
  range12: number;
  range13: number;
  range14: number;
  range15: number;
  range16: number;
  range17: number;
  range18: number;
  range19: number;
  range20: number;
  range21: number;
  range22: number;
  range23: number;
  range24: number;
  range25: number;
  range26: number;
  range27: number;
  range28: number;
  range29: number;
  range30: number;
  range31: number;
  range32: number;
  range33: number;
  range34: number;
  range35: number;
  range36: number;
}

///
/// User Latency Statistics
///

// This is what we get as filter options from the API for Daily Latency
export type UserLatencyFilterOptions = {
  locations: LatencyFilterOption<Location>[];
  partitions: LatencyFilterOption<Partition>[];
  protocols: LatencyFilterOption<Protocol>[];
}

// This is what we send to the API as filters to get data back
export type GeneralUserLatencyFilter = {
  queryString: string;
  locations: Location[];
  partitions: Partition[];
  protocols: Protocol[];
}

export type GeneralUserLatencyItem = {
  id: number;
  date: DateString;
  node: string;
  participantName: string;
  noParticipant: string;
  username: string;
  partition: string;
  process: string;
  location: string;
  protocol: string;
  noUser: number;
  noOrd: number;
  noOrdInVolatile: number;
  ratio: number;
  gwMed: number;
  gwAvg: number;
  gwMin: number;
  gwMax: number;
  meMed: number;
  meAvg: number;
  meMin: number;
  meMax: number;
}

export type LatencyDailyAverageStatsFilters = GeneralLatencyFilter & DateInterval;
export type LatencyDailyAverageStatsItem = GeneralLatencyItem & DateFilter;
export type LatencyDailyAverageStatsResponse = LatencyDailyAverageStatsItem[];

export type LatencyMinuteStatsFilters = GeneralLatencyFilter & DateFilter;
export type LatencyMinuteStatsItem = GeneralLatencyItem & DateFilter & Time;
export type LatencyMinuteStatsResponse = LatencyMinuteStatsItem[];

export type RttRangeFilters = GeneralRttFilter & DateInterval;
export type RttRangeItem = GeneralRttItem;
export type RttRangeResponse = PageResponse<RttRangeItem>;

export type UserLatencyFilters = GeneralUserLatencyFilter & DateFilter;
export type UserLatencyItem = GeneralUserLatencyItem;
export type UserLatencyResponse = PageResponse<UserLatencyItem>;

export type MinuteCacheEntry = { data: LatencyMinuteStatsResponse; cachedAt: number; }

///
/// Nested Latency Explorer
///

export type NestedLatencyEntityType =
  | "gateway"
  | "instance"
  | "participant"
  | "user";

export type NestedLatencyFilterOptions = LatencyFilterOptions;

export type NestedLatencyFilters = GeneralLatencyFilter & DateFilter & {
  queryString: string;
}

export type NestedLatencyMetricFields = {
  me_med: number;
  me_avg: number;
  me_max: number;
  gw_med: number;
  gw_avg: number;
  gw_max: number;
}

export type GatewayLatencyItem = NestedLatencyMetricFields & {
  name: string;
  num_instances: number;
  num_users: number;
  num_orders: number;
  num_orders_in_peak_times: number;
}

export type InstanceLatencyItem = NestedLatencyMetricFields & {
  name: string;
  gateway_name: string;
  partition: Partition;
  num_users: number;
  num_orders: number;
  num_orders_in_peak_times: number;
}

export type ParticipantLatencyItem = NestedLatencyMetricFields & {
  name: string;
  num_users: number;
  num_orders: number;
  num_orders_in_peak_times: number;
}

export type NestedUserLatencyItem = NestedLatencyMetricFields & {
  name: string;
  participant_name?: string;
  gw_node?: string;
  node_instance?: string;
  port: string;
  num_orders: number;
  num_orders_in_peak_times: number;
}

export type NestedLatencySeriesPoint = NestedLatencyMetricFields & Time;

export type NestedLatencySeriesIdentity = {
  entityType: NestedLatencyEntityType;
  name: string;
  participantName?: string;
  gatewayName?: string;
  instanceName?: string;
}

export type NestedLatencySeriesFilters =
  NestedLatencyFilters & NestedLatencySeriesIdentity;

export type NestedGatewayInstancesFilters = NestedLatencyFilters & {
  gatewayName: string;
}

export type NestedInstanceUsersFilters = NestedLatencyFilters & {
  gatewayName: string;
  instanceName: string;
}

export type NestedParticipantUsersFilters = NestedLatencyFilters & {
  participantName: string;
}

export type GatewayLatencyResponse = PageResponse<GatewayLatencyItem>;
export type InstanceLatencyResponse = PageResponse<InstanceLatencyItem>;
export type ParticipantLatencyResponse = PageResponse<ParticipantLatencyItem>;
export type NestedUserLatencyResponse = PageResponse<NestedUserLatencyItem>;
export type NestedLatencySeriesResponse = NestedLatencySeriesPoint[];
