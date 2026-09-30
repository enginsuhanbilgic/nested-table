// Mirrors the backend dto/user records served by /api/admin/**.

export type GrantSource = 'SYNC' | 'MANUAL'

export interface RoleAssignment {
  roleCode: string
  roleDisplayName: string
  source: GrantSource
  grantedBy: string | null
  grantedAt: string | null
}

export interface AdminUser {
  id: string
  username: string
  fullName: string
  organization: string | null
  email: string | null
  lastLoggedIn: string | null
  assignments: RoleAssignment[]
}

// Paged admin lists reuse PageResponse<T> from './latency' — the same
// envelope every latency endpoint already returns.

export interface AdminRole {
  id: number
  code: string
  displayName: string
  description: string | null
  active: boolean
  syncAssignable: boolean
  manualAssignable: boolean
  /** ADMIN / STANDARD_USER: cannot be deactivated or deleted. */
  system: boolean
  pageCodes: string[]
  holderCount: number
}

export interface RolePayload {
  code?: string
  displayName: string
  description?: string | null
  active?: boolean
  syncAssignable?: boolean
  manualAssignable?: boolean
  pageCodes?: string[]
}

export type CnMatchMode = 'EXACT' | 'CONTAINS'

export interface CnRule {
  id: number
  roleCode: string
  roleDisplayName: string
  cnValue: string
  /** Normalized comparison key — shown so a non-matching rule is diagnosable. */
  cnKey: string
  matchMode: CnMatchMode
  active: boolean
  description: string | null
  updatedBy: string
  updatedAt: string
}

export interface CnRulePayload {
  roleCode: string
  cnValue: string
  matchMode?: CnMatchMode
  active?: boolean
  description?: string | null
}

export interface ManualRevokeResult {
  roleCode: string
  manualRemoved: boolean
  stillSyncAssigned: boolean
}

export interface AuditEntry {
  id: number
  happenedAt: string
  action: string
  actor: string
  username: string | null
  roleCode: string | null
  detail: string | null
}
