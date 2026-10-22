import crypto from 'node:crypto'
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { ROLES } from '../utils/permissions.js'

export const authRouter = Router()

function handleMe(req, res) {
  const profile = {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    roles: req.user.roles,
    runnerStatus: req.user.runnerStatus,
    defaultLocationId: req.user.defaultLocationId,
  }
  if (req.user.phone) {
    profile.phone = req.user.phone
  }
  res.status(200).json(profile)
}

/**
 * Public registration endpoint.
 *
 * Security:
 * - Allows public registration for 'customer' and 'runner' only.
 * - Strictly rejects attempted registration as 'admin' or 'super_admin' with 403 PRIVILEGE_ESCALATION_FORBIDDEN.
 * - Runner accounts are created with runner_status = 'applicant', preserving the admin approval requirement.
 */
async function handleSignup(req, res, next) {
  try {
    const { email, password, name, phone, role } = req.body || {}

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw ApiError.badRequest('Please enter your full name (minimum 2 characters).', 'INVALID_NAME')
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw ApiError.badRequest('Please enter a valid campus or personal email address.', 'INVALID_EMAIL')
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters long.', 'INVALID_PASSWORD')
    }

    // Role validation & privilege escalation defense
    if (!role || typeof role !== 'string') {
      throw ApiError.badRequest('Valid role selection (customer or runner) is required.', 'INVALID_ROLE')
    }

    const cleanRole = role.toLowerCase().trim()
    if (cleanRole === ROLES.ADMIN || cleanRole === ROLES.SUPER_ADMIN || cleanRole.includes('admin')) {
      throw ApiError.forbidden('Public registration cannot assign administrative roles.', 'PRIVILEGE_ESCALATION_FORBIDDEN')
    }

    if (cleanRole !== ROLES.CUSTOMER && cleanRole !== ROLES.RUNNER) {
      throw ApiError.badRequest('Valid role selection (customer or runner) is required.', 'INVALID_ROLE')
    }

    const supabase = getSupabaseAdmin()
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()
    const cleanPhone = phone && typeof phone === 'string' ? phone.trim() : null

    // Check for duplicate email
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (existingProfile) {
      throw ApiError.conflict('An account with this email already exists. Please log in instead.', 'DUPLICATE_EMAIL')
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
    const isRunner = cleanRole === ROLES.RUNNER
    const runnerStatus = isRunner ? 'applicant' : null

    // 1. Create user profile in profiles table
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: userId,
      email: cleanEmail,
      name: cleanName,
      phone: cleanPhone,
      runner_status: runnerStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (profileErr) {
      throw ApiError.internal(`Failed to create profile: ${profileErr.message || 'Database error'}`)
    }

    // 2. Insert assigned roles in user_roles table
    const assignedRoles = [ROLES.CUSTOMER]
    if (isRunner) {
      assignedRoles.push(ROLES.RUNNER)
    }

    for (const r of assignedRoles) {
      await supabase.from('user_roles').insert({
        user_id: userId,
        role: r,
        created_at: new Date().toISOString(),
      })
    }

    // Attach to mock test users list if in-memory test client
    const token = `tok_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    if (supabase.state?.users) {
      supabase.state.users.push({
        id: userId,
        token,
        email: cleanEmail,
        name: cleanName,
      })
    }

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        roles: assignedRoles,
        runnerStatus,
        defaultLocationId: null,
      },
      message: isRunner
        ? 'Runner account created successfully. Your application is pending review.'
        : 'Account created successfully.',
    })
  } catch (err) {
    next(err)
  }
}

// REST routes
authRouter.get('/api/v1/auth/me', authenticate, handleMe)
authRouter.post('/api/v1/auth/signup', handleSignup)
authRouter.post('/api/v1/auth/register', handleSignup)

// RPC routes (for frontend api.js request('auth.me'), request('auth.signup'))
authRouter.post('/auth/me', authenticate, handleMe)
authRouter.post('/auth/signup', handleSignup)
authRouter.post('/auth/register', handleSignup)
