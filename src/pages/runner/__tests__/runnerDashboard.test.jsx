import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import RunnerDashboardPage from '@/pages/runner/RunnerDashboardPage'
import { RunnerAvailabilityToggle } from '@/components/runner/RunnerAvailabilityToggle'
import { RunnerStatsSummary } from '@/components/runner/RunnerStatsSummary'
import { DeliveryCard } from '@/components/runner/DeliveryCard'
import { DeliverySection } from '@/components/runner/DeliverySection'
import { useRunnerStore } from '@/stores/runnerStore'
import { useAuthStore } from '@/stores/authStore'
import { createMockServer } from '@/services/mockServer/handlers'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { PERMISSIONS, ROLES, hasPermission } from '@/utils/permissions'
import { SAMPLE_ORDERS } from '@/mocks/orders'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

describe('Runner Dashboard UI — Milestone 1', () => {
  let server

  beforeEach(() => {
    server = createMockServer()
    useRunnerStore.setState({ isOnline: true, activeTab: 'all' })
  })

  // 1. Runner Availability Toggle
  describe('Runner Availability Toggle', () => {
    it('renders Online status with accessible toggle when isOnline is true', () => {
      const html = renderToString(<RunnerAvailabilityToggle isOnline={true} />)

      expect(html).toContain('Online')
      expect(html).toContain('Active for pickups')
      expect(html).toContain('Toggle runner availability')
      expect(html).toContain('Go Offline')
      expect(html).toContain('data-state="checked"')
    })

    it('renders Offline status with accessible toggle when isOnline is false', () => {
      const html = renderToString(<RunnerAvailabilityToggle isOnline={false} />)

      expect(html).toContain('Offline')
      expect(html).toContain('Paused')
      expect(html).toContain('Go Online')
      expect(html).toContain('data-state="unchecked"')
    })

    it('toggles availability state in runnerStore', () => {
      useRunnerStore.setState({ isOnline: true })
      useRunnerStore.getState().toggleAvailability()
      expect(useRunnerStore.getState().isOnline).toBe(false)

      useRunnerStore.getState().toggleAvailability()
      expect(useRunnerStore.getState().isOnline).toBe(true)
    })
  })

  // 2. Dashboard Activity Summary
  describe('Dashboard Activity Summary', () => {
    it('displays counts derived dynamically from order records', () => {
      const html = renderToString(
        <RunnerStatsSummary
          availableCount={3}
          activeCount={5}
          completedCount={12}
          selectedTab="all"
          onSelectTab={vi.fn()}
        />,
      )

      expect(html).toContain('Delivery Activity Summary')
      expect(html).toContain('Derived from current records')
      expect(html).toContain('New Requests')
      expect(html).toContain('Active Deliveries')
      expect(html).toContain('Completed')
      expect(html).toContain('3')
      expect(html).toContain('5')
      expect(html).toContain('12')
    })
  })

  // 3. Delivery Cards
  describe('DeliveryCard Component', () => {
    it('renders order reference, store, destination, items, and delivery fee correctly', () => {
      const sampleOrder = SAMPLE_ORDERS[0] // Available request
      const html = renderToString(
        <DeliveryCard order={sampleOrder} isOnline={true} onAction={vi.fn()} />,
      )

      // Order Reference
      expect(html).toContain(`#${sampleOrder.id}`)

      // Status Pill
      expect(html).toContain('Confirmed')

      // Store Name
      expect(html).toContain('Campus Mart')

      // Destination & Landmark
      expect(html).toContain('A Block')
      expect(html).toContain('Room 204, 2nd Floor')
      expect(html).toContain('Recipient: Aarav Patel')

      // Items Summary
      expect(html).toContain('3 items')
      expect(html).toContain('2× Toned Milk')

      // Authoritative Delivery Fee and Payout
      expect(html).toContain('Delivery Fee')
      expect(html).toContain('₹10')
      expect(html).toContain('Est. Payout ₹8')

      // Action Button
      expect(html).toContain('Accept Request')
    })

    it('handles orders with undecided/provisional runner payout without inventing numbers', () => {
      const sampleOrder = SAMPLE_ORDERS[1] // 15 fee band -> runner payout is null in policy
      const html = renderToString(
        <DeliveryCard order={sampleOrder} isOnline={true} onAction={vi.fn()} />,
      )

      expect(html).toContain('₹15')
      expect(html).toContain('(Payout at assignment)')
      expect(html).toContain('Store Preparing')
    })

    it('handles missing landmark or customer details gracefully', () => {
      const orderWithoutDetails = {
        id: 'ord_minimal_99',
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk_500', name: 'Milk', quantity: 1 }],
        customerDetails: null,
        pricing: { deliveryFee: 10, total: 38 },
        status: ORDER_STATUS.CONFIRMED,
      }

      const html = renderToString(<DeliveryCard order={orderWithoutDetails} />)
      expect(html).toContain('#ord_minimal_99')
      expect(html).toContain('Campus Mart')
      expect(html).toContain('Hostel A, Block 1')
      expect(html).toContain('1 item')
      expect(html).toContain('Recipient: Customer')

      // Also verify fallback when locationId is completely missing
      const orderWithoutLocation = { ...orderWithoutDetails, locationId: null }
      const htmlFallback = renderToString(<DeliveryCard order={orderWithoutLocation} />)
      expect(htmlFallback).toContain('Campus Destination')
    })
  })

  // 4. Delivery Sections & Empty States
  describe('DeliverySection and Empty States', () => {
    it('renders delivery cards when orders are present', () => {
      const html = renderToString(
        <DeliverySection
          title="Available Requests"
          count={1}
          orders={[SAMPLE_ORDERS[0]]}
          isOnline={true}
        />,
      )

      expect(html).toContain('Available Requests')
      expect(html).toContain(`#${SAMPLE_ORDERS[0].id}`)
      expect(html).not.toContain('No available delivery requests')
    })

    it('renders informative empty state when section has zero orders', () => {
      const html = renderToString(
        <DeliverySection
          title="In-Progress Deliveries"
          count={0}
          orders={[]}
          emptyTitle="No deliveries in transit"
          emptyDescription="Orders picked up from the store will appear here."
        />,
      )

      expect(html).toContain('In-Progress Deliveries')
      expect(html).toContain('No deliveries in transit')
      expect(html).toContain('Orders picked up from the store will appear here.')
    })
  })

  // 5. Role-Based Access Controls
  describe('Role-Based Access Control', () => {
    it('grants runner access only to approved runners', () => {
      const approvedRunner = {
        id: 'u_runner_1',
        roles: [ROLES.RUNNER, ROLES.CUSTOMER],
        runnerStatus: 'approved',
      }
      expect(hasPermission(approvedRunner, PERMISSIONS.RUNNER_DELIVER)).toBe(true)

      const pendingRunner = {
        id: 'u_runner_2',
        roles: [ROLES.RUNNER],
        runnerStatus: 'pending',
      }
      expect(hasPermission(pendingRunner, PERMISSIONS.RUNNER_DELIVER)).toBe(false)

      const regularCustomer = {
        id: 'u_customer_1',
        roles: [ROLES.CUSTOMER],
        runnerStatus: null,
      }
      expect(hasPermission(regularCustomer, PERMISSIONS.RUNNER_DELIVER)).toBe(false)
    })
  })

  // 6. Mock Server Runner Endpoints
  describe('Mock Server Runner Orders Endpoint', () => {
    it('returns assigned orders for approved runner and rejects non-runners', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token
      const orders = await server.handle('runner.orders.assigned', {}, { token: runnerToken })

      expect(Array.isArray(orders)).toBe(true)
      expect(orders.length).toBeGreaterThan(0)

      // Customer attempt is rejected
      const customerToken = (await server.handle('auth.demoLogin', { role: 'customer' })).token
      await expect(
        server.handle('runner.orders.assigned', {}, { token: customerToken }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  // 7. Full Page SSR & Layout
  describe('RunnerDashboardPage Rendering', () => {
    it('renders RunnerDashboardPage with title, availability toggle, and summary', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <RunnerDashboardPage />
          </MemoryRouter>
        </QueryClientProvider>,
      )

      expect(html).toContain('Runner Dashboard')
      expect(html).toContain('Milestone 2')
      expect(html).toContain('Mock Environment')
      expect(html).toContain('Delivery Activity Summary')
      expect(html).toContain('Online')
    })
  })

  // 8. Milestone 2: Runner Assignment & Concurrency
  describe('Milestone 2: Runner Assignment & Concurrency', () => {
    it('successfully accepts an available delivery request', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token
      const result = await server.handle(
        'runner.order.accept',
        { orderId: 'ord_sample_avail_1', isOnline: true },
        { token: runnerToken },
      )

      expect(result.id).toBe('ord_sample_avail_1')
      expect(result.status).toBe(ORDER_STATUS.PREPARING)
      expect(result.runnerId).toBe('u_runner_1')
    })

    it('prevents two runners from accepting the same request (concurrency)', async () => {
      const runner1Token = (await server.handle('auth.demoLogin', { role: 'runner' })).token
      const runner2Token = (await server.handle('auth.demoLogin', { role: 'runner_2' })).token

      // Runner 1 accepts ord_sample_avail_1
      await server.handle(
        'runner.order.accept',
        { orderId: 'ord_sample_avail_1', isOnline: true },
        { token: runner1Token },
      )

      // Runner 2 attempts to accept the same order
      await expect(
        server.handle(
          'runner.order.accept',
          { orderId: 'ord_sample_avail_1', isOnline: true },
          { token: runner2Token },
        ),
      ).rejects.toMatchObject({
        code: 'ORDER_ALREADY_ASSIGNED',
        status: 409,
      })
    })

    it('rejects already-accepted or unavailable requests', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Accepting again by the same runner
      await server.handle(
        'runner.order.accept',
        { orderId: 'ord_sample_avail_1', isOnline: true },
        { token: runnerToken },
      )
      await expect(
        server.handle(
          'runner.order.accept',
          { orderId: 'ord_sample_avail_1', isOnline: true },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'ORDER_ALREADY_ACCEPTED',
        status: 400,
      })

      // Attempting to accept an order not in CONFIRMED status
      server.db.orders.push({
        id: 'ord_cancelled_test',
        runnerId: null,
        status: ORDER_STATUS.CANCELLED,
      })
      await expect(
        server.handle(
          'runner.order.accept',
          { orderId: 'ord_cancelled_test', isOnline: true },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'UNAVAILABLE_REQUEST',
        status: 409,
      })
    })

    it('enforces offline runner restrictions on acceptance and availability', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Reject acceptance when runner is offline
      await expect(
        server.handle(
          'runner.order.accept',
          { orderId: 'ord_sample_avail_1', isOnline: false },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'RUNNER_OFFLINE',
        status: 400,
      })

      // When offline, unassigned available requests are not offered
      const offlineOrders = await server.handle(
        'runner.orders.assigned',
        { isOnline: false },
        { token: runnerToken },
      )
      expect(offlineOrders.some((o) => o.status === ORDER_STATUS.CONFIRMED)).toBe(false)
    })
  })

  // 9. Milestone 2: Order Status Progression & Transitions
  describe('Milestone 2: Order Status Progression & Transitions', () => {
    it('prevents illegal status transitions and repeated actions', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Accept ord_sample_avail_1 to become PREPARING
      await server.handle(
        'runner.order.accept',
        { orderId: 'ord_sample_avail_1', isOnline: true },
        { token: runnerToken },
      )

      // Illegal skip transition: PREPARING -> ON_THE_WAY
      await expect(
        server.handle(
          'runner.order.transition',
          { orderId: 'ord_sample_avail_1', nextStatus: ORDER_STATUS.ON_THE_WAY },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        status: 400,
      })

      // Transition to PICKED_UP
      await server.handle(
        'runner.order.transition',
        { orderId: 'ord_sample_avail_1', nextStatus: ORDER_STATUS.PICKED_UP },
        { token: runnerToken },
      )

      // Repeated action: attempting PICKED_UP again
      await expect(
        server.handle(
          'runner.order.transition',
          { orderId: 'ord_sample_avail_1', nextStatus: ORDER_STATUS.PICKED_UP },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        status: 400,
      })

      // Milestone 2 restriction: DELIVERED requires OTP verification in Milestone 3
      await server.handle(
        'runner.order.transition',
        { orderId: 'ord_sample_avail_1', nextStatus: ORDER_STATUS.ON_THE_WAY },
        { token: runnerToken },
      )
      await expect(
        server.handle(
          'runner.order.transition',
          { orderId: 'ord_sample_avail_1', nextStatus: ORDER_STATUS.DELIVERED },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_VERIFICATION_REQUIRED',
        status: 400,
      })
    })

    it('rejects unauthorized transitions by unassigned runners', async () => {
      const runner2Token = (await server.handle('auth.demoLogin', { role: 'runner_2' })).token

      // Order ord_sample_prep_2 belongs to u_runner_1
      await expect(
        server.handle(
          'runner.order.transition',
          { orderId: 'ord_sample_prep_2', nextStatus: ORDER_STATUS.PICKED_UP },
          { token: runner2Token },
        ),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      })
    })
  })

  // 10. Milestone 2: Multi-Store Awareness
  describe('Milestone 2: Multi-Store Awareness', () => {
    it('requires all store pickups to be completed before marking order as picked up', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token
      // ord_sample_multi_5 has store_campus_mart (picked up) and store_night_canteen (pending)

      // Attempting to transition to PICKED_UP while a store is pending must fail
      await expect(
        server.handle(
          'runner.order.transition',
          { orderId: 'ord_sample_multi_5', nextStatus: ORDER_STATUS.PICKED_UP },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'PICKUPS_INCOMPLETE',
        status: 400,
      })

      // Confirm pickup for the pending store
      const updated = await server.handle(
        'runner.order.pickupStore',
        { orderId: 'ord_sample_multi_5', storeId: 'store_night_canteen' },
        { token: runnerToken },
      )

      // Since all stores are now picked up, status advances to PICKED_UP
      expect(updated.status).toBe(ORDER_STATUS.PICKED_UP)

      // Now transitioning to ON_THE_WAY succeeds
      const onTheWay = await server.handle(
        'runner.order.transition',
        { orderId: 'ord_sample_multi_5', nextStatus: ORDER_STATUS.ON_THE_WAY },
        { token: runnerToken },
      )
      expect(onTheWay.status).toBe(ORDER_STATUS.ON_THE_WAY)
    })

    it('renders multi-store checklist with all stores and status indicators in DeliveryCard', () => {
      const multiStoreOrder = {
        id: 'ord_test_multi_1',
        runnerId: 'u_runner_1',
        storeIds: ['store_campus_mart', 'store_night_canteen'],
        pickups: [
          { storeId: 'store_campus_mart', status: 'PICKED_UP' },
          { storeId: 'store_night_canteen', status: 'PENDING' },
        ],
        lines: [{ productId: 'p_milk_500', name: 'Milk', quantity: 1 }],
        customerDetails: { fullName: 'Aarav', selectedDestination: 'A Block' },
        pricing: { deliveryFee: 20 },
        status: ORDER_STATUS.PREPARING,
      }

      const html = renderToString(<DeliveryCard order={multiStoreOrder} isOnline={true} />)
      expect(html).toContain('Required Pickups (2 stores)')
      expect(html).toContain('1 of 2 collected')
      expect(html).toContain('Campus Mart')
      expect(html).toContain('Night Canteen')
      expect(html).toContain('Picked up')
      expect(html).toContain('Confirm Pickup')
      expect(html).toContain('Collect all stores first')
    })
  })
})
