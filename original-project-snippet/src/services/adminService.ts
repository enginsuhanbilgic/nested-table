import { apiClient } from './apiClient'
import type { PageResponse } from '../types/latency'
import type {
  AdminRole,
  AdminUser,
  AuditEntry,
  CnRule,
  CnRulePayload,
  ManualRevokeResult,
  RoleAssignment,
  RolePayload,
} from '../types/admin'

// ---------------------------------------------------------------- users

export async function listUsers(
  search: string,
  page: number,
  size: number,
): Promise<PageResponse<AdminUser>> {
  const response = await apiClient.get<PageResponse<AdminUser>>('/admin/users', {
    params: { search: search || undefined, page, size },
  })
  return response.data
}

export async function grantRole(userId: string, roleCode: string): Promise<RoleAssignment> {
  const response = await apiClient.put<RoleAssignment>(
    `/admin/users/${userId}/roles/${encodeURIComponent(roleCode)}`,
  )
  return response.data
}

export async function revokeRole(userId: string, roleCode: string): Promise<ManualRevokeResult> {
  const response = await apiClient.delete<ManualRevokeResult>(
    `/admin/users/${userId}/roles/${encodeURIComponent(roleCode)}`,
  )
  return response.data
}

// ---------------------------------------------------------------- roles

export async function listRoles(): Promise<AdminRole[]> {
  const response = await apiClient.get<AdminRole[]>('/admin/roles')
  return response.data
}

export async function createRole(payload: RolePayload): Promise<AdminRole> {
  const response = await apiClient.post<AdminRole>('/admin/roles', payload)
  return response.data
}

export async function updateRole(code: string, payload: RolePayload): Promise<AdminRole> {
  const response = await apiClient.put<AdminRole>(
    `/admin/roles/${encodeURIComponent(code)}`,
    payload,
  )
  return response.data
}

export async function deleteRole(code: string): Promise<void> {
  await apiClient.delete(`/admin/roles/${encodeURIComponent(code)}`)
}

/** Page code → human label, for the role editor's checkboxes. */
export async function listPages(): Promise<Record<string, string>> {
  const response = await apiClient.get<Record<string, string>>('/admin/pages')
  return response.data
}

// ---------------------------------------------------------------- CN rules

export async function listCnRules(): Promise<CnRule[]> {
  const response = await apiClient.get<CnRule[]>('/admin/cn-rules')
  return response.data
}

export async function createCnRule(payload: CnRulePayload): Promise<CnRule> {
  const response = await apiClient.post<CnRule>('/admin/cn-rules', payload)
  return response.data
}

export async function updateCnRule(id: number, payload: CnRulePayload): Promise<CnRule> {
  const response = await apiClient.put<CnRule>(`/admin/cn-rules/${id}`, payload)
  return response.data
}

export async function deleteCnRule(id: number): Promise<void> {
  await apiClient.delete(`/admin/cn-rules/${id}`)
}

// ---------------------------------------------------------------- audit

export async function listAudit(page: number, size: number): Promise<PageResponse<AuditEntry>> {
  const response = await apiClient.get<PageResponse<AuditEntry>>('/admin/audit', {
    params: { page, size },
  })
  return response.data
}
