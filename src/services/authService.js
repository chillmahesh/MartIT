import { request, ApiError } from './api'
import { isMockBackend } from '@/config/env'
import { getSupabaseClient } from '@/config/supabaseClient'

export const authService = {
  /**
   * Mock-only: signs in as a sample account for the given role.
   */
  async demoLogin(role) {
    if (!isMockBackend) {
      throw new ApiError('INVALID_MODE', 'Demo login is only available in mock backend mode.')
    }
    return request('auth.demoLogin', { role })
  },

  /**
   * Email/password sign-in.
   * In mock mode: delegates to mock handler.
   * In remote mode: authenticates via Supabase Auth and hydrates profile from backend.
   */
  async login(email, password) {
    if (isMockBackend) {
      // In mock mode, find matching sample account or simulate login
      const res = await request('auth.login', { email, password }).catch(async () => {
        // Fallback for demo convenience in mock mode if user types customer email
        return request('auth.demoLogin', { role: 'customer' })
      })
      return res
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new ApiError('CONFIG_ERROR', 'Supabase client is not configured.')
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      let message = error.message
      let code = error.code || 'AUTH_ERROR'
      if (error.message?.toLowerCase().includes('invalid login credentials')) {
        message = 'Invalid email or password. Please verify your credentials and try again.'
        code = 'INVALID_CREDENTIALS'
      } else if (error.message?.toLowerCase().includes('email not confirmed')) {
        message = 'Please confirm your email address before logging in.'
        code = 'EMAIL_NOT_CONFIRMED'
      }
      throw new ApiError(code, message, error.status || 400)
    }

    if (!data?.session) {
      throw new ApiError('SESSION_MISSING', 'Login succeeded but no active session was established.')
    }

    return { session: data.session, authUser: data.user }
  },

  /**
   * Email/password sign-up.
   * In remote mode: registers with Supabase Auth with metadata (name, phone).
   * Handled safely: client metadata is never trusted for roles or permissions.
   */
  async signup(email, password, { name, phone = '' } = {}) {
    if (isMockBackend) {
      return request('auth.signup', { email, password, name, phone }).catch(() => {
        return {
          user: { id: 'usr_new', name, email, roles: ['customer'] },
          session: null,
          needsConfirmation: false,
        }
      })
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: name?.trim() || '',
          ...(phone ? { phone: phone.trim() } : {}),
        },
      },
    })

    if (error) {
      const msg = error.message?.toLowerCase() || ''
      if (msg.includes('already registered') || msg.includes('user already exists') || error.status === 422) {
        throw new ApiError(
          'DUPLICATE_EMAIL',
          'An account with this email already exists. Please log in instead.',
          409
        )
      }
      throw new ApiError(error.code || 'SIGNUP_ERROR', error.message, error.status || 400)
    }

    // Detect duplicate signup obfuscation when email confirmation is enabled:
    // Supabase returns an empty identities array for existing users when identity enumeration protection is on.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new ApiError(
        'DUPLICATE_EMAIL',
        'An account with this email already exists. Please log in instead.',
        409
      )
    }

    // If confirmation is required, session will be null
    const needsConfirmation = !data?.session
    return {
      session: data?.session || null,
      authUser: data?.user || null,
      needsConfirmation,
    }
  },

  /**
   * Signs out current user session.
   */
  async logout() {
    if (isMockBackend) {
      return request('auth.logout')
    }

    const supabase = getSupabaseClient()
    if (supabase) {
      await supabase.auth.signOut().catch(() => {})
    }
  },

  /**
   * Triggers password reset email workflow.
   * In mock mode: delegates to mock handler.
   * In remote mode: calls Supabase auth.resetPasswordForEmail with /reset-password redirectTo.
   */
  async forgotPassword(email) {
    const cleanEmail = email?.trim()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new ApiError('INVALID_EMAIL', 'Please enter a valid email address.', 400)
    }

    if (isMockBackend) {
      return request('auth.forgotPassword', { email: cleanEmail }).catch(() => ({
        ok: true,
        message: 'Password reset link sent (demo simulation).',
      }))
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new ApiError('CONFIG_ERROR', 'Supabase client is not configured.')
    }
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://martit.vercel.app'
    const redirectTo = `${origin}/reset-password`
    const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    })

    if (error) {
      throw new ApiError(error.code || 'RESET_PASSWORD_ERROR', error.message, error.status || 400)
    }

    return { ok: true, data }
  },

  /**
   * Updates user password using Supabase Auth updateUser.
   * In mock mode: simulates success.
   * In remote mode: calls supabase.auth.updateUser({ password }).
   */
  async updatePassword(newPassword) {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      throw new ApiError('INVALID_PASSWORD', 'Password must be at least 6 characters long.', 400)
    }

    if (isMockBackend) {
      return { ok: true }
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new ApiError('CONFIG_ERROR', 'Supabase client is not configured.')
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      let message = error.message
      const lower = error.message?.toLowerCase() || ''
      if (lower.includes('same as') || lower.includes('different from')) {
        message = 'New password cannot be the same as your old password.'
      }
      throw new ApiError(error.code || 'UPDATE_PASSWORD_ERROR', message, error.status || 400)
    }

    return { ok: true, user: data.user }
  },

  /**
   * Authoritative profile and role retrieval from backend.
   * Never relies on user metadata for permissions.
   */
  async me() {
    return request('auth.me')
  },

  /**
   * Retrieves active Supabase session (remote mode).
   */
  async getSession() {
    if (isMockBackend) return null
    const supabase = getSupabaseClient()
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data?.session || null
  },

  /**
   * Subscribes to Supabase auth state transitions.
   */
  onAuthStateChange(callback) {
    if (isMockBackend) {
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
    const supabase = getSupabaseClient()
    if (!supabase) {
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
    return supabase.auth.onAuthStateChange(callback)
  },
}
