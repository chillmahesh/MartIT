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

  it('renders SignupPage with accessible form fields and MartIT styling', () => {
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
})
