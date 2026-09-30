import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeModeProvider } from './contexts/ThemeModeContext'
import { AuthProvider } from './contexts/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { RequireAuth } from './routes/RequireAuth'
import { RequireRole } from './routes/RequireRole'
import { RequirePage } from './routes/RequirePage'
import { PublicRoute } from './routes/PublicRoute'
import { LoginPage } from './pages/LoginPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { AdminPage } from './pages/AdminPage'
import { LatencyDailyStatsPage } from './pages/LatencyDailyStatsPage'
import { RttStatsPage } from './pages/RttStatsPage'
import { NestedLatencyPage } from './pages/NestedLatencyPage'
import { PageTrackingPage } from './pages/PageTrackingPage'
import { TransactionSearchPage } from './pages/TransactionSearchPage'
import { TransactionDetailPage } from './pages/TransactionDetailPage'
import { PageTracker } from './components/tracking/PageTracker'
import { RouteTitleSync } from './routes/RouteTitleSync'
import { ADMIN_ROLE } from './types/auth'
import { PAGE_CODES } from './routes/routeMeta'

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
                <Route
                  path="/latency/daily"
                  element={
                    <RequirePage pageCode={PAGE_CODES.LATENCY_DAILY}>
                      <LatencyDailyStatsPage />
                    </RequirePage>
                  }
                />
                <Route
                  path="/latency/rtt"
                  element={
                    <RequirePage pageCode={PAGE_CODES.LATENCY_RTT}>
                      <RttStatsPage />
                    </RequirePage>
                  }
                />
                <Route
                  path="/latency/grouped"
                  element={
                    <RequirePage pageCode={PAGE_CODES.LATENCY_GROUPED}>
                      <NestedLatencyPage />
                    </RequirePage>
                  }
                />
                <Route
                  path="/transactions"
                  element={
                    <RequirePage pageCode={PAGE_CODES.TRANSACTIONS}>
                      <TransactionSearchPage />
                    </RequirePage>
                  }
                />
                <Route
                  path="/transactions/:publicId"
                  element={
                    <RequirePage pageCode={PAGE_CODES.TRANSACTIONS}>
                      <TransactionDetailPage />
                    </RequirePage>
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
                    <RequirePage pageCode={PAGE_CODES.ANALYTICS}>
                      <PageTrackingPage />
                    </RequirePage>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RequireRole roles={[ADMIN_ROLE]}>
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
