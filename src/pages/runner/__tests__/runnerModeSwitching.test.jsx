import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import ProfilePage from '@/pages/customer/ProfilePage'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import { ROLES, hasPermission, PERMISSIONS } from '@/utils/permissions'

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Customer & Runner Mode Switching Flow', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'tok_test',
      user: null,
      session: null,
      isInitialized: true,
      configError: null,
    })
    useCartStore.setState({
      items: { item_1: { id: 'item_1', name: 'Campus Sandwich', pricePaise: 12000, quantity: 2, storeId: 'store_1' } },
    })
  })

  it('renders Customer Mode without runner controls for ordinary customer', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_cust',
        name: 'Alice Customer',
        email: 'alice@campus.edu',
        roles: [ROLES.CUSTOMER],
        runnerStatus: null,
      },
    })

    const html = renderWithProviders(<AppHeader variant="customer" />)

    // Ordinary customer should NOT see runner mode switcher or applicant status
    expect(html).not.toContain('header-mode-switch-runner')
    expect(html).not.toContain('Runner application pending')
  })

  it('displays "Runner application pending" badge for runner applicants without runner access', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_applicant',
        name: 'Bob Applicant',
        email: 'bob@campus.edu',
        roles: [ROLES.CUSTOMER],
        runnerStatus: 'applicant',
      },
    })

    const html = renderWithProviders(<AppHeader variant="customer" />)

    // Should see pending badge
    expect(html).toContain('Runner application pending')
    // Should NOT see active Runner Mode switcher
    expect(html).not.toContain('header-mode-switch-runner')
    // And permission check must be strictly false
    expect(hasPermission(useAuthStore.getState().user, PERMISSIONS.RUNNER_DELIVER)).toBe(false)
  })

  it('displays "Runner suspended" badge for suspended runners and denies runner switcher', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_suspended',
        name: 'Sam Suspended',
        email: 'sam@campus.edu',
        roles: [ROLES.CUSTOMER],
        runnerStatus: 'suspended',
      },
    })

    const html = renderWithProviders(<AppHeader variant="customer" />)

    expect(html).toContain('Runner suspended')
    expect(html).not.toContain('header-mode-switch-runner')
    expect(hasPermission(useAuthStore.getState().user, PERMISSIONS.RUNNER_DELIVER)).toBe(false)
  })

  it('renders visible Runner Mode switch for approved dual-role users in Customer layout', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_approved_runner',
        name: 'Rachel Runner',
        email: 'rachel@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: 'approved',
      },
    })

    const html = renderWithProviders(<AppHeader variant="customer" />)

    // Approved runner in customer mode should see the Switch to Runner Mode button
    expect(html).toContain('header-mode-switch-runner')
    expect(html).toContain('/runner')
    expect(html).toContain('Runner Mode')
    expect(hasPermission(useAuthStore.getState().user, PERMISSIONS.RUNNER_DELIVER)).toBe(true)
  })

  it('renders visible Customer Mode switch for approved dual-role users in Runner layout', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_approved_runner',
        name: 'Rachel Runner',
        email: 'rachel@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: 'approved',
      },
    })

    const html = renderWithProviders(<AppHeader variant="runner" />)

    // Approved runner in runner mode should see the Switch to Customer Mode button
    expect(html).toContain('header-mode-switch-customer')
    expect(html).toContain('/app')
    expect(html).toContain('Customer Mode')
  })

  it('preserves cart and authentication state when switching modes', () => {
    useAuthStore.setState({
      token: 'tok_active_session',
      user: {
        id: 'usr_approved_runner',
        name: 'Rachel Runner',
        email: 'rachel@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: 'approved',
      },
    })

    // Confirm initial cart
    expect(useCartStore.getState().items['item_1']).toBeDefined()
    expect(useCartStore.getState().items['item_1'].quantity).toBe(2)

    // Re-render in runner mode (simulating navigation)
    renderWithProviders(<AppHeader variant="runner" />)

    // Cart items and token remain intact
    expect(useCartStore.getState().items['item_1'].quantity).toBe(2)
    expect(useAuthStore.getState().token).toBe('tok_active_session')
  })

  it('displays tailored pending message on ForbiddenPage for applicants attempting to access /runner', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_applicant',
        name: 'Bob Applicant',
        email: 'bob@campus.edu',
        roles: [ROLES.CUSTOMER],
        runnerStatus: 'applicant',
      },
    })

    const html = renderWithProviders(<ForbiddenPage role="runner" />)

    expect(html).toContain('Runner application pending')
    expect(html).toContain('under review by campus administrators')
    expect(html).toContain('/app')
    expect(html).toContain('Go to shopping')
  })

  it('displays tailored suspended message on ForbiddenPage for suspended runners attempting to access /runner', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_suspended',
        name: 'Sam Suspended',
        email: 'sam@campus.edu',
        roles: [ROLES.CUSTOMER],
        runnerStatus: 'suspended',
      },
    })

    const html = renderWithProviders(<ForbiddenPage role="runner" />)

    expect(html).toContain('Runner access suspended')
    expect(html).toContain('runner delivery privileges are currently suspended')
    expect(html).toContain('/app')
    expect(html).toContain('Go to shopping')
  })

  it('renders runner mode status and switch button on ProfilePage for approved runner', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_approved_runner',
        name: 'Rachel Runner',
        email: 'rachel@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: 'approved',
      },
    })

    const html = renderWithProviders(<ProfilePage />)

    expect(html).toContain('Runner Privileges Active')
    expect(html).toContain('/runner')
    expect(html).toContain('Switch to Runner Mode')
  })

  it('displays "Runner unapproved" badge for user with runner role but unapproved runnerStatus', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_unapproved_sql',
        name: 'Manual SQL Runner',
        email: 'sql@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: null,
      },
    })

    const html = renderWithProviders(<AppHeader variant="customer" />)

    expect(html).toContain('header-runner-unapproved-badge')
    expect(html).toContain('Runner unapproved')
    expect(html).not.toContain('header-mode-switch-runner')
    expect(hasPermission(useAuthStore.getState().user, PERMISSIONS.RUNNER_DELIVER)).toBe(false)
  })

  it('displays tailored unapproved message on ForbiddenPage when unapproved runner accesses /runner', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_unapproved_sql',
        name: 'Manual SQL Runner',
        email: 'sql@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: null,
      },
    })

    const html = renderWithProviders(<ForbiddenPage role="runner" />)

    expect(html).toContain('Runner role unapproved')
    expect(html).toContain('runner_status is missing or not approved')
    expect(html).toContain('/app')
    expect(html).toContain('Go to shopping')
  })

  it('correctly separates permissions for runner-only versus customer-only user', () => {
    const runnerOnly = {
      id: 'usr_runner_only',
      name: 'Sole Runner',
      email: 'sole@campus.edu',
      roles: [ROLES.RUNNER],
      runnerStatus: 'approved',
    }

    const customerOnly = {
      id: 'usr_customer_only',
      name: 'Sole Customer',
      email: 'customer@campus.edu',
      roles: [ROLES.CUSTOMER],
      runnerStatus: null,
    }

    expect(hasPermission(runnerOnly, PERMISSIONS.RUNNER_DELIVER)).toBe(true)
    expect(hasPermission(runnerOnly, PERMISSIONS.SHOP)).toBe(false)

    expect(hasPermission(customerOnly, PERMISSIONS.RUNNER_DELIVER)).toBe(false)
    expect(hasPermission(customerOnly, PERMISSIONS.SHOP)).toBe(true)
  })

  it('renders visible labels on mobile in AppHeader mode switch for dual-role users', () => {
    useAuthStore.setState({
      user: {
        id: 'usr_approved_runner',
        name: 'Rachel Runner',
        email: 'rachel@campus.edu',
        roles: [ROLES.CUSTOMER, ROLES.RUNNER],
        runnerStatus: 'approved',
      },
    })

    // In customer layout: includes both mobile and desktop label spans
    const customerHeader = renderWithProviders(<AppHeader variant="customer" />)
    expect(customerHeader).toContain('header-mode-switch-runner')
    expect(customerHeader).toContain('Runner')
    expect(customerHeader).toContain('Runner Mode')

    // In runner layout: includes both mobile and desktop label spans
    const runnerHeader = renderWithProviders(<AppHeader variant="runner" />)
    expect(runnerHeader).toContain('header-mode-switch-customer')
    expect(runnerHeader).toContain('Customer')
    expect(runnerHeader).toContain('Customer Mode')
  })
})
