import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { getDefaultRouteByRole, getStoredSession } from '../auth/session'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const location = useLocation()
  const session = getStoredSession()

  if (!session?.user || !session.accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allowedRoles?.length && !allowedRoles.includes(session.user.VaiTro)) {
    return <Navigate to={getDefaultRouteByRole(session.user.VaiTro)} replace />
  }

  return <>{children}</>
}
