import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requirePermission } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { PERMISSIONS, ROLES } from '../utils/permissions.js'

export const adminRouter = Router()

/**
 * List all users with their roles and runner status.
 */
async function handleListUsers(req, res, next) {
  try {
    const supabase = getSupabaseAdmin()

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        name,
        runner_status,
        default_location_id,
        user_roles (
          role
        )
      `)
      .order('name', { ascending: true })

    if (error) {
      throw ApiError.internal('Failed to list users.')
    }

    const formatted = (profiles || []).map((p) => ({
      id: p.id,
      email: p.email,
      name: p.name,
      roles: (p.user_roles || []).map((r) => r.role),
      runnerStatus: p.runner_status,
      defaultLocationId: p.default_location_id,
    }))

    res.status(200).json(formatted)
  } catch (err) {
    next(err)
  }
}

/**
 * Approve or suspend a runner applicant.
 */
const runnerStatusSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  status: z.enum(['approved', 'suspended']),
})

async function handleSetRunnerStatus(req, res, next) {
  try {
    const userId = req.params?.id || req.body?.userId
    const { status } = runnerStatusSchema.parse({
      userId,
      status: req.body?.status,
    })

    const supabase = getSupabaseAdmin()

    // Query target profile
    const { data: target, error: targetErr } = await supabase
      .from('profiles')
      .select('id, name, runner_status')
      .eq('id', userId)
      .maybeSingle()

    if (targetErr || !target) {
      throw ApiError.notFound('User not found.', 'USER_NOT_FOUND')
    }

    if (target.runner_status == null) {
      throw ApiError.conflict('This user has not applied to be a runner.', 'NOT_AN_APPLICANT')
    }

    // Update runner status on profile
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ runner_status: status })
      .eq('id', userId)

    if (updateErr) {
      throw ApiError.internal('Failed to update runner status.')
    }

    // If approved, ensure runner role exists in user_roles; if suspended, revoke runner role
    if (status === 'approved') {
      await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role: ROLES.RUNNER }, { onConflict: 'user_id, role' })
    } else if (status === 'suspended') {
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', ROLES.RUNNER)
    }

    // Query full updated profile with user_roles
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        name,
        runner_status,
        default_location_id,
        user_roles (
          role
        )
      `)
      .eq('id', userId)
      .maybeSingle()

    const formatted = updatedProfile
      ? {
          id: updatedProfile.id,
          userId: updatedProfile.id,
          email: updatedProfile.email,
          name: updatedProfile.name,
          roles: (updatedProfile.user_roles || []).map((r) => r.role),
          runnerStatus: updatedProfile.runner_status,
          defaultLocationId: updatedProfile.default_location_id,
        }
      : { id: userId, userId, runnerStatus: status }

    res.status(200).json({
      ...formatted,
      message: `Runner status updated to ${status}.`,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Grant or revoke a role.
 */
const roleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['customer', 'runner', 'store_owner', 'admin', 'super_admin']),
  granted: z.boolean(),
})

async function handleSetRole(req, res, next) {
  try {
    const { userId, role, granted } = roleSchema.parse(req.body)
    const supabase = getSupabaseAdmin()

    // Safety: super admin self-demotion check
    if (!granted && role === ROLES.SUPER_ADMIN) {
      if (userId === req.user.id) {
        throw ApiError.conflict("You cannot remove your own super admin role.", 'SELF_DEMOTION')
      }

      // Check remaining super admins
      const { data: remaining } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', ROLES.SUPER_ADMIN)

      const remainingOthers = (remaining || []).filter((r) => r.user_id !== userId)
      if (remainingOthers.length === 0) {
        throw ApiError.conflict('There must always be at least one super admin.', 'LAST_SUPER_ADMIN')
      }
    }

    // Target profile check
    const { data: targetProfile, error: targetErr } = await supabase
      .from('profiles')
      .select('id, name, runner_status')
      .eq('id', userId)
      .maybeSingle()

    if (targetErr || !targetProfile) {
      throw ApiError.notFound('User not found.', 'USER_NOT_FOUND')
    }

    // Task 6: Only grant the runner role to runner applicants
    if (role === ROLES.RUNNER && granted) {
      if (targetProfile.runner_status == null) {
        throw ApiError.conflict('This user has not applied to be a runner.', 'NOT_AN_APPLICANT')
      }
    }

    if (granted) {
      await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role }, { onConflict: 'user_id, role' })

      if (role === ROLES.RUNNER) {
        await supabase
          .from('profiles')
          .update({ runner_status: 'approved' })
          .eq('id', userId)
      }
    } else {
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role)

      if (role === ROLES.RUNNER) {
        await supabase
          .from('profiles')
          .update({ runner_status: 'suspended' })
          .eq('id', userId)
      }
    }

    // Query full updated profile with user_roles
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        name,
        runner_status,
        default_location_id,
        user_roles (
          role
        )
      `)
      .eq('id', userId)
      .maybeSingle()

    const formatted = updatedProfile
      ? {
          id: updatedProfile.id,
          userId: updatedProfile.id,
          email: updatedProfile.email,
          name: updatedProfile.name,
          roles: (updatedProfile.user_roles || []).map((r) => r.role),
          runnerStatus: updatedProfile.runner_status,
          defaultLocationId: updatedProfile.default_location_id,
        }
      : { id: userId, userId, role, granted }

    res.status(200).json({
      ...formatted,
      role,
      granted,
      message: `Role ${role} ${granted ? 'granted to' : 'revoked from'} user.`,
    })
  } catch (err) {
    next(err)
  }
}

// User listing
adminRouter.get('/api/v1/admin/users', authenticate, requirePermission(PERMISSIONS.USERS_READ), handleListUsers)
adminRouter.post('/admin/users/list', authenticate, requirePermission(PERMISSIONS.USERS_READ), handleListUsers)

// Runner status
adminRouter.post('/api/v1/admin/runners/:id/status', authenticate, requirePermission(PERMISSIONS.RUNNERS_APPROVE), handleSetRunnerStatus)
adminRouter.post('/admin/runners/setStatus', authenticate, requirePermission(PERMISSIONS.RUNNERS_APPROVE), handleSetRunnerStatus)

// Role management
adminRouter.post('/api/v1/admin/roles', authenticate, requirePermission(PERMISSIONS.ROLES_ASSIGN), handleSetRole)
adminRouter.post('/admin/roles/set', authenticate, requirePermission(PERMISSIONS.ROLES_ASSIGN), handleSetRole)
