import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { ROLES, hasPermission } from '../utils/permissions.js'

/**
 * Extracts Bearer token from Authorization header.
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Verifies Supabase Auth token, fetches profile and roles, and attaches req.user.
 */
export async function authenticate(req, res, next) {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      throw ApiError.unauthenticated('Authorization token is required.')
    }

    const supabase = getSupabaseAdmin()

    // Supported Supabase Auth mechanism: verifies token with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.getUser(token)

    if (authError || !authData?.user) {
      throw ApiError.unauthenticated('Invalid or expired authentication session.')
    }

    const authUser = authData.user

    // Fetch user profile from database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name, phone, runner_status, default_location_id')
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError) {
      throw ApiError.internal('Database error while retrieving user profile.', 'DATABASE_ERROR')
    }

    if (!profile) {
      throw ApiError.unauthorized('User profile not found. Account may be uninitialized.', 'PROFILE_NOT_FOUND')
    }

    // Fetch user roles
    const { data: roleRecords, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id)

    if (rolesError) {
      throw ApiError.internal('Database error while retrieving user permissions.', 'DATABASE_ERROR')
    }

    if (!roleRecords || roleRecords.length === 0) {
      throw ApiError.unauthorized('No assigned roles found for this account.', 'ROLE_NOT_FOUND')
    }

    const roles = roleRecords.map((r) => r.role)

    req.user = {
      id: authUser.id,
      email: profile.email || authUser.email || '',
      name: profile.name,
      phone: profile.phone || null,
      roles: Array.from(new Set(roles)),
      runnerStatus: profile.runner_status || null,
      defaultLocationId: profile.default_location_id || null,
    }

    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Middleware: requires user to have a specific permission.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthenticated())
    }
    if (!hasPermission(req.user, permission)) {
      return next(ApiError.forbidden("You don't have access to do that."))
    }
    next()
  }
}

/**
 * Middleware: requires user to have a specific role.
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthenticated())
    }
    if (!req.user.roles.includes(role)) {
      return next(ApiError.forbidden("You don't have the required role."))
    }
    next()
  }
}
