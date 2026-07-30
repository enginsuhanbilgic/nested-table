import type React from 'react'
import { matchPath } from 'react-router-dom'
import BarChartIcon from '@mui/icons-material/BarChart'
import SyncAltIcon from '@mui/icons-material/SyncAlt'
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import { Role } from '../types/auth'

// Single source of truth for the app's navigable pages: drives the Sidebar
// items (label/icon/section, filtered by roles), the TopBar heading and
// document.title (title), PageTracker's pageTitle, and the RequireRole
// wrappers in App.tsx (the exported role arrays). Add a page here and every
// consumer picks it up.

export const ANALYTICS_PAGE_ROLES: Role[] = ['ROLE_ADMIN', 'ROLE_ILETISIM_KANALLARI']
export const ADMIN_PAGE_ROLES: Role[] = ['ROLE_ADMIN']
export const TRANSACTION_PAGE_ROLES: Role[] = ['ROLE_ILETISIM_KANALLARI']

export interface RouteMeta {
  path: string
  label: string          // sidebar entry text
  title: string          // TopBar heading + document.title + page tracking
  icon: React.ReactNode
  section: 'primary' | 'operation'
  roles?: Role[]         // absent = visible to every authenticated user
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
    end: true,
  },
  {
    path: '/latency/rtt',
    label: 'Rtt Latency Statistics',
    title: 'RTT Latency',
    icon: <SyncAltIcon />,
    section: 'primary',
  },
  {
    path: '/latency/grouped',
    label: 'Grouped Latency Statistics',
    title: 'Grouped Latency',
    icon: <AssessmentRoundedIcon />,
    section: 'primary',
  },
  {
    // end stays false so /transactions/:publicId (the shareable results
    // route) inherits this entry's title and sidebar highlight.
    path: '/transactions',
    label: 'Transaction Search',
    title: 'Transaction Search',
    icon: <ManageSearchIcon />,
    section: 'primary',
    roles: TRANSACTION_PAGE_ROLES,
  },
  {
    path: '/analytics/page',
    label: 'Page Visit Analytics',
    title: 'Page Visit Analytics',
    icon: <AnalyticsIcon />,
    section: 'operation',
    roles: ANALYTICS_PAGE_ROLES,
  },
  {
    path: '/admin',
    label: 'Admin',
    title: 'Admin',
    icon: <AdminPanelSettingsRoundedIcon />,
    section: 'operation',
    roles: ADMIN_PAGE_ROLES,
  },
]

export function findRouteMeta(pathname: string): RouteMeta | null {
  return (
    ROUTE_META.find(item =>
      matchPath({ path: item.path, end: item.end ?? false }, pathname),
    ) ?? null
  )
}
