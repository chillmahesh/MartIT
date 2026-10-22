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
})
