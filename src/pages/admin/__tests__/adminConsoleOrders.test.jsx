import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminConsolePage from '../AdminConsolePage'
import { useAuthStore } from '@/stores/authStore'
import { ROLES } from '@/utils/permissions'

describe('AdminConsolePage — All Orders, Exceptions & Operations (P0)', () => {
  let queryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    useAuthStore.setState({
      user: {
        id: 'usr_super',
        name: 'Dave Super',
        email: 'superadmin@martit.test',
        roles: [ROLES.SUPER_ADMIN],
        runnerStatus: null,
      },
      token: 'mock_super_token',
      isInitialized: true,
    })
    vi.restoreAllMocks()
  })

  it('renders top-level admin navigation tabs for Orders, Exceptions, Stores, and People', () => {
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AdminConsolePage, null)
      )
    )

    expect(html).toContain('Campus Operations Console')
    expect(html).toContain('data-testid="admin-console-nav"')
    expect(html).toContain('People &amp; Roles')
    expect(html).toContain('All Orders')
    expect(html).toContain('Payment Exceptions')
    expect(html).toContain('Store &amp; Operations')
  })

  it('renders People & Roles section by default with metrics and user filter tabs', () => {
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AdminConsolePage, null)
      )
    )

    expect(html).toContain('data-testid="section-people-roles"')
    expect(html).toContain('Total Users')
    expect(html).toContain('Runner Applicants')
    expect(html).toContain('Active Runners')
    expect(html).toContain('Search by name or email...')
  })
})
