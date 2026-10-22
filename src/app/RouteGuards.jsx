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
  const authState = useAuthStore()
  const isInitialized = authState.isInitialized || useAuthStore.getState().isInitialized
  const token = authState.token ?? useAuthStore.getState().token
  const user = authState.user ?? useAuthStore.getState().user
  const location = useLocation()

  if (!isInitialized) {
    return <RouteFallback />
  }

  if (!token || !user) {
    const next = encodeURIComponent(location.pathname + location.search)
    const loginTarget = role === 'admin' ? `/admin/login?next=${next}` : `/login?next=${next}`
    return <Navigate to={loginTarget} replace />
  }
  if (!hasPermission(user, AREA_PERMISSION[role])) return <ForbiddenPage role={role} />
  return <Outlet />
}

/**
 * Determines target destination for signed-in user, respecting activeMode for dual-role users.
 */
export function targetPathForAuthed(user, activeMode) {
  if (!user) return '/app'
  const canShop = hasPermission(user, PERMISSIONS.SHOP)
  const canDeliver = hasPermission(user, PERMISSIONS.RUNNER_DELIVER)
  if (canShop && canDeliver) {
    return activeMode === 'runner' ? '/runner' : '/app'
  }
  return homePathFor(user)
}

/** Sends signed-in users away from login/signup to their home area. */
export function RedirectIfAuthed() {
  const authState = useAuthStore()
  const isInitialized = authState.isInitialized || useAuthStore.getState().isInitialized
  const user = authState.user ?? useAuthStore.getState().user
  const isPasswordRecovery = authState.isPasswordRecovery ?? useAuthStore.getState().isPasswordRecovery
  const activeMode = authState.activeMode ?? useAuthStore.getState().activeMode

  if (!isInitialized) {
    return <RouteFallback />
  }
  if (user && !isPasswordRecovery) {
    return <Navigate to={targetPathForAuthed(user, activeMode)} replace />
  }
  return <Outlet />
}
