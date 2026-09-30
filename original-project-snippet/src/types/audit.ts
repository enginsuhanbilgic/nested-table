export type DateString = string;

export interface UserPageHistoryLoggingRequest {
  pagePath: string
  pageTitle: string
  referrer: string
}

export interface UserPageHistoryFilterRequest {
  userId?: string
  roleCodeIn?: string[]
  pagePath?: string
  pagePathExact?: string
  pageTitle?: string
  referrer?: string
  userAgent?: string
  from: DateString
  to: DateString
}

export interface UserPageHistoryResponse {
  id: number
  userId: string
  username: string | null
  pagePath: string
  pageTitle: string | null
  visitTimestamp: string
  referrer: string | null
  userAgent: string | null
}

export interface PageHistorySummary {
  visits: number
  uniqueUsers: number
  uniquePages: number
  visitsPerUser: number
}
export interface PageHistoryActivity { bucket: string; visits: number; uniqueUsers: number }
export interface PageHistoryPage {
  pagePath: string
  pageTitle: string | null
  visits: number
  uniqueUsers: number
  sharePercent: number
  lastVisit: string
}
export interface PageHistoryUser {
  userId: string
  username: string
  visits: number
  uniquePages: number
  lastVisit: string
}
export interface PageHistoryOption { id: string; label: string }
export type PageHistoryOptionKind = 'users' | 'pages' | 'roles'
export interface HistoryPaging { page: number; size: number; sort: string }
