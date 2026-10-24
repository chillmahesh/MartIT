import crypto from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'
import { setMakeVerifier, activeOtpStore } from '../routes/orders.js'

describe('End-to-End MartIT Order Lifecycle (Milestones M0–M6)', () => {
  let app
  let mockState

  const campusMartStore = {
    id: 'store_campus_mart',
    name: 'Campus Mart',
    description: 'Central Grocery Store',
    is_open: true,
    latitude: '12.971600',
    longitude: '77.594600',
  }

  const hostelLocation = {
    id: 'loc_hostel_a',
    name: 'Hostel A Block',
    group_name: 'Hostels',
    latitude: '12.973000',
    longitude: '77.595000',
    is_active: true,
  }

  const dairyProduct = {
    id: 'p_milk',
    store_id: 'store_campus_mart',
    name: 'Toned Milk',
    pack: '500 ml',
    price: '28.00',
    mrp: '30.00',
    stock: 20,
    is_available: true,
  }

  beforeEach(() => {
    activeOtpStore.clear()

    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', token: 'tok_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_runner1', token: 'tok_runner1', email: 'runner1@campus.edu', name: 'Runner Rob' },
        { id: 'usr_runner2', token: 'tok_runner2', email: 'runner2@campus.edu', name: 'Runner Rita' },
        { id: 'usr_applicant', token: 'tok_applicant', email: 'applicant@campus.edu', name: 'Applicant Alex' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_runner1', email: 'runner1@campus.edu', name: 'Runner Rob', runner_status: 'approved' },
        { id: 'usr_runner2', email: 'runner2@campus.edu', name: 'Runner Rita', runner_status: 'approved' },
        { id: 'usr_applicant', email: 'applicant@campus.edu', name: 'Applicant Alex', runner_status: 'applicant' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: ROLES.CUSTOMER },
        { user_id: 'usr_bob', role: ROLES.CUSTOMER },
        { user_id: 'usr_runner1', role: ROLES.RUNNER },
        { user_id: 'usr_runner2', role: ROLES.RUNNER },
        { user_id: 'usr_applicant', role: ROLES.CUSTOMER },
      ],
      stores: [campusMartStore],
      locations: [hostelLocation],
      products: [dairyProduct],
      orders: [],
      platform_fee_reservations: [],
      inventory_reservations: [],
    })
    mockState = mock.state
    app = createApp()
  })

  // =========================================================================
  // 1. Full 10-Step Golden Journey
  // =========================================================================
  it('executes complete 10-step order lifecycle from checkout to OTP delivery completion', async () => {
    // -----------------------------------------------------------------------
    // Step 1: Customer checks out and receives correct pricing with paise suffix
    // -----------------------------------------------------------------------
    const checkoutRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 2 }],
        customerDetails: { phone: '9876543210', instructions: 'Leave at reception' },
      })

    expect(checkoutRes.status).toBe(201)
    const orderId = checkoutRes.body.id
    expect(orderId).toBeDefined()
    expect(checkoutRes.body.status).toBe('AWAITING_PAYMENT')
    expect(checkoutRes.body.paymentStatus).toBe('PENDING')

    // Exact monetary pricing assertions
    const pricing = checkoutRes.body.pricing
    expect(pricing.itemSubtotal).toBe(56.00) // 2 * 28.00
    expect(pricing.deliveryFee).toBe(10.00)  // Flat ₹10
    expect(pricing.baseAmount).toBe(66.00)   // 56 + 10
    expect(pricing.platformFee).toBeGreaterThanOrEqual(0.01)
    expect(pricing.platformFee).toBeLessThanOrEqual(0.99)
    expect(pricing.total).toBe(Number((pricing.baseAmount + pricing.platformFee).toFixed(2)))

    const exactPaiseTotal = Math.round(pricing.total * 100)
    const exactOrderTotal = pricing.total

    // -----------------------------------------------------------------------
    // Step 2 & 3: Customer pays and backend queries Make.com verification
    // -----------------------------------------------------------------------
    let queryAmountSent = null
    let queryOrderIdSent = null

    setMakeVerifier(async ({ orderId: qOrderId, amount }) => {
      queryAmountSent = amount
      queryOrderIdSent = qOrderId
      // Return authoritative Make.com positive response with blueprint spelling
      return {
        success: true,
        status: 'confirmed',
        evidence: 'Payment recieved',
        amount,
        orderId: qOrderId,
      }
    })

    // -----------------------------------------------------------------------
    // Step 4: Valid positive confirmation triggers successful payment transition
    // -----------------------------------------------------------------------
    const paymentCheckRes = await request(app)
      .post(`/api/v1/orders/${orderId}/check-payment`)
      .set('Authorization', 'Bearer tok_alice')
      .set('x-skip-delay-for-test', 'true')

    expect(paymentCheckRes.status).toBe(200)
    expect(paymentCheckRes.body.orderId).toBe(orderId)
    expect(paymentCheckRes.body.status).toBe('verified')
    expect(paymentCheckRes.body.paymentStatus).toBe('PAID')

    // Confirm Make.com query contract: exact amount matched
    expect(queryOrderIdSent).toBe(orderId)
    expect(Math.round(queryAmountSent * 100)).toBe(exactPaiseTotal)

    // Confirm database persisted state
    const orderInDb = mockState.orders.find((o) => o.id === orderId)
    expect(orderInDb.status).toBe('CONFIRMED')
    expect(orderInDb.payment_status).toBe('PAID')
    expect(orderInDb.runner_id).toBeNull()

    // -----------------------------------------------------------------------
    // Step 5: Paid order appears as an offer to approved online runners
    // -----------------------------------------------------------------------
    const runnerOffersRes = await request(app)
      .get('/api/v1/runner/orders')
      .set('Authorization', 'Bearer tok_runner1')

    expect(runnerOffersRes.status).toBe(200)
    expect(Array.isArray(runnerOffersRes.body)).toBe(true)
    const foundOffer = runnerOffersRes.body.find((o) => o.id === orderId)
    expect(foundOffer).toBeDefined()
    expect(foundOffer.status).toBe('CONFIRMED')

    // Confirm no OTP leak in runner offer broadcast
    expect(foundOffer.handover_otp_hash).toBeUndefined()
    expect(foundOffer.otp).toBeUndefined()

    // -----------------------------------------------------------------------
    // Step 6: Runner 1 accepts the order exclusively
    // -----------------------------------------------------------------------
    const acceptRes = await request(app)
      .post(`/api/v1/runner/orders/${orderId}/accept`)
      .set('Authorization', 'Bearer tok_runner1')
      .send({ isOnline: true })

    expect(acceptRes.status).toBe(200)
    expect(acceptRes.body.id).toBe(orderId)
    expect(acceptRes.body.status).toBe('PREPARING')
    expect(acceptRes.body.runner_id).toBe('usr_runner1')

    const acceptedOrderInDb = mockState.orders.find((o) => o.id === orderId)
    expect(acceptedOrderInDb.runner_id).toBe('usr_runner1')
    expect(acceptedOrderInDb.status).toBe('PREPARING')

    // -----------------------------------------------------------------------
    // Step 7: Runner picks up store items and transitions to ON_THE_WAY
    // -----------------------------------------------------------------------
    const pickupRes = await request(app)
      .post('/runner/order/transition')
      .set('Authorization', 'Bearer tok_runner1')
      .send({ orderId, nextStatus: 'PICKED_UP' })

    expect(pickupRes.status).toBe(200)
    expect(pickupRes.body.status).toBe('PICKED_UP')

    const transitRes = await request(app)
      .post('/runner/order/transition')
      .set('Authorization', 'Bearer tok_runner1')
      .send({ orderId, nextStatus: 'ON_THE_WAY' })

    expect(transitRes.status).toBe(200)
    expect(transitRes.body.status).toBe('ON_THE_WAY')
    // Runner does NOT receive plaintext OTP or hash
    expect(transitRes.body.otp).toBeUndefined()
    expect(transitRes.body.handover_otp_hash).toBeUndefined()

    // Database has SHA-256 hash
    const transitOrderInDb = mockState.orders.find((o) => o.id === orderId)
    expect(transitOrderInDb.status).toBe('ON_THE_WAY')
    expect(transitOrderInDb.handover_otp_hash).toBeDefined()
    expect(transitOrderInDb.handover_otp_hash.length).toBe(64)

    // -----------------------------------------------------------------------
    // Step 8: Customer Alice views the 6-digit in-app OTP (No SMS dependency)
    // -----------------------------------------------------------------------
    const otpRes = await request(app)
      .get(`/api/v1/orders/${orderId}/delivery-otp`)
      .set('Authorization', 'Bearer tok_alice')

    expect(otpRes.status).toBe(200)
    expect(otpRes.body.orderId).toBe(orderId)
    expect(otpRes.body.status).toBe('ON_THE_WAY')
    expect(otpRes.body.deliveryChannel).toBe('IN_APP')
    expect(otpRes.body.otp).toMatch(/^\d{6}$/)

    const customerSixDigitOtp = otpRes.body.otp
    // Hash of retrieved in-app OTP strictly matches database stored hash
    const computedOtpHash = crypto.createHash('sha256').update(customerSixDigitOtp).digest('hex')
    expect(transitOrderInDb.handover_otp_hash).toBe(computedOtpHash)

    // -----------------------------------------------------------------------
    // Step 9: Assigned runner submits the 6-digit OTP at delivery
    // -----------------------------------------------------------------------
    const verifyRes = await request(app)
      .post(`/api/v1/runner/orders/${orderId}/verify-handover`)
      .set('Authorization', 'Bearer tok_runner1')
      .send({ otp: customerSixDigitOtp })

    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.orderId).toBe(orderId)
    expect(verifyRes.body.status).toBe('DELIVERED')
    expect(verifyRes.body.handoverVerifiedAt).toBeDefined()

    // -----------------------------------------------------------------------
    // Step 10: State synchronization — Both customer and runner views reflect DELIVERED
    // -----------------------------------------------------------------------
    // Customer order view
    const customerOrderRes = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', 'Bearer tok_alice')

    expect(customerOrderRes.status).toBe(200)
    expect(customerOrderRes.body.status).toBe('DELIVERED')
    expect(customerOrderRes.body.paymentStatus).toBe('PAID')

    // Runner orders view
    const runnerOrdersRes = await request(app)
      .get('/api/v1/runner/orders')
      .set('Authorization', 'Bearer tok_runner1')

    expect(runnerOrdersRes.status).toBe(200)
    const runnerDeliveredOrder = runnerOrdersRes.body.find((o) => o.id === orderId)
    expect(runnerDeliveredOrder).toBeDefined()
    expect(runnerDeliveredOrder.status).toBe('DELIVERED')

    // Ephemeral memory challenge is purged
    expect(activeOtpStore.get(orderId)).toBeNull()
  })

  // =========================================================================
  // 2. Negative & Failure Paths
  // =========================================================================
  describe('Negative & Edge-Case Failure Paths', () => {
    it('negative Make.com response ("not recieved") leaves order in PENDING and never marks paid or assigns runner', async () => {
      mockState.orders.push({
        id: 'ord_unpaid_1',
        customer_id: 'usr_alice',
        runner_id: null,
        status: 'AWAITING_PAYMENT',
        payment_status: 'PENDING',
        total_payable: '115.15',
        payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
        created_at: new Date().toISOString(),
      })

      setMakeVerifier(async () => ({
        success: false,
        status: 'not_received',
        evidence: 'not recieved',
      }))

      const res = await request(app)
        .post('/api/v1/orders/ord_unpaid_1/check-payment')
        .set('Authorization', 'Bearer tok_alice')
        .set('x-skip-delay-for-test', 'true')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('inconclusive')
      expect(res.body.paymentStatus).toBe('PENDING')
      expect(res.body.message).toContain('Payment not received')

      // Runner queue never offers this unpaid order
      const runnerRes = await request(app)
        .get('/api/v1/runner/orders')
        .set('Authorization', 'Bearer tok_runner1')

      expect(runnerRes.body.some((o) => o.id === 'ord_unpaid_1')).toBe(false)
    })

    it('indeterminate response / network error fails safely without marking paid', async () => {
      mockState.orders.push({
        id: 'ord_net_err',
        customer_id: 'usr_alice',
        runner_id: null,
        status: 'AWAITING_PAYMENT',
        payment_status: 'PENDING',
        total_payable: '115.15',
        payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
        created_at: new Date().toISOString(),
      })

      setMakeVerifier(async () => {
        throw new Error('EAI_AGAIN: DNS resolution failure')
      })

      const res = await request(app)
        .post('/api/v1/orders/ord_net_err/check-payment')
        .set('Authorization', 'Bearer tok_alice')
        .set('x-skip-delay-for-test', 'true')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('inconclusive')
      expect(res.body.paymentStatus).toBe('PENDING')
    })

    it('rejects concurrent runner race with 409 ORDER_ALREADY_ASSIGNED', async () => {
      mockState.orders.push({
        id: 'ord_race_test',
        customer_id: 'usr_alice',
        runner_id: null,
        status: 'CONFIRMED',
        payment_status: 'PAID',
        total_payable: '115.15',
        created_at: new Date().toISOString(),
      })

      // Runner 1 accepts first
      const claim1 = await request(app)
        .post('/api/v1/runner/orders/ord_race_test/accept')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ isOnline: true })

      expect(claim1.status).toBe(200)
      expect(claim1.body.runner_id).toBe('usr_runner1')

      // Runner 2 attempts concurrent acceptance
      const claim2 = await request(app)
        .post('/api/v1/runner/orders/ord_race_test/accept')
        .set('Authorization', 'Bearer tok_runner2')
        .send({ isOnline: true })

      expect(claim2.status).toBe(409)
      expect(claim2.body.code).toBe('ORDER_ALREADY_ASSIGNED')
      expect(claim2.body.details?.assignedRunnerId).toBe('usr_runner1')
    })

    it('rejects runner when offline with 400 RUNNER_OFFLINE', async () => {
      mockState.orders.push({
        id: 'ord_offline_test',
        customer_id: 'usr_alice',
        runner_id: null,
        status: 'CONFIRMED',
        payment_status: 'PAID',
        total_payable: '115.15',
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .post('/api/v1/runner/orders/ord_offline_test/accept')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ isOnline: false })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('RUNNER_OFFLINE')
    })

    it('enforces 3-attempt limit and 5-minute lockout on invalid OTP entry', async () => {
      const correctOtp = '839201'
      const correctHash = crypto.createHash('sha256').update(correctOtp).digest('hex')

      mockState.orders.push({
        id: 'ord_lockout_test',
        customer_id: 'usr_alice',
        runner_id: 'usr_runner1',
        status: 'ON_THE_WAY',
        payment_status: 'PAID',
        total_payable: '115.15',
        handover_otp_hash: correctHash,
        handover_attempts_count: 0,
        handover_locked_until: null,
        handover_otp_expires_at: new Date(Date.now() + 300000).toISOString(),
        created_at: new Date().toISOString(),
      })

      // Attempt 1: wrong OTP
      const fail1 = await request(app)
        .post('/api/v1/runner/orders/ord_lockout_test/verify-handover')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ otp: '000000' })
      expect(fail1.status).toBe(400)
      expect(fail1.body.code).toBe('OTP_INVALID')

      // Attempt 2: wrong OTP
      const fail2 = await request(app)
        .post('/api/v1/runner/orders/ord_lockout_test/verify-handover')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ otp: '111111' })
      expect(fail2.status).toBe(400)
      expect(fail2.body.code).toBe('OTP_INVALID')

      // Attempt 3: wrong OTP -> triggers lockout
      const fail3 = await request(app)
        .post('/api/v1/runner/orders/ord_lockout_test/verify-handover')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ otp: '222222' })
      expect(fail3.status).toBe(429)
      expect(fail3.body.code).toBe('OTP_LOCKED')

      // Attempt 4: Even with correct OTP, locked out!
      const fail4 = await request(app)
        .post('/api/v1/runner/orders/ord_lockout_test/verify-handover')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ otp: correctOtp })
      expect(fail4.status).toBe(429)
      expect(fail4.body.code).toBe('OTP_LOCKED')
    })

    it('enforces replay protection: verified OTP cannot be reused to complete order twice', async () => {
      const correctOtp = '654321'
      const correctHash = crypto.createHash('sha256').update(correctOtp).digest('hex')

      mockState.orders.push({
        id: 'ord_replay_test',
        customer_id: 'usr_alice',
        runner_id: 'usr_runner1',
        status: 'ON_THE_WAY',
        payment_status: 'PAID',
        total_payable: '115.15',
        handover_otp_hash: correctHash,
        handover_attempts_count: 0,
        handover_locked_until: null,
        handover_otp_expires_at: new Date(Date.now() + 300000).toISOString(),
        created_at: new Date().toISOString(),
      })

      // Verification 1: Success
      const firstVerify = await request(app)
        .post('/api/v1/runner/orders/ord_replay_test/verify-handover')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ otp: correctOtp })
      expect(firstVerify.status).toBe(200)
      expect(firstVerify.body.status).toBe('DELIVERED')

      // Verification 2: Replay attempt rejected
      const replayVerify = await request(app)
        .post('/api/v1/runner/orders/ord_replay_test/verify-handover')
        .set('Authorization', 'Bearer tok_runner1')
        .send({ otp: correctOtp })
      expect(replayVerify.status).toBe(409)
      expect(replayVerify.body.code).toBe('OTP_ALREADY_USED')
    })

    it('unauthorized user cannot access another user order or restricted endpoints', async () => {
      mockState.orders.push({
        id: 'ord_private',
        customer_id: 'usr_alice',
        runner_id: null,
        status: 'CONFIRMED',
        payment_status: 'PAID',
        total_payable: '115.15',
        created_at: new Date().toISOString(),
      })

      // Intruder Bob cannot read Alice's order
      const getRes = await request(app)
        .get('/api/v1/orders/ord_private')
        .set('Authorization', 'Bearer tok_bob')
      expect(getRes.status).toBe(403)
      expect(getRes.body.code).toBe('FORBIDDEN')

      // Customer Alice cannot access runner queue
      const runnerRes = await request(app)
        .get('/api/v1/runner/orders')
        .set('Authorization', 'Bearer tok_alice')
      expect(runnerRes.status).toBe(403)
      expect(runnerRes.body.code).toBe('FORBIDDEN')

      // Applicant Alex cannot accept runner orders
      const applicantRes = await request(app)
        .post('/api/v1/runner/orders/ord_private/accept')
        .set('Authorization', 'Bearer tok_applicant')
      expect(applicantRes.status).toBe(403)
      expect(applicantRes.body.code).toBe('FORBIDDEN')
    })
  })
})
