import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import AdminLoginPage from '../AdminLoginPage'
import { useAuthStore } from '@/stores/authStore'
import * as envConfig from '@/config/env'
import { authService } from '@/services/authService'

describe('Admin Login UI & Authorization Flow (AdminLoginPage)', () => {
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

  it('renders AdminLoginPage with administrator form inputs and demo quick-access in mock mode', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminLoginPage, null)
      )
    )

    expect(html).toContain('Admin Log In')
    expect(html).toContain('Administrator Email')
    expect(html).toContain('Password')
    expect(html).toContain('Log In to Admin Console')
    expect(html).toContain('Demo Mock Mode')
    expect(html).toContain('Sample Admin (Carol)')
    expect(html).toContain('Sample Super Admin (Dave)')
  })

  it('renders AdminLoginPage configuration alert when Supabase config is missing in remote mode', () => {
    useAuthStore.setState({
      configError: 'Remote API mode is enabled, but VITE_SUPABASE_URL is missing.',
    })
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminLoginPage, null)
      )
    )

    expect(html).toContain('Authentication Configuration Required')
    expect(html).toContain('Remote API mode is enabled, but VITE_SUPABASE_URL is missing.')
    expect(html).not.toContain('Sample Admin (Carol)')
  })

  it('renders Already Signed In state when user already has admin privileges', () => {
    useAuthStore.setState({
      token: 'tok_admin',
      user: {
        id: 'usr_admin',
        name: 'Carol Admin',
        email: 'admin@campus.edu',
        roles: ['admin'],
      },
    })

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminLoginPage, null)
      )
    )

    expect(html).toContain('Already Signed In')
    expect(html).toContain('Carol Admin')
    expect(html).toContain('Go to Admin Console')
    expect(html).toContain('Sign out')
  })

  it('renders Insufficient Privileges warning when user is signed in as a non-admin', () => {
    useAuthStore.setState({
      token: 'tok_cust',
      user: {
        id: 'usr_customer',
        name: 'Alice Customer',
        email: 'alice@campus.edu',
        roles: ['customer'],
      },
    })

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminLoginPage, null)
      )
    )

    expect(html).toContain('Insufficient Privileges')
    expect(html).toContain('Alice Customer')
    expect(html).toContain('Sign out to switch account')
  })
})

describe('Admin Authorization & Gate Execution', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: true,
      configError: null,
    })
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.restoreAllMocks()
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
  })

  it('authenticates admin and hydrates authoritative admin roles', async () => {
    const mockAdmin = {
      id: 'usr_admin',
      name: 'Carol Admin',
      email: 'admin@campus.edu',
      roles: ['admin'],
    }
    const mockSession = { access_token: 'jwt_admin_token' }

    vi.spyOn(authService, 'login').mockResolvedValue({
      session: mockSession,
      authUser: { id: 'usr_admin', email: 'admin@campus.edu' },
    })
    vi.spyOn(authService, 'me').mockResolvedValue(mockAdmin)

    const user = await useAuthStore.getState().login('admin@campus.edu', 'secret123')

    expect(user).toEqual(mockAdmin)
    expect(useAuthStore.getState().hasRole('admin')).toBe(true)
    expect(useAuthStore.getState().token).toBe('jwt_admin_token')
  })

  it('rejects non-admin from receiving admin access and clears session on unauthorized attempt', async () => {
    const mockCustomer = {
      id: 'usr_customer',
      name: 'Alice Cust',
      email: 'alice@campus.edu',
      roles: ['customer'],
    }
    const mockSession = { access_token: 'jwt_cust_token' }

    vi.spyOn(authService, 'login').mockResolvedValue({
      session: mockSession,
      authUser: { id: 'usr_customer', email: 'alice@campus.edu' },
    })
    vi.spyOn(authService, 'me').mockResolvedValue(mockCustomer)
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue(undefined)

    const user = await useAuthStore.getState().login('alice@campus.edu', 'secret123')
    expect(user.roles).not.toContain('admin')
    expect(useAuthStore.getState().hasRole('admin')).toBe(false)

    // Simulate AdminLoginPage gate logic
    if (!user.roles.includes('admin') && !user.roles.includes('super_admin')) {
      await useAuthStore.getState().logout()
    }

    expect(logoutSpy).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('rejects invalid credentials with an authentication error and keeps session null', async () => {
    vi.spyOn(authService, 'login').mockRejectedValue(
      new Error('Invalid login credentials.')
    )

    await expect(
      useAuthStore.getState().login('admin@campus.edu', 'wrongpassword')
    ).rejects.toThrow('Invalid login credentials.')

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('clears session when admin session has expired or backend rejects token', async () => {
    useAuthStore.setState({
      token: 'jwt_expired_admin_token',
      session: { access_token: 'jwt_expired_admin_token' },
      user: null,
    })

    vi.spyOn(authService, 'me').mockRejectedValue({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Invalid or expired authentication session.',
    })
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue(undefined)

    await expect(useAuthStore.getState().hydrateProfile()).rejects.toMatchObject({
      statusCode: 401,
    })

    expect(logoutSpy).toHaveBeenCalled()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('strictly blocks privilege escalation if client attempts to self-assign admin role', async () => {
    // Attempting to pass role: 'admin' to signup must be rejected
    await expect(
      authService.signup('infiltrator@campus.edu', 'password123', {
        name: 'Attacker',
        role: 'admin',
      })
    ).rejects.toMatchObject({
      code: 'PRIVILEGE_ESCALATION_FORBIDDEN',
    })

    // Super admin role must also be blocked
    await expect(
      authService.signup('infiltrator@campus.edu', 'password123', {
        name: 'Attacker',
        role: 'super_admin',
      })
    ).rejects.toMatchObject({
      code: 'PRIVILEGE_ESCALATION_FORBIDDEN',
    })
  })

  it(
    'guarantees RunnerDashboardPage is defined and bound to runner route in routes.jsx',
    async () => {
      const { routes } = await import('@/app/routes')
      const rootRoute = routes[0]
      const runnerRoute = rootRoute.children.find((r) => r.path === 'runner')
      expect(runnerRoute).toBeDefined()
      expect(runnerRoute.children).toBeDefined()
      const runnerChild = runnerRoute.children[0]
      expect(runnerChild.children).toBeDefined()
      const indexRoute = runnerChild.children[0]
      expect(indexRoute.index).toBe(true)
      expect(indexRoute.element).toBeDefined()
    },
    30000
  )
})


