import type React from 'react'
import { matchPath } from 'react-router-dom'
import BarChartIcon from '@mui/icons-material/BarChart'
import SyncAltIcon from '@mui/icons-material/SyncAlt'
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'

// Single source of truth for the app's navigable pages: drives the Sidebar
// items (label/icon/section, filtered by page access), the TopBar heading and
// document.title (title), PageTracker's pageTitle, and the RequirePage
// wrappers in App.tsx. Add a page here and every consumer picks it up.
//
// Access is no longer hardcoded role arrays: each page carries a pageCode
// matching the backend's PageCodes.java, and WHICH ROLES see a page is data
// in stat.lr_role_pages, edited on the admin page — no redeploy needed. The
// admin page itself is the one exception: always ADMIN-role-gated in code,
// so no admin can ever lock admins out of it.

export const PAGE_CODES = {
  LATENCY_DAILY: 'LATENCY_DAILY',
  LATENCY_RTT: 'LATENCY_RTT',
  LATENCY_GROUPED: 'LATENCY_GROUPED',
  TRANSACTIONS: 'TRANSACTIONS',
  ANALYTICS: 'ANALYTICS',
} as const

export interface RouteMeta {
  path: string
  label: string          // sidebar entry text
  title: string          // TopBar heading + document.title + page tracking
  icon: React.ReactNode
  section: 'primary' | 'operation'
  pageCode?: string      // absent + !adminOnly = visible to every authenticated user
  adminOnly?: boolean    // the admin page: gated by the ADMIN role, not by pageCode
  end?: boolean          // exact path matching for the active state
  badge?: string | null
}

export const ROUTE_META: RouteMeta[] = [
  {
    path: '/latency/daily',
    label: 'Daily Latency Statistics',
    title: 'Daily Latency',
    icon: <BarChartIcon />,
    section: 'primary',
    pageCode: PAGE_CODES.LATENCY_DAILY,
    end: true,
  },
  {
    path: '/latency/rtt',
    label: 'Rtt Latency Statistics',
    title: 'RTT Latency',
    icon: <SyncAltIcon />,
    section: 'primary',
    pageCode: PAGE_CODES.LATENCY_RTT,
  },
  {
    path: '/latency/grouped',
    label: 'Grouped Latency Statistics',
    title: 'Grouped Latency',
    icon: <AssessmentRoundedIcon />,
    section: 'primary',
    pageCode: PAGE_CODES.LATENCY_GROUPED,
  },
  {
    // end stays false so /transactions/:publicId (the shareable results
    // route) inherits this entry's title and sidebar highlight.
    path: '/transactions',
    label: 'Transaction Search',
    title: 'Transaction Search',
    icon: <ManageSearchIcon />,
    section: 'primary',
    pageCode: PAGE_CODES.TRANSACTIONS,
  },
  {
    path: '/analytics/page',
    label: 'Page Visit Analytics',
    title: 'Page Visit Analytics',
    icon: <AnalyticsIcon />,
    section: 'operation',
    pageCode: PAGE_CODES.ANALYTICS,
  },
  {
    path: '/admin',
    label: 'Admin',
    title: 'Admin',
    icon: <AdminPanelSettingsRoundedIcon />,
    section: 'operation',
    adminOnly: true,
  },
]

export function findRouteMeta(pathname: string): RouteMeta | null {
  return (
    ROUTE_META.find(item =>
      matchPath({ path: item.path, end: item.end ?? false }, pathname),
    ) ?? null
  )
}
