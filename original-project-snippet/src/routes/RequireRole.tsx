import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { RoleCode } from '../types/auth'

/**
 * Route guard for role checks. Business pages use RequirePage instead; this
 * remains for the admin page, which is deliberately gated by the ADMIN role
 * in code rather than by the editable page mapping.
 */
export function RequireRole({ roles, children }: { roles: RoleCode[]; children: React.ReactNode }) {
  const { hasAnyRole } = useAuth()

  if (!hasAnyRole(roles)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
