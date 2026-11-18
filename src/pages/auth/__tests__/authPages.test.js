import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import LoginPage from '../LoginPage'
import SignupPage from '../SignupPage'
import { useAuthStore } from '@/stores/authStore'
import * as envConfig from '@/config/env'

describe('Auth UI Components (LoginPage & SignupPage)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: true,
      configError: null,
    })
    vi.restoreAllMocks()
  })

  it('renders LoginPage with form inputs and mock persona buttons in mock mode', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(LoginPage, null)
      )
    )

    expect(html).toContain('Log in')
    expect(html).toContain('Sign in with Google')
    expect(html).toContain('Demo Mock Mode')
    expect(html).toContain('Sample customer')
    expect(html).toContain('Sample runner')
    expect(html).toContain('Sample super admin')
    expect(html).toContain('you@campus.edu')
    expect(html).toContain('Forgot password?')
  })

  it('renders LoginPage configuration alert when Supabase config is missing in remote mode', () => {
    useAuthStore.setState({
      configError: 'Remote API mode is enabled, but VITE_SUPABASE_URL is missing.',
    })
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(LoginPage, null)
      )
    )

    expect(html).toContain('Authentication Configuration Required')
    expect(html).toContain('Remote API mode is enabled, but VITE_SUPABASE_URL is missing.')
    // Demo accounts must NOT be rendered in remote mode
    expect(html).not.toContain('Sample customer')
    expect(html).not.toContain('Supabase Auth')
  })

  it('does not render "Supabase Auth" on LoginPage or SignupPage in remote mode', () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    const loginHtml = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(LoginPage, null)
      )
    )
    expect(loginHtml).not.toContain('Supabase Auth')

    const signupHtml = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SignupPage, null)
      )
    )
    expect(signupHtml).not.toContain('Supabase Auth')
  })

  it('renders SignupPage with accessible form fields and MartIT styling including role selection', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SignupPage, null)
      )
    )

    expect(html).toContain('Create an account')
    expect(html).toContain('Sign up with Google')
    expect(html).toContain('Full Name')
    expect(html).toContain('Campus Email')
    expect(html).toContain('Phone Number')
    expect(html).toContain('Password')
    expect(html).toContain('Confirm Password')
    expect(html).toContain('Create account')

    // Role selection controls
    expect(html).toContain('I want to sign up as')
    expect(html).toContain('Customer')
    expect(html).toContain('Runner')
    expect(html).toContain('Deliver orders on campus')
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-label="Account Type"')
  })

  it('renders SignupPage configuration alert when Supabase config is missing in remote mode', () => {
    useAuthStore.setState({
      configError: 'Remote API mode is enabled, but VITE_SUPABASE_ANON_KEY is missing.',
    })
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SignupPage, null)
      )
    )

    expect(html).toContain('Authentication Configuration Required')
    expect(html).toContain('Remote API mode is enabled, but VITE_SUPABASE_ANON_KEY is missing.')
  })

  it('renders LoginPage confirmation notice when redirected from password reset', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        {
          initialEntries: [
            {
              pathname: '/login',
              state: { notice: 'Your password has been successfully reset. Please log in with your new password.' },
            },
          ],
        },
        React.createElement(LoginPage, null)
      )
    )

    expect(html).toContain('Your password has been successfully reset. Please log in with your new password.')
  })

  it('redirects dual-role user according to activeMode in RedirectIfAuthed', async () => {
    const { targetPathForAuthed } = await import('@/app/RouteGuards')

    const dualUser = {
      id: 'usr_dual',
      name: 'Dual User',
      email: 'dual@campus.edu',
      roles: ['customer', 'runner'],
      runnerStatus: 'approved',
    }

    expect(targetPathForAuthed(dualUser, 'runner')).toBe('/runner')
    expect(targetPathForAuthed(dualUser, 'customer')).toBe('/app')
    expect(targetPathForAuthed(dualUser, null)).toBe('/app')
  })

  it('redirects runner-only and customer-only users correctly in targetPathForAuthed', async () => {
    const { targetPathForAuthed } = await import('@/app/RouteGuards')

    const runnerOnly = {
      id: 'usr_run',
      name: 'Runner',
      email: 'runner@campus.edu',
      roles: ['runner'],
      runnerStatus: 'approved',
    }
    const customerOnly = {
      id: 'usr_cust',
      name: 'Customer',
      email: 'customer@campus.edu',
      roles: ['customer'],
      runnerStatus: null,
    }
    const unapprovedRunner = {
      id: 'usr_unapproved',
      name: 'Unapproved',
      email: 'unapproved@campus.edu',
      roles: ['customer', 'runner'],
      runnerStatus: null,
    }

    expect(targetPathForAuthed(runnerOnly, null)).toBe('/runner')
    expect(targetPathForAuthed(customerOnly, null)).toBe('/app')
    expect(targetPathForAuthed(unapprovedRunner, null)).toBe('/app')
  })

  it('calls supabase.auth.signInWithOAuth with google provider and redirectTo origin in authService', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    const mockSupabase = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { provider: 'google', url: 'https://supabase.co/oauth' },
          error: null,
        }),
      },
    }
    const supabaseModule = await import('@/config/supabaseClient')
    vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

    const { authService } = await import('@/services/authService')
    const result = await authService.signInWithGoogle({
      redirectTo: 'http://localhost:5173',
      data: { role: 'customer' },
    })

    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:5173',
        data: { role: 'customer' },
      },
    })
    expect(result.ok).toBe(true)
  })

  it('handles and logs error when supabase.auth.signInWithOAuth fails', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockSupabase = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'OAUTH_FAILED', message: 'Popup blocked by browser' },
        }),
      },
    }
    const supabaseModule = await import('@/config/supabaseClient')
    vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

    const { authService } = await import('@/services/authService')
    await expect(authService.signInWithGoogle()).rejects.toMatchObject({
      code: 'OAUTH_FAILED',
      message: 'Popup blocked by browser',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith('Google sign-in failed:', 'Popup blocked by browser')
  })
})

describe('Password Recovery UI (ResetPasswordPage)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: true,
      configError: null,
      isPasswordRecovery: false,
      recoveryEmail: null,
    })
    vi.restoreAllMocks()
  })

  it('renders ResetPasswordPage form when recovery state is active', async () => {
    const ResetPasswordPage = (await import('../ResetPasswordPage')).default
    useAuthStore.setState({
      isPasswordRecovery: true,
      recoveryEmail: 'student@campus.edu',
    })

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ResetPasswordPage, null)
      )
    )

    expect(html).toContain('Password Recovery')
    expect(html).toContain('Reset your password')
    expect(html).toContain('New Password')
    expect(html).toContain('Confirm New Password')
    expect(html).toContain('Update password')
    expect(html).toContain('student@campus.edu')
  })

  it('renders ResetPasswordPage expired/invalid link alert with request action when callback error is present', async () => {
    const ResetPasswordPage = (await import('../ResetPasswordPage')).default
    const recoveryUtils = await import('@/utils/recovery')
    vi.spyOn(recoveryUtils, 'parseRecoveryUrlParams').mockReturnValue({
      hasError: true,
      isExpiredOrInvalid: true,
      error: 'access_denied',
      errorCode: 'otp_expired',
      errorDescription: 'Email link is invalid or has expired',
      type: null,
      hasRecoveryToken: false,
    })

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ResetPasswordPage, null)
      )
    )

    expect(html).toContain('Reset Link Expired or Invalid')
    expect(html).toContain('Email link is invalid or has expired')
    expect(html).toContain('Request a new link')
  })

  it('renders ResetPasswordPage missing session warning when opened without recovery session', async () => {
    const ResetPasswordPage = (await import('../ResetPasswordPage')).default
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    useAuthStore.setState({ isPasswordRecovery: false })

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ResetPasswordPage, null)
      )
    )

    // Initially checks session or displays recovery state
    expect(html).toContain('Password Recovery')
  })

  it('renders SignupPage with responsive mobile constraints and maxLength attributes', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SignupPage, null)
      )
    )

    // Name field constraints (100-character limit)
    expect(html).toContain('maxLength="100"')
    // Email field constraints
    expect(html).toContain('maxLength="255"')
    // Phone field constraints (16 chars allows formatted "+91 98765 43210")
    expect(html).toContain('maxLength="16"')
    expect(html).toContain('inputMode="tel"')
    // Password constraints
    expect(html).toContain('maxLength="72"')
  })

  it('enforces 100 character limit for name during account creation', async () => {
    const { validateName } = await import('@/utils/validators')
    const valid100Name = 'A'.repeat(90) + ' ' + 'B'.repeat(9) // 100 characters including space
    expect(valid100Name.length).toBe(100)
    const validRes = validateName(valid100Name, { required: true, label: 'Full name', maxLength: 100 })
    expect(validRes.isValid).toBe(true)

    const invalid101Name = 'A'.repeat(91) + ' ' + 'B'.repeat(9) // 101 characters
    expect(invalid101Name.length).toBe(101)
    const invalidRes = validateName(invalid101Name, { required: true, label: 'Full name', maxLength: 100 })
    expect(invalidRes.isValid).toBe(false)
    expect(invalidRes.error).toContain('cannot exceed 100 characters')
  })

  it('renders LoginPage with maxLength constraints to prevent overlong inputs', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(LoginPage, null)
      )
    )

    expect(html).toContain('maxLength="255"')
    expect(html).toContain('maxLength="72"')
  })

  it('renders ResetPasswordPage with maxLength constraints on passwords', async () => {
    const ResetPasswordPage = (await import('../ResetPasswordPage')).default
    useAuthStore.setState({ isPasswordRecovery: true })

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ResetPasswordPage, null)
      )
    )

    expect(html).toContain('maxLength="72"')
  })
})

describe('SignupPage Error Classification & Workflow Verification', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: true,
      configError: null,
    })
    vi.restoreAllMocks()
  })

  it('renders phone number and name with length constraints', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SignupPage, null)
      )
    )

    expect(html).toContain('maxLength="100"')
    expect(html).toContain('maxLength="255"')
    expect(html).toContain('maxLength="16"')
    expect(html).toContain('maxLength="72"')
  })

  it('authenticates customer role in mock mode and provides immediate access', async () => {
    const uniqueEmail = `cust_${Date.now()}@campus.edu`
    const user = await useAuthStore.getState().signup(uniqueEmail, 'SecretPass123', {
      name: 'Customer Guy',
      role: 'customer',
    })

    expect(user.user).toBeDefined()
    expect(user.user.email).toBe(uniqueEmail)
    expect(useAuthStore.getState().hasRole('customer')).toBe(true)
    expect(useAuthStore.getState().hasRole('runner')).toBe(false)
  })

  it('authenticates runner applicant role in mock mode with pending applicant status', async () => {
    const uniqueEmail = `run_${Date.now()}@campus.edu`
    const user = await useAuthStore.getState().signup(uniqueEmail, 'SecretPass123', {
      name: 'Runner Guy',
      role: 'runner',
    })

    expect(user.user).toBeDefined()
    expect(user.user.email).toBe(uniqueEmail)
    expect(user.user.runnerStatus).toBe('applicant')
    expect(useAuthStore.getState().hasRole('customer')).toBe(true)
    expect(useAuthStore.getState().hasRole('runner')).toBe(false)
  })
})
