import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeModeProvider } from './contexts/ThemeModeContext'
import { AuthProvider } from './contexts/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { RequireAuth } from './routes/RequireAuth'
import { RequireRole } from './routes/RequireRole'
import { PublicRoute } from './routes/PublicRoute'
import { LoginPage } from './pages/LoginPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { AdminPage } from './pages/AdminPage'
import { LatencyDailyStatsPage } from './LatencyDailyStatsPage'
import { RttStatsPage } from './RttStatsPage'
import { NestedLatencyPage } from './NestedLatencyPage'
import { PageTrackingPage } from './pages/PageTrackingPage'
import { TransactionSearchPage } from './pages/TransactionSearchPage'
import { TransactionDetailPage } from './pages/TransactionDetailPage'
import { PageTracker } from './components/analytics/PageTracker'
import { RouteTitleSync } from './routes/RouteTitleSync'
import {
  ADMIN_PAGE_ROLES,
  ANALYTICS_PAGE_ROLES,
  TRANSACTION_PAGE_ROLES,
} from './routes/routeMeta'

export default function App() {
  return (
    <ThemeModeProvider>
      <AuthProvider>
        <BrowserRouter>
          <PageTracker />
          <RouteTitleSync />
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/latency/daily" replace />} />
                <Route path="/latency/daily" element={<LatencyDailyStatsPage />} />
                <Route path="/latency/rtt" element={<RttStatsPage />} />
                <Route path="/latency/grouped" element={<NestedLatencyPage />} />
                <Route
                  path="/transactions"
                  element={
                    <RequireRole roles={TRANSACTION_PAGE_ROLES}>
                      <TransactionSearchPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/transactions/:publicId"
                  element={
                    <RequireRole roles={TRANSACTION_PAGE_ROLES}>
                      <TransactionDetailPage />
                    </RequireRole>
                  }
                />
                {/*
                <Route path="/latency/user" element={<UserLatencyPage />} />
                <Route path="/globe" element={<GlobePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                */}
                <Route
                  path="/analytics/page"
                  element={
                    <RequireRole roles={ANALYTICS_PAGE_ROLES}>
                      <PageTrackingPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RequireRole roles={ADMIN_PAGE_ROLES}>
                      <AdminPage />
                    </RequireRole>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/latency/daily" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeModeProvider>
  )
}
