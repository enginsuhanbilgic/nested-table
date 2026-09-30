import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Route guard for page-code access (stat.lr_role_pages, editable at runtime).
 * ADMIN users pass automatically — the backend puts every page in their list.
 */
export function RequirePage({ pageCode, children }: { pageCode: string; children: React.ReactNode }) {
  const { canSeePage } = useAuth()

  if (!canSeePage(pageCode)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
