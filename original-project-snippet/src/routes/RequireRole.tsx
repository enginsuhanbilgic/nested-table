import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Role } from '../types/auth';

export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { hasAnyRole } = useAuth()

  if (!hasAnyRole(roles)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
