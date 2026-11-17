import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminConsolePage from '../AdminConsolePage'
import { useAuthStore } from '@/stores/authStore'
import { ROLES } from '@/utils/permissions'
import { SAMPLE_STORES } from '@/mocks/campus'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import { SAMPLE_ORDERS } from '@/mocks/orders'

describe('Admin Operational Metrics & Store Operations (P1)', () => {
  let queryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    // Seed query cache with sample data
    queryClient.setQueryData(['admin', 'orders'], SAMPLE_ORDERS)
    queryClient.setQueryData(['admin', 'stores'], SAMPLE_STORES)
    queryClient.setQueryData(['catalogue', 'products'], SAMPLE_PRODUCTS)

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

  it('renders admin console navigation tabs', () => {
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AdminConsolePage, null)
      )
    )

    expect(html).toContain('Campus Operations Console')
    expect(html).toContain('All Orders')
    expect(html).toContain('Store &amp; Operations')
    expect(html).toContain('Payment Exceptions')
  })

  it('renders admin operational metrics bar in All Orders tab', () => {
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AdminConsolePage, { initialTab: 'orders' })
      )
    )

    // Operational Metrics KPI Bar
    expect(html).toContain('data-testid="admin-operational-metrics"')
    expect(html).toContain('Order Volume &amp; GMV')
    expect(html).toContain('GMV:')
    expect(html).toContain('Avg Fulfillment Time')
    expect(html).toContain('18 mins')
    expect(html).toContain('Observed avg: 18m')
    expect(html).toContain('Cancellations &amp; Expiries')
    expect(html).toContain('Verification &amp; Exceptions')
    expect(html).toContain('Make.com + Gmail')
  })

  it('renders store daily summaries, low-stock alerts, and fast product controls in Stores tab', () => {
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AdminConsolePage, { initialTab: 'stores' })
      )
    )

    // Store operations section
    expect(html).toContain('data-testid="section-store-operations"')
    expect(html).toContain('Campus Stores &amp; Daily Operations')
    expect(html).toContain('Campus Mart')
    expect(html).toContain('Night Canteen')

    // Low-Stock Alerts
    expect(html).toContain('data-testid="low-stock-alerts-card"')
    expect(html).toContain('Low-Stock &amp; Depletion Alerts')
    expect(html).toContain('+10 Units')
    expect(html).toContain('+25 Units')

    // Fast Product Availability Controls
    expect(html).toContain('data-testid="product-availability-controls"')
    expect(html).toContain('Fast Product Availability Controls')
    expect(html).toContain('data-testid="product-search-input"')
    expect(html).toContain('data-testid="product-store-filter"')
    expect(html).toContain('data-testid="toggle-availability-p_milk_500"')
  })
})
