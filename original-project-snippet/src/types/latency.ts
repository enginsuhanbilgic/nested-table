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
};

export type DateInterval = {
  from: DateString;
  to: DateString;
};

export type DateFilter = {
  date: DateString;
};

export type LatencyFilterOption<TId extends string = string> = {
  id: TId;
  label: string;
};

export type PageResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};

///
/// Daily Latency Statistics (legacy pages -- kept for compatibility)
///

export type LatencyFilterOptions = {
  locations: LatencyFilterOption<Location>[];
  markets: LatencyFilterOption<Market>[];
  partitions: LatencyFilterOption<Partition>[];
  protocols: LatencyFilterOption<Protocol>[];
};

export type GeneralLatencyFilter = {
  locations: Location[];
  markets: Market[];
  partitions: Partition[];
  protocols: Protocol[];
};

export type GeneralLatencyItem = {
  totalOrderCount: number;
  slaOrderCount: number;
  slaRatio: number;
  median: number;
  average: number;
  min: number;
  max: number;
};

///
/// Rtt Latency Statistics (legacy)
///

// One histogram bucket boundary served by /latency/types/rtt/ranges.
// `index` is 1-based and matches the backend's range{index} column;
// `toMicros === null` marks the open-ended last bucket.
export type RttBucketRange = {
  index: number;
  fromMicros: number;
  toMicros: number | null;
};

export type RttFilterOptions = {
  rttLatencyTypes: LatencyFilterOption<RttLatency>[];
  rttGatewayTypes: LatencyFilterOption<RttGateway>[];
  rttBucketRanges: RttBucketRange[];
};

export type GeneralRttFilter = {
  latencyType: RttLatency;
  gatewayType: RttGateway;
};

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
};

///
/// User Latency Statistics (legacy page)
///

export type UserLatencyFilterOptions = {
  locations: LatencyFilterOption<Location>[];
  partitions: LatencyFilterOption<Partition>[];
  protocols: LatencyFilterOption<Protocol>[];
};

export type GeneralUserLatencyFilter = {
  queryString: string;
  locations: Location[];
  partitions: Partition[];
  protocols: Protocol[];
};

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
};

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

export type MinuteCacheEntry = {
  data: LatencyMinuteStatsResponse;
  cachedAt: number;
};

///
/// Nested Latency Explorer
///
/// Contracts here mirror the stat.v_* views from the latency-stats
/// pipeline. Latencies are microseconds; timestamps in freshness are ISO 8601.
///

export type NestedLatencyEntityType =
  | "gateway"
  | "instance"
  | "participant"
  | "user"
  | "series";

export type NestedLatencyViewMode =
  | "both"
  | "gateway"
  | "participant"
  | "series";

export type NestedLatencyMetricKey =
  | "me_med"
  | "me_avg"
  | "me_max"
  | "me_min"
  | "me_p99"
  | "gw_med"
  | "gw_avg"
  | "gw_max"
  | "gw_min"
  | "gw_p99";

export type NestedLatencyThresholdOperator = ">" | ">=" | "<" | "<=";

export type NestedLatencyThreshold = {
  metric: NestedLatencyMetricKey;
  operator: NestedLatencyThresholdOperator;
  value: number;
};

// Every stat row exposes med / avg / max / min / p99 for both me and gw.
export type NestedLatencyMetricFields = {
  me_med: number | null;
  me_avg: number | null;
  me_max: number | null;
  me_min: number | null;
  me_p99: number | null;
  gw_med: number | null;
  gw_avg: number | null;
  gw_max: number | null;
  gw_min: number | null;
  gw_p99: number | null;
};

export type NestedLatencyCommonMeasures = {
  num_orders: number;
  num_orders_in_peak_times: number;
  peak_ratio: number | null;
};

export type GatewayLatencyItem = NestedLatencyMetricFields &
  NestedLatencyCommonMeasures & {
    name: string;
    num_instances: number;
    num_users: number;
  };

export type InstanceLatencyItem = NestedLatencyMetricFields &
  NestedLatencyCommonMeasures & {
    name: string;
    gateway_name: string;
    num_users: number;
  };

export type ParticipantLatencyItem = NestedLatencyMetricFields &
  NestedLatencyCommonMeasures & {
    name: string;
    num_users: number;
  };

export type NestedUserLatencyItem = NestedLatencyMetricFields &
  NestedLatencyCommonMeasures & {
    name: string;
    participant_name?: string;
    gw_node?: string;
    node_instance?: string;
    ports: number[];
  };

export type SeriesLatencyItem = NestedLatencyMetricFields &
  NestedLatencyCommonMeasures & {
    name: string;
    num_users: number;
  };

// One minute bucket of an entity's series latency (charts).
export type NestedLatencySeriesPoint = NestedLatencyMetricFields &
  Time & {
    no_ord: number;
  };

// One day of an entity's history (series-mode chart plots days, not minutes).
export type NestedLatencyDailyHistoryPoint = NestedLatencyMetricFields & {
  date: DateString;
  no_ord: number;
};

export type NestedLatencySeriesIdentity = {
  entityType: NestedLatencyEntityType;
  name: string;
  participantName?: string;
  gatewayName?: string;
  instanceName?: string;
};

export type NestedLatencyFilters = {
  date: DateString;
  minOrders: number;
  threshold: NestedLatencyThreshold | null;
};

export type NestedLatencyGridFilters = NestedLatencyFilters & {
  queryString: string;
};

export type NestedLatencySeriesFilters = NestedLatencyFilters &
  NestedLatencySeriesIdentity;

export type NestedGatewayInstancesFilters = NestedLatencyGridFilters & {
  gatewayName: string;
};

export type NestedInstanceUsersFilters = NestedLatencyGridFilters & {
  gatewayName: string;
  instanceName: string;
};

export type NestedParticipantUsersFilters = NestedLatencyGridFilters & {
  participantName: string;
};

export type SeriesHistoryFilters = {
  name: string;
  days: number;
};

// Sent to the /freshness endpoint (age of the most recent watermark).
export type DataFreshnessInfo = {
  date: DateString;
  updated_at: string; // ISO 8601 timestamp
};

// Exchange-wide baseline latencies used for relative colour thresholds.
export type ExchangeBaseline = {
  date: DateString;
  me_med: number | null;
  me_p99: number | null;
  gw_med: number | null;
  gw_p99: number | null;
};

export type GatewayLatencyResponse = PageResponse<GatewayLatencyItem>;
export type InstanceLatencyResponse = PageResponse<InstanceLatencyItem>;
export type ParticipantLatencyResponse = PageResponse<ParticipantLatencyItem>;
export type NestedUserLatencyResponse = PageResponse<NestedUserLatencyItem>;
export type SeriesLatencyResponse = PageResponse<SeriesLatencyItem>;
export type NestedLatencySeriesResponse = NestedLatencySeriesPoint[];
export type NestedLatencyDailyHistoryResponse =
  NestedLatencyDailyHistoryPoint[];
