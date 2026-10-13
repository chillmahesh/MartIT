import crypto from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'

describe('Production Delivery OTP Backend Verification', () => {
  let app
  let mockState

  const validOtp = '724915'
  const validOtpHash = crypto.createHash('sha256').update(validOtp).digest('hex')

  const sampleTransitOrder = {
    id: 'ord_transit_1',
    customer_id: 'usr_alice',
    runner_id: 'usr_runner_approved',
    status: 'ON_THE_WAY',
    payment_status: 'PAID',
    item_subtotal: '120.00',
    combined_delivery_fee: '15.00',
    base_amount: '135.00',
    platform_fee: '0.12',
    total_payable: '135.12',
    handover_otp_hash: validOtpHash,
    handover_attempts_count: 0,
    handover_locked_until: null,
    handover_verified_at: null,
    handover_otp_expires_at: new Date(Date.now() + 300000).toISOString(),
    handover_otp_last_resend_at: null,
    delivered_at: null,
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  beforeEach(() => {
    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', token: 'tok_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_runner_approved', token: 'tok_runner_approved', email: 'runner1@campus.edu', name: 'Runner Rob' },
        { id: 'usr_runner_other', token: 'tok_runner_other', email: 'runner2@campus.edu', name: 'Runner Rita' },
        { id: 'usr_runner_applicant', token: 'tok_runner_applicant', email: 'applicant@campus.edu', name: 'Applicant Alex' },
        { id: 'usr_admin', token: 'tok_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_runner_approved', email: 'runner1@campus.edu', name: 'Runner Rob', runner_status: 'approved' },
        { id: 'usr_runner_other', email: 'runner2@campus.edu', name: 'Runner Rita', runner_status: 'approved' },
        { id: 'usr_runner_applicant', email: 'applicant@campus.edu', name: 'Applicant Alex', runner_status: 'applicant' },
        { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: ROLES.CUSTOMER },
        { user_id: 'usr_bob', role: ROLES.CUSTOMER },
        { user_id: 'usr_runner_approved', role: ROLES.RUNNER },
        { user_id: 'usr_runner_other', role: ROLES.RUNNER },
        { user_id: 'usr_runner_applicant', role: ROLES.RUNNER },
        { user_id: 'usr_admin', role: ROLES.ADMIN },
      ],
      orders: [structuredClone(sampleTransitOrder)],
    })
    mockState = mock.state
    app = createApp()
  })

  // 1. Successful Verification
  describe('Successful OTP Verification', () => {
    it('approved assigned runner verifies correct OTP and marks order DELIVERED via REST endpoint', async () => {
      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '724915' })

      expect(res.status).toBe(200)
      expect(res.body.orderId).toBe('ord_transit_1')
      expect(res.body.status).toBe('DELIVERED')
      expect(res.body.handoverVerifiedAt).toBeDefined()
      expect(res.body.deliveredAt).toBeDefined()

      // DB Assertions
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.status).toBe('DELIVERED')
      expect(dbOrder.handover_verified_at).toBeDefined()
      expect(dbOrder.delivered_at).toBeDefined()
      expect(dbOrder.handover_otp_hash).toBeNull()
      expect(dbOrder.handover_attempts_count).toBe(0)
    })

    it('approved assigned runner verifies correct OTP via frontend-mapped endpoint', async () => {
      const res = await request(app)
        .post('/runner/order/verifyOtp')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ orderId: 'ord_transit_1', otp: '724915' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('DELIVERED')

      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.status).toBe('DELIVERED')
    })
  })

  // 2. Failed Verification & Attempt Tracking
  describe('Failed OTP Verification & Lockout', () => {
    it('rejects incorrect OTP with 400 OTP_INVALID and increments failed attempts', async () => {
      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '000000' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('OTP_INVALID')

      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.status).toBe('ON_THE_WAY')
      expect(dbOrder.handover_attempts_count).toBe(1)
      expect(dbOrder.handover_locked_until).toBeNull()
    })

    it('enforces 5-minute lockout on the 3rd failed attempt with 429 OTP_LOCKED', async () => {
      // Attempt 1
      await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '000001' })

      // Attempt 2
      await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '000002' })

      // Attempt 3 -> triggers lockout
      const res3 = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '000003' })

      expect(res3.status).toBe(429)
      expect(res3.body.code).toBe('OTP_LOCKED')

      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.handover_attempts_count).toBe(3)
      expect(dbOrder.handover_locked_until).toBeDefined()

      // Subsequent attempt while locked (even with valid OTP) is rejected with 429
      const res4 = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '724915' })

      expect(res4.status).toBe(429)
      expect(res4.body.code).toBe('OTP_LOCKED')
      expect(dbOrder.status).toBe('ON_THE_WAY')
    })
  })

  // 3. Input Validation
  describe('Malformed Input Validation', () => {
    it('rejects non-numeric or non-6-digit OTP formats with 400 OTP_INVALID_FORMAT', async () => {
      const invalidOtps = ['12345', '1234567', 'abcdef', '12a456', '', null, undefined]

      for (const otp of invalidOtps) {
        const res = await request(app)
          .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
          .set('Authorization', 'Bearer tok_runner_approved')
          .send({ otp })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('OTP_INVALID_FORMAT')
      }

      // No DB modifications
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.handover_attempts_count).toBe(0)
    })
  })

  // 4. Expiry & Replay Protection
  describe('Expiry and Replay Protection', () => {
    it('rejects expired OTP challenge with 400 OTP_EXPIRED', async () => {
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      dbOrder.handover_otp_expires_at = new Date(Date.now() - 1000).toISOString()

      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '724915' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('OTP_EXPIRED')
      expect(dbOrder.status).toBe('ON_THE_WAY')
    })

    it('rejects replay attempts on already completed orders with 409 OTP_ALREADY_USED', async () => {
      // First verify successfully
      await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '724915' })

      // Second attempt (replay)
      const replayRes = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '724915' })

      expect(replayRes.status).toBe(409)
      expect(replayRes.body.code).toBe('OTP_ALREADY_USED')
    })
  })

  // 5. Authorization & Permissions
  describe('Strict Authorization Enforcement', () => {
    it('unauthenticated caller cannot verify OTP (401)', async () => {
      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .send({ otp: '724915' })

      expect(res.status).toBe(401)
    })

    it('customer cannot call runner verification endpoint (403)', async () => {
      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_alice')
        .send({ otp: '724915' })

      expect(res.status).toBe(403)
    })

    it('unapproved runner applicant cannot verify OTP (403)', async () => {
      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_applicant')
        .send({ otp: '724915' })

      expect(res.status).toBe(403)
    })

    it('approved runner who is NOT assigned to the order cannot verify OTP (403)', async () => {
      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_other')
        .send({ otp: '724915' })

      expect(res.status).toBe(403)
    })

    it('unauthorized user cannot view another customer delivery OTP challenge (403)', async () => {
      const res = await request(app)
        .get('/api/v1/orders/ord_transit_1/delivery-otp')
        .set('Authorization', 'Bearer tok_bob')

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })
  })

  // 6. Order State Guards
  describe('Order State Machine Guards', () => {
    it('rejects OTP verification if order is not in ON_THE_WAY state (400)', async () => {
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      dbOrder.status = 'CONFIRMED'

      const res = await request(app)
        .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
        .set('Authorization', 'Bearer tok_runner_approved')
        .send({ otp: '724915' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_ORDER_STATE')
    })
  })

  // 7. Customer Delivery OTP Challenge Retrieval
  describe('Customer Delivery OTP Retrieval', () => {
    it('allows authenticated owner (Alice) to retrieve challenge metadata without exposing plaintext OTP or hash', async () => {
      const res = await request(app)
        .get('/api/v1/orders/ord_transit_1/delivery-otp')
        .set('Authorization', 'Bearer tok_alice')

      expect(res.status).toBe(200)
      expect(res.body.orderId).toBe('ord_transit_1')
      expect(res.body.status).toBe('ON_THE_WAY')
      expect(res.body.isExpired).toBe(false)
      expect(res.body.isLocked).toBe(false)
      expect(res.body.attemptsRemaining).toBe(3)
      expect(res.body.deliveryChannel).toBe('SMS')

      // Plaintext OTP and internal hash are NEVER exposed
      expect(res.body.otp).toBeUndefined()
      expect(res.body.handover_otp_hash).toBeUndefined()
      expect(res.body.handoverOtpHash).toBeUndefined()
    })

    it('supports POST /customer/order/getDeliveryOtp mapped endpoint', async () => {
      const res = await request(app)
        .post('/customer/order/getDeliveryOtp')
        .set('Authorization', 'Bearer tok_alice')
        .send({ orderId: 'ord_transit_1' })

      expect(res.status).toBe(200)
      expect(res.body.orderId).toBe('ord_transit_1')
    })
  })

  // 8. Customer OTP Refresh & Rate Limiting
  describe('Customer OTP Refresh & Rate Limiting', () => {
    it('allows owner to refresh delivery challenge and sets fresh expiry', async () => {
      const res = await request(app)
        .post('/api/v1/orders/ord_transit_1/refresh-otp')
        .set('Authorization', 'Bearer tok_alice')

      expect(res.status).toBe(200)
      expect(res.body.orderId).toBe('ord_transit_1')
      expect(res.body.expiresAt).toBeDefined()
      expect(res.body.attemptsRemaining).toBe(3)

      // DB Assertions
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.handover_otp_last_resend_at).toBeDefined()
      expect(dbOrder.handover_otp_hash).toBeDefined()
      // Plaintext OTP is NOT in the response
      expect(res.body.otp).toBeUndefined()
    })

    it('enforces 15-second cooldown on consecutive refresh requests with 429 RATE_LIMITED', async () => {
      // First refresh
      const res1 = await request(app)
        .post('/api/v1/orders/ord_transit_1/refresh-otp')
        .set('Authorization', 'Bearer tok_alice')
      expect(res1.status).toBe(200)

      // Immediate second refresh within 15 seconds
      const res2 = await request(app)
        .post('/api/v1/orders/ord_transit_1/refresh-otp')
        .set('Authorization', 'Bearer tok_alice')

      expect(res2.status).toBe(429)
      expect(res2.body.code).toBe('RATE_LIMITED')
    })

    it('prohibits refresh while verification is actively locked (429 OTP_LOCKED)', async () => {
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      dbOrder.handover_locked_until = new Date(Date.now() + 300000).toISOString()

      const res = await request(app)
        .post('/api/v1/orders/ord_transit_1/refresh-otp')
        .set('Authorization', 'Bearer tok_alice')

      expect(res.status).toBe(429)
      expect(res.body.code).toBe('OTP_LOCKED')
    })
  })

  // 9. Secret Non-Leakage in General Endpoints
  describe('Information Security: Zero Hash or Secret Leaks', () => {
    it('general order detail endpoint does not leak handover_otp_hash or plaintext OTP', async () => {
      const res = await request(app)
        .get('/api/v1/orders/ord_transit_1')
        .set('Authorization', 'Bearer tok_alice')

      expect(res.status).toBe(200)
      expect(res.body.handover_otp_hash).toBeUndefined()
      expect(res.body.handoverOtpHash).toBeUndefined()
      expect(res.body.otp).toBeUndefined()
      expect(JSON.stringify(res.body)).not.toContain(validOtpHash)
      expect(JSON.stringify(res.body)).not.toContain(validOtp)
    })

    it('customer order history endpoint does not leak handover_otp_hash or plaintext OTP', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', 'Bearer tok_alice')

      expect(res.status).toBe(200)
      expect(JSON.stringify(res.body)).not.toContain(validOtpHash)
      expect(JSON.stringify(res.body)).not.toContain(validOtp)
    })
  })

  // 10. Concurrency-Safe Handover
  describe('Concurrency Safety', () => {
    it('concurrent verification requests deliver order once without double delivery', async () => {
      const [req1, req2] = await Promise.all([
        request(app)
          .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
          .set('Authorization', 'Bearer tok_runner_approved')
          .send({ otp: '724915' }),
        request(app)
          .post('/api/v1/runner/orders/ord_transit_1/verify-handover')
          .set('Authorization', 'Bearer tok_runner_approved')
          .send({ otp: '724915' }),
      ])

      const statuses = [req1.status, req2.status].sort()
      // One request succeeds (200), the subsequent concurrent request receives 409 OTP_ALREADY_USED
      expect(statuses).toEqual([200, 409])

      const dbOrder = mockState.orders.find((o) => o.id === 'ord_transit_1')
      expect(dbOrder.status).toBe('DELIVERED')
    })
  })
})
