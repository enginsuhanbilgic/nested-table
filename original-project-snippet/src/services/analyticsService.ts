import {
  UserPageHistoryLoggingRequest,
  UserPageHistoryFilterRequest,
  UserPageHistoryResponse
} from '../types/audit';
import { apiClient } from './apiClient'

export async function logPageHistory(log: UserPageHistoryLoggingRequest): Promise<void> {
  console.log("Sending page tracking log: ", log);
  await apiClient.post('/audit/pagehistory/log', log);
}

export async function getPageHistory(filter: UserPageHistoryFilterRequest | null): Promise<UserPageHistoryResponse[]> {
  const modifiedFilter = filter ? {...filter} : null;
  if (modifiedFilter?.userRoleIn) {
    modifiedFilter.userRoleIn = modifiedFilter.userRoleIn.map(role => role.replace('ROLE_', ''));
  }

  const response = await apiClient.get<UserPageHistoryResponse[]>('/audit/pagehistory/get',
    {
      params: modifiedFilter,
    }
  );
  return response.data;
}
