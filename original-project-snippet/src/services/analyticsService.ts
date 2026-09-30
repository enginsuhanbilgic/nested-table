import type {
  UserPageHistoryLoggingRequest, UserPageHistoryFilterRequest, UserPageHistoryResponse,
  PageHistorySummary, PageHistoryActivity, PageHistoryPage, PageHistoryUser,
  PageHistoryOption, PageHistoryOptionKind, HistoryPaging,
} from '../types/audit';
import type { PageResponse } from '../types/latency';
import { apiClient } from './apiClient';
import { serializeHistoryParams } from './pageHistoryUtils';

export async function logPageHistory(log: UserPageHistoryLoggingRequest): Promise<void> {
  console.log("Sending page tracking log: ", log);
  await apiClient.post('/audit/pagehistory/log', log);
}

async function read<T>(endpoint: string, filter: UserPageHistoryFilterRequest,
  extra: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await apiClient.get<T>(`/audit/pagehistory/${endpoint}`, {
    params: { ...filter, ...extra },
    paramsSerializer: { serialize: serializeHistoryParams },
    signal,
  });
  return response.data;
}

export const getPageHistory = (filter: UserPageHistoryFilterRequest, paging: HistoryPaging, signal?: AbortSignal) =>
  read<PageResponse<UserPageHistoryResponse>>('get', filter, { ...paging }, signal);
export const getPageHistorySummary = (filter: UserPageHistoryFilterRequest, signal?: AbortSignal) =>
  read<PageHistorySummary>('summary', filter, {}, signal);
export const getPageHistoryActivity = (filter: UserPageHistoryFilterRequest, day?: string, signal?: AbortSignal) =>
  read<PageHistoryActivity[]>('activity', filter, { day }, signal);
export const getPageHistoryPages = (filter: UserPageHistoryFilterRequest, paging: HistoryPaging, signal?: AbortSignal) =>
  read<PageResponse<PageHistoryPage>>('pages', filter, { ...paging }, signal);
export const getPageHistoryUsers = (filter: UserPageHistoryFilterRequest, paging: HistoryPaging, signal?: AbortSignal) =>
  read<PageResponse<PageHistoryUser>>('users', filter, { ...paging }, signal);
export const getPageHistoryOptions = (filter: UserPageHistoryFilterRequest, kind: PageHistoryOptionKind,
  search: string, signal?: AbortSignal) => read<PageHistoryOption[]>('filter-options', filter, { kind, search }, signal);
