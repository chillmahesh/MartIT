import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '@/stores/authStore'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { RouteFallback } from '@/components/layout/RouteFallback'
import { hasPermission, homePathFor, PERMISSIONS } from '@/utils/permissions'

/**
 * Client-side route gating for UX only. Every API call is independently authorised
 * by the server; hiding a route is never the security boundary.
 *
 * Each area has its own check (see utils/permissions.js):
 *  - customer: 'shop'
 *  - runner:   'runner.deliver' — runner role assigned by an admin AND approved
 *  - admin:    'admin.access'   — admin or super admin
 */
const AREA_PERMISSION = {
  customer: PERMISSIONS.SHOP,
  runner: PERMISSIONS.RUNNER_DELIVER,
  admin: PERMISSIONS.ADMIN_ACCESS,
}

export function RequireRole({ role }) {
  const { token, user, isInitialized } = useAuthStore()
  const location = useLocation()

  if (!isInitialized) {
    return <RouteFallback />
  }

  if (!token || !user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (!hasPermission(user, AREA_PERMISSION[role])) return <ForbiddenPage role={role} />
  return <Outlet />
}

/** Sends signed-in users away from login/signup to their home area. */
export function RedirectIfAuthed() {
  const { user, isInitialized, isPasswordRecovery } = useAuthStore()
  if (!isInitialized) {
    return <RouteFallback />
  }
  if (user && !isPasswordRecovery) return <Navigate to={homePathFor(user)} replace />
  return <Outlet />
}
