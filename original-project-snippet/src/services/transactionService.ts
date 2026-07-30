import { apiClient } from "./apiClient";
import type { GridSortModel } from "@mui/x-data-grid";
import type { DateString } from "../types/latency";
import type {
  NeighborQuery,
  OrderNeighbors,
  OrderSearchDetail,
  OrderSearchHistoryResponse,
  OrderSearchItem,
} from "../types/transaction";

///
/// Transaction (order search) page
///

function serializeHistoryQuery(
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): URLSearchParams {
  const params = new URLSearchParams();

  params.append("page", paginationModel.page.toString());
  params.append("size", paginationModel.pageSize.toString());

  if (sortModel.length > 0) {
    const sort = sortModel[0];
    const sortDirection = sort.sort === "asc" ? "asc" : "desc";
    params.append("sort", `${sort.field},${sortDirection}`);
  }

  return params;
}

// Enqueues a search or returns the reusable cached/in-flight execution, and
// records it in the caller's history either way. order_id travels as a
// string (bigint safety); the backend coerces it back to a long.
export async function createOrderSearch(
  orderId: string,
  txDate: DateString,
): Promise<OrderSearchItem> {
  const response = await apiClient.post<OrderSearchItem>(
    "/transaction/searches",
    { order_id: orderId, tx_date: txDate },
  );

  return response.data;
}

export async function getOrderSearchHistory(
  paginationModel: { page: number; pageSize: number },
  sortModel: GridSortModel,
): Promise<OrderSearchHistoryResponse> {
  const params = serializeHistoryQuery(paginationModel, sortModel);

  const response = await apiClient.get<OrderSearchHistoryResponse>(
    "/transaction/searches",
    { params },
  );

  return response.data;
}

// The shareable-link read: never writes anything, so opening a link does not
// touch the viewer's history. 404 = unknown or purged.
export async function getOrderSearchDetail(
  publicId: string,
): Promise<OrderSearchDetail> {
  const response = await apiClient.get<OrderSearchDetail>(
    `/transaction/searches/${publicId}`,
  );

  return response.data;
}

export async function getOrderNeighbors(
  publicId: string,
  commitId: string,
  query: NeighborQuery,
): Promise<OrderNeighbors> {
  const params = new URLSearchParams();
  params.append("scope", query.scope);
  params.append("windowMs", query.windowMs.toString());
  params.append("maxOrders", query.maxOrders.toString());

  const response = await apiClient.get<OrderNeighbors>(
    `/transaction/searches/${publicId}/orders/${commitId}/neighbors`,
    { params },
  );

  return response.data;
}

///
/// bigint-safe helpers (ids and ns timestamps arrive as strings)
///

// "1753871422123456789" -> "10:30:22.123456" (local time, µs precision).
export function formatNsTimestamp(ns: string | null | undefined): string {
  if (!ns) {
    return "—";
  }

  try {
    const value = BigInt(ns);
    const millis = Number(value / 1_000_000n);
    const microsInMilli = Number((value % 1_000_000n) / 1_000n);
    const date = new Date(millis);

    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    const us = String(microsInMilli).padStart(3, "0");

    return `${hh}:${mm}:${ss}.${ms}${us}`;
  } catch {
    return ns;
  }
}

// Signed distance from the reference order in microseconds; null when either
// timestamp is missing. Safe: the difference is window-sized even though the
// operands are not.
export function nsOffsetMicros(
  ns: string | null | undefined,
  referenceNs: string | null | undefined,
): number | null {
  if (!ns || !referenceNs) {
    return null;
  }

  try {
    return Number((BigInt(ns) - BigInt(referenceNs)) / 1_000n);
  } catch {
    return null;
  }
}

// DataGrid sortComparator for bigint-string columns (client-sorted grids);
// plain string sorting would order "9" after "10".
export function compareBigintStrings(v1: unknown, v2: unknown): number {
  const s1 = v1 == null ? "" : String(v1);
  const s2 = v2 == null ? "" : String(v2);
  if (s1 === "" || s2 === "") {
    return s1 === s2 ? 0 : s1 === "" ? -1 : 1;
  }

  try {
    const diff = BigInt(s1) - BigInt(s2);
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  } catch {
    return s1.localeCompare(s2);
  }
}

export function formatInstant(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
