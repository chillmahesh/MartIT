import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requirePermission } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { PERMISSIONS, ROLES } from '../utils/permissions.js'
import { formatCanonicalOrder } from './orders.js'

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

    // 1. Try atomic stored procedure first if available in database
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_set_runner_status', {
        p_user_id: userId,
        p_status: status,
      })

      if (!rpcErr && rpcData) {
        // Query full updated profile with user_roles to return standard formatted user
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

        return res.status(200).json({
          ...formatted,
          message: `Runner status updated to ${status}.`,
        })
      }

      if (rpcErr) {
        const errMsg = rpcErr.message || ''
        if (errMsg.includes('NOT_AN_APPLICANT')) {
          throw ApiError.conflict('This user has not applied to be a runner.', 'NOT_AN_APPLICANT')
        }
        if (errMsg.includes('USER_NOT_FOUND')) {
          throw ApiError.notFound('User not found.', 'USER_NOT_FOUND')
        }
        if (errMsg.includes('PERMISSION_DENIED')) {
          throw ApiError.forbidden('Only administrators can update runner application status.', 'FORBIDDEN')
        }
        // If RPC does not exist (e.g. In-memory mock or pre-migration), fall through to direct tables
      }
    }

    // 2. Direct table operations (fallback or mock environment)
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
      console.error('[admin.setStatus] Profile update error:', updateErr)
      throw ApiError.internal('Failed to update runner status.')
    }

    // If approved, ensure runner role exists in user_roles; if suspended, revoke runner role
    if (status === 'approved') {
      const { error: roleErr } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role: ROLES.RUNNER }, { onConflict: 'user_id, role' })
      if (roleErr) {
        console.error('[admin.setStatus] Role upsert error:', roleErr)
      }
    } else if (status === 'suspended') {
      const { error: roleErr } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', ROLES.RUNNER)
      if (roleErr) {
        console.error('[admin.setStatus] Role delete error:', roleErr)
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

/**
 * List all orders across the platform for administrators.
 * Supports filtering by status, paymentStatus, storeId, runnerId, and search keyword.
 */
async function handleListOrders(req, res, next) {
  try {
    const supabase = getSupabaseAdmin()
    const { status, paymentStatus, storeId, runnerId, search, limit = 100 } =
      req.method === 'POST' ? req.body || {} : req.query || {}

    let query = supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        runner_id,
        status,
        payment_status,
        item_subtotal,
        combined_delivery_fee,
        base_amount,
        platform_fee,
        total_payable,
        route_distance_km,
        delivery_location_snapshot,
        created_at,
        updated_at,
        handover_verified_at,
        payment_attempt_id,
        payment_fee_paise,
        payment_window_expires_at,
        payment_paid_at,
        payment_last_verified_at,
        order_fulfillment_groups (
          id,
          store_id,
          status,
          order_items (
            id,
            product_id,
            product_name,
            product_pack,
            unit_price,
            quantity,
            line_subtotal
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 100)

    if (status) {
      query = query.eq('status', status)
    }
    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus)
    }
    if (runnerId) {
      query = query.eq('runner_id', runnerId)
    }

    const { data: rawOrders, error } = await query

    if (error) {
      console.error('[admin.listOrders] Error querying orders:', error)
      throw ApiError.internal('Failed to list orders.')
    }

    let formatted = (rawOrders || []).map((o) => formatCanonicalOrder(o))

    // Optional storeId filtering (stored inside order_fulfillment_groups)
    if (storeId) {
      formatted = formatted.filter((o) => o.storeId === storeId)
    }

    // Optional search filtering (orderId, customer name/phone/id)
    if (search && typeof search === 'string') {
      const q = search.trim().toLowerCase()
      formatted = formatted.filter((o) => {
        const idMatch = o.id?.toLowerCase().includes(q)
        const nameMatch = o.customerDetails?.fullName?.toLowerCase().includes(q)
        const phoneMatch = o.customerDetails?.phoneNumber?.includes(q)
        const customerIdMatch = o.customerId?.toLowerCase().includes(q)
        return idMatch || nameMatch || phoneMatch || customerIdMatch
      })
    }

    res.status(200).json(formatted)
  } catch (err) {
    next(err)
  }
}

// Orders management (accessible by admin and super admin with ORDERS_READ_ALL permission)
adminRouter.get('/api/v1/admin/orders', authenticate, requirePermission(PERMISSIONS.ORDERS_READ_ALL), handleListOrders)
adminRouter.post('/admin/orders/list', authenticate, requirePermission(PERMISSIONS.ORDERS_READ_ALL), handleListOrders)
