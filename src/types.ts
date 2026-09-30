export interface Metrics {
  avg: number;
  med: number;
  max: number;
}

/** One sample of latency at a given minute of the day. */
export interface MinutePoint {
  t: string;
  avg: number;
  med: number;
  max: number;
}

export interface PageSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PageRequest {
  page: number;
  pageSize: number;
  sort?: PageSort;
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  nextPage: number | null;
}

/** Generic node contract consumed by the reusable nested grid. */
export interface EntityNode {
  id: string;
  name: string;
  level: number;
  daily: Metrics;
  extra: Record<string, string | number>;
  hasChildren: boolean;
}
