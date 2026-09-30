import type { DateString, PageResponse } from "./latency";

///
/// Transaction (order search) page
///
/// Contracts mirror the /api/transaction/* backend DTOs (snake_case keys).
///
/// UNITS: me_net_* / me_vrd_* times are NANOSECONDS since epoch; gw_net_*
/// times are MICROSECONDS since epoch; latencies are microseconds.
///
/// bigint safety: commit_id, order_id and the *_time epoch fields arrive as
/// JSON STRINGS -- the ns values exceed Number.MAX_SAFE_INTEGER, so the
/// backend serializes them with ToStringSerializer and all arithmetic on
/// them here goes through BigInt. Latencies are microseconds and fit in a
/// plain number.
///

export type OrderSearchStatus =
  | "QUEUED"
  | "RUNNING"
  | "DONE"
  | "NOT_FOUND"
  | "FAILED";

export type NeighborScope = "me" | "gw";

// One search (queue/history/cache row). created_at is when the shared
// execution was enqueued; requested_at is when THIS user (last) asked for it
// (filled on create and in history, null on the shared-link detail read).
// queue_position is filled only while QUEUED; hint_dates only on NOT_FOUND
// when the order exists on other dates.
export type OrderSearchItem = {
  public_id: string;
  order_id: string;
  tx_date: DateString;
  status: OrderSearchStatus;
  queue_position: number | null;
  hint_dates: DateString[] | null;
  created_at: string | null; // ISO 8601
  requested_at: string | null; // ISO 8601
  finished_at: string | null; // ISO 8601
  result_count: number | null;
};

// One me_pcap row -- shared column contract of the hits grid and the
// neighbors grid. me/vrd *_time = ns, gw *_time = µs (both as strings),
// *_latency = µs (number).
export type OrderPcapItem = {
  commit_id: string;
  order_id: string | null;
  tx_date: DateString | null;
  client_id: string | null;
  app_id: string | null;
  app_seq: number | null;
  status: number | null;
  node: string | null;
  partition: number | null;
  process: string | null;
  side: number | null;
  series: string | null;
  user_name: string | null;
  participant: string | null;
  market: string | null;
  account_id: string | null;
  input_message_type: string | null;
  connector_port: number | null;
  me_vrd_input_time: string | null;
  me_vrd_output_time: string | null;
  me_net_input_time: string | null;
  me_net_output_time: string | null;
  gw_net_input_time: string | null;
  gw_net_output_time: string | null;
  me_vrd_latency: number | null;
  me_net_latency: number | null;
  gw_net_latency: number | null;
};

export type OrderSearchDetail = {
  search: OrderSearchItem;
  hits: OrderPcapItem[]; // empty until status is DONE
};

// rows are sorted by the scope's input time and INCLUDE the reference order
// itself (identified by reference_commit_id) so the grid renders the
// highlighted row in place. window_ms / max_orders_per_side echo the clamped
// values the backend actually applied.
export type OrderNeighbors = {
  scope: NeighborScope;
  window_ms: number;
  max_orders_per_side: number;
  reference_commit_id: string;
  rows: OrderPcapItem[];
};

export type OrderSearchHistoryResponse = PageResponse<OrderSearchItem>;

export type NeighborQuery = {
  scope: NeighborScope;
  windowMs: number; // clamped to 1..50 per side by the backend
  maxOrders: number; // per side, clamped to 1..500 by the backend
};
