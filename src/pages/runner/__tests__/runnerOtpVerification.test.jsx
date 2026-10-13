import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createMockServer } from '@/services/mockServer/handlers'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { generateOtp, hashOtp, isValidOtpFormat } from '@/utils/cryptoOtp'
import { DeliveryCard } from '@/components/runner/DeliveryCard'
import { CustomerDeliveryOtpCard } from '@/components/customer/CustomerDeliveryOtpCard'
import { useAuthStore } from '@/stores/authStore'
import { SAMPLE_ORDERS } from '@/mocks/orders'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('Milestone 3: Secure Customer Delivery OTP Verification', () => {
  let server

  beforeEach(() => {
    server = createMockServer()
    for (const sample of SAMPLE_ORDERS) {
      if (!server.db.orders.some((o) => o.id === sample.id)) {
        server.db.orders.push(structuredClone(sample))
      }
    }
    useAuthStore.setState({
      user: { id: 'u_runner_1', roles: ['runner', 'customer'], runnerStatus: 'approved' },
      token: 'mock-token-runner',
    })
  })


  // 1. CSPRNG & Crypto Utility Tests
  describe('CSPRNG & Crypto Utility (cryptoOtp.js)', () => {
    it('generates a 6-digit numeric OTP', () => {
      const otp = generateOtp()
      expect(otp).toMatch(/^\d{6}$/)
      expect(otp.length).toBe(6)
    })

    it('validates 6-digit numeric OTP format correctly', () => {
      expect(isValidOtpFormat('123456')).toBe(true)
      expect(isValidOtpFormat('000000')).toBe(true)
      expect(isValidOtpFormat('999999')).toBe(true)

      // Rejections
      expect(isValidOtpFormat('12345')).toBe(false)
      expect(isValidOtpFormat('1234567')).toBe(false)
      expect(isValidOtpFormat('12a456')).toBe(false)
      expect(isValidOtpFormat('abcdef')).toBe(false)
      expect(isValidOtpFormat('')).toBe(false)
      expect(isValidOtpFormat(null)).toBe(false)
    })

    it('generates deterministic SHA-256 hash for given OTP', async () => {
      const hash1 = await hashOtp('724915')
      const hash2 = await hashOtp('724915')
      const hash3 = await hashOtp('111111')

      expect(typeof hash1).toBe('string')
      expect(hash1.length).toBe(64) // SHA-256 hex string
      expect(hash1).toBe(hash2)
      expect(hash1).not.toBe(hash3)
    })
  })

  // 2. Mock Server Handover Challenge Lifecycle
  describe('Mock Server OTP Handover Lifecycle', () => {
    it('generates an OTP challenge when order transitions to ON_THE_WAY', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Move ord_sample_prep_2 (PREPARING) -> PICKED_UP -> ON_THE_WAY
      await server.handle(
        'runner.order.transition',
        { orderId: 'ord_sample_prep_2', nextStatus: ORDER_STATUS.PICKED_UP },
        { token: runnerToken },
      )

      const onTheWay = await server.handle(
        'runner.order.transition',
        { orderId: 'ord_sample_prep_2', nextStatus: ORDER_STATUS.ON_THE_WAY },
        { token: runnerToken },
      )

      expect(onTheWay.status).toBe(ORDER_STATUS.ON_THE_WAY)

      // Authoritative order state verification in DB
      const dbOrder = server.db.orders.find((o) => o.id === 'ord_sample_prep_2')
      expect(dbOrder.handoverOtpHash).toBeDefined()
      expect(dbOrder.handoverOtpExpiresAt).toBeGreaterThan(Date.now())
      expect(dbOrder.handoverAttemptsCount).toBe(0)
      expect(dbOrder.handoverLockedUntil).toBeNull()
      expect(dbOrder._mockOtp).toMatch(/^\d{6}$/)
    })

    it('correct OTP successfully verifies and completes assigned order atomically', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // ord_sample_transit_3 is pre-seeded in ON_THE_WAY with OTP '724915'
      const completed = await server.handle(
        'runner.order.verifyOtp',
        { orderId: 'ord_sample_transit_3', otp: '724915' },
        { token: runnerToken },
      )

      expect(completed.id).toBe('ord_sample_transit_3')
      expect(completed.status).toBe(ORDER_STATUS.DELIVERED)
      expect(completed.handoverVerifiedAt).toBeDefined()
      expect(completed.deliveredAt).toBeDefined()

      // In database, the OTP hash is consumed
      const dbOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')
      expect(dbOrder.status).toBe(ORDER_STATUS.DELIVERED)
      expect(dbOrder.handoverOtpHash).toBeFalsy()
      expect(dbOrder._mockOtp).toBeFalsy()
    })


    it('incorrect OTP is rejected and increments failed attempts count', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '999999' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_INVALID',
        status: 400,
        details: { attemptsRemaining: 2 },
      })

      const dbOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')
      expect(dbOrder.handoverAttemptsCount).toBe(1)
      expect(dbOrder.status).toBe(ORDER_STATUS.ON_THE_WAY) // order is NOT delivered
    })

    it('rejects OTP that does not contain exactly six numeric digits', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '12345' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_INVALID_FORMAT',
        status: 400,
      })

      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: 'abcdef' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_INVALID_FORMAT',
        status: 400,
      })
    })

    it('rejects expired OTP challenge with OTP_EXPIRED', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token
      const dbOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')

      // Set expiry to the past
      dbOrder.handoverOtpExpiresAt = Date.now() - 1000

      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '724915' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_EXPIRED',
        status: 410,
      })

      expect(dbOrder.status).toBe(ORDER_STATUS.ON_THE_WAY)
    })

    it('activates 5-minute lockout on the third failed verification attempt', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Attempt 1: 2 attempts left
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '000001' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({ code: 'OTP_INVALID', details: { attemptsRemaining: 2 } })

      // Attempt 2: 1 attempt left
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '000002' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({ code: 'OTP_INVALID', details: { attemptsRemaining: 1 } })

      // Attempt 3: Triggers lockout (OTP_LOCKED, status 429)
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '000003' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_LOCKED',
        status: 429,
      })

      const dbOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')
      expect(dbOrder.handoverAttemptsCount).toBe(3)
      expect(dbOrder.handoverLockedUntil).toBeGreaterThan(Date.now() + 4 * 60 * 1000)

      // Attempt 4 during lockout is immediately rejected with OTP_LOCKED even with correct OTP
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '724915' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_LOCKED',
        status: 429,
      })
    })

    it('lockout does not disappear when customer requests OTP refresh/resend', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token
      const customerToken = (await server.handle('auth.demoLogin', { role: 'customer' })).token

      // Lock the order with 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await server
          .handle(
            'runner.order.verifyOtp',
            { orderId: 'ord_sample_transit_3', otp: `11111${i}` },
            { token: runnerToken },
          )
          .catch(() => {})
      }

      // Customer attempts to resend OTP while locked
      await expect(
        server.handle(
          'customer.order.refreshOtp',
          { orderId: 'ord_sample_transit_3' },
          { token: customerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_LOCKED',
        status: 429,
      })
    })

    it('consumed OTP cannot be reused to deliver an order twice (replay protection)', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // First verification succeeds
      await server.handle(
        'runner.order.verifyOtp',
        { orderId: 'ord_sample_transit_3', otp: '724915' },
        { token: runnerToken },
      )

      // Second attempt with the same OTP fails
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '724915' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_ALREADY_USED',
        status: 409,
      })
    })

    it('unassigned runner cannot verify another runner\'s order', async () => {
      const runner2Token = (await server.handle('auth.demoLogin', { role: 'runner_2' })).token

      // ord_sample_transit_3 belongs to u_runner_1
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_transit_3', otp: '724915' },
          { token: runner2Token },
        ),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      })
    })

    it('unauthorized customer cannot retrieve another customer\'s OTP', async () => {
      const customerToken = (await server.handle('auth.demoLogin', { role: 'customer' })).token
      // Set customerId on ord_sample_transit_3 to a different customer
      const dbOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')
      dbOrder.customerId = 'u_customer_other'

      await expect(
        server.handle(
          'customer.order.getDeliveryOtp',
          { orderId: 'ord_sample_transit_3' },
          { token: customerToken },
        ),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      })
    })

    it('cannot complete order with OTP before ON_THE_WAY state', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // ord_sample_prep_2 is in PREPARING
      await expect(
        server.handle(
          'runner.order.verifyOtp',
          { orderId: 'ord_sample_prep_2', otp: '123456' },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_ORDER_STATE',
        status: 400,
      })
    })

    it('direct status mutation cannot bypass OTP verification', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      // Attempting direct transition to DELIVERED via state machine endpoint is blocked
      await expect(
        server.handle(
          'runner.order.transition',
          { orderId: 'ord_sample_transit_3', nextStatus: ORDER_STATUS.DELIVERED },
          { token: runnerToken },
        ),
      ).rejects.toMatchObject({
        code: 'OTP_VERIFICATION_REQUIRED',
        status: 400,
      })
    })

    it('public and general API responses do not leak plaintext OTP or hash', async () => {
      const runnerToken = (await server.handle('auth.demoLogin', { role: 'runner' })).token

      const publicOrder = await server.handle('orders.get', { orderId: 'ord_sample_transit_3' }, { token: runnerToken })
      expect(publicOrder.handoverOtpHash).toBeUndefined()
      expect(publicOrder._mockOtp).toBeUndefined()


      const runnerOrders = await server.handle('runner.orders.assigned', {}, { token: runnerToken })
      const transitOrder = runnerOrders.find((o) => o.id === 'ord_sample_transit_3')
      expect(transitOrder.handoverOtpHash).toBeUndefined()
      expect(transitOrder._mockOtp).toBeUndefined()
    })
  })

  // 3. UI Components Testing
  describe('Runner & Customer UI Verification', () => {
    it('renders accessible OTP entry panel for assigned runner when order is ON_THE_WAY', () => {
      const transitOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')
      const html = renderToString(
        <DeliveryCard order={transitOrder} isOnline={true} currentRunnerId="u_runner_1" onAction={vi.fn()} />,
      )

      expect(html).toContain('Customer Handover Verification')
      expect(html).toContain('OTP Required')
      expect(html).toContain('6-digit Handover OTP')
      expect(html).toContain('Verify &amp; Deliver')
      expect(html).toContain('Out for Delivery')
      expect(html).toContain('data-testid="otp-input-ord_sample_transit_3"')
      expect(html).toContain('data-testid="action-verify-otp-ord_sample_transit_3"')

      // Plaintext OTP is NEVER displayed in runner interface
      expect(html).not.toContain('724915')
    })

    it('hides OTP entry panel if runner is not assigned to the order', () => {
      const transitOrder = server.db.orders.find((o) => o.id === 'ord_sample_transit_3')
      const html = renderToString(
        <DeliveryCard order={transitOrder} isOnline={true} currentRunnerId="u_runner_unassigned" onAction={vi.fn()} />,
      )

      expect(html).not.toContain('data-testid="otp-input-ord_sample_transit_3"')
      expect(html).toContain('Assigned to another runner')
    })


    it('renders CustomerDeliveryOtpCard with prominent DEMO MODE indicator and code', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      // Seed query cache with demo OTP response
      queryClient.setQueryData(['delivery-otp', 'ord_sample_transit_3'], {
        orderId: 'ord_sample_transit_3',
        demoMode: true,
        otp: '724915',
        expiresAt: Date.now() + 5 * 60 * 1000,
        isExpired: false,
        isLocked: false,
        attemptsRemaining: 3,
      })

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <CustomerDeliveryOtpCard orderId="ord_sample_transit_3" />
        </QueryClientProvider>,
      )

      expect(html).toContain('Delivery Handover OTP')
      expect(html).toContain('DEMO MODE')
      expect(html).toContain('Simulated Customer Interface')
      expect(html).toContain('7')
      expect(html).toContain('2')
      expect(html).toContain('4')
      expect(html).toContain('9')
      expect(html).toContain('1')
      expect(html).toContain('5')
      expect(html).toContain('Share code with your runner upon delivery')
      expect(html).toContain('data-testid="refresh-otp-btn-ord_sample_transit_3"')
    })

    it('renders truthful provider pending setup notice in production mode when deliveryChannelConfigured is false', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      queryClient.setQueryData(['delivery-otp', 'ord_prod_1'], {
        orderId: 'ord_prod_1',
        demoMode: false,
        otp: null, // Production: never exposed in API
        expiresAt: Date.now() + 5 * 60 * 1000,
        isExpired: false,
        isLocked: false,
        attemptsRemaining: 3,
        deliveryChannel: 'SMS',
        deliveryChannelConfigured: false,
      })

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <CustomerDeliveryOtpCard orderId="ord_prod_1" />
        </QueryClientProvider>,
      )

      expect(html).toContain('SMS Provider Pending Setup')
      expect(html).toContain('Automated OTP dispatch is awaiting SMS provider setup')
      expect(html).not.toContain('Dispatched via SMS')
      expect(html).not.toContain('DEMO MODE')
    })

    it('renders clear in-app OTP digits panel in production mode for authenticated customer without demo badge', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      queryClient.setQueryData(['delivery-otp', 'ord_prod_in_app'], {
        orderId: 'ord_prod_in_app',
        demoMode: false,
        otp: '849201',
        expiresAt: Date.now() + 5 * 60 * 1000,
        isExpired: false,
        isLocked: false,
        attemptsRemaining: 3,
        deliveryChannel: 'IN_APP',
        deliveryChannelConfigured: true,
      })

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <CustomerDeliveryOtpCard orderId="ord_prod_in_app" />
        </QueryClientProvider>,
      )

      expect(html).toContain('8')
      expect(html).toContain('4')
      expect(html).toContain('9')
      expect(html).toContain('2')
      expect(html).toContain('0')
      expect(html).toContain('1')
      expect(html).not.toContain('DEMO MODE')
      expect(html).not.toContain('SMS Provider Pending Setup')
    })

    it('renders delivered confirmation and verified badge in DeliveryCard when DELIVERED', () => {
      const deliveredOrder = {
        ...server.db.orders.find((o) => o.id === 'ord_sample_transit_3'),
        status: ORDER_STATUS.DELIVERED,
        handoverVerifiedAt: new Date().toISOString(),
      }

      const html = renderToString(<DeliveryCard order={deliveredOrder} isOnline={true} />)
      expect(html).toContain('Delivered')
      expect(html).toContain('OTP Verified')
      expect(html).not.toContain('Verify &amp; Deliver')
    })
  })
})
