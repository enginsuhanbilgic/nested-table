export type DateString = string;

export interface UserPageHistoryLoggingRequest {
  pagePath: string
  pageTitle: string
  referral: string
}

export interface UserPageHistoryFilterRequest {
  userId?: number
  userRoleIn?: string[]
  pagePath?: string
  pageTitle?: string
  referrer?: string
  userAgent?: string
  from: DateString;
  to: DateString;
}

export interface UserPageHistoryResponse {
  id: number
  username: string | null
  pagePath: string
  pageTitle: string | null
  visitTimestamp: string
  referrer: string | null
  userAgent: string | null
}
