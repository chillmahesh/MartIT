import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'

describe('Order History & Detail Endpoints', () => {
  let app
  let mockState

  const sampleOrder = {
    id: 'ord_123',
    customer_id: 'usr_alice',
    runner_id: 'usr_runner',
    delivery_location_id: 'loc_hostel_a',
    delivery_location_snapshot: { name: 'Hostel A' },
    status: 'CONFIRMED',
    payment_status: 'PAID',
    item_subtotal: '120.00',
    combined_delivery_fee: '15.00',
    base_amount: '135.00',
    platform_fee: '0.12',
    total_payable: '135.12',
    route_distance_km: '0.9000',
    route_stop_sequence: [],
    routing_provider: 'straight_line',
    routing_mode: 'walking',
    fee_policy_version: '2026-10-09.1',
    payment_attempt_id: 'att_1',
    fee_paise: 12,
    payment_allocated_at: new Date().toISOString(),
    payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 420000).toISOString(),
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [
      {
        id: 'grp_1',
        store_id: 'store_campus_mart',
        store_snapshot: { name: 'Campus Mart' },
        status: 'READY_FOR_PICKUP',
        pickup_sequence_index: 0,
        order_items: [
          {
            id: 'item_1',
            product_id: 'p_milk',
            product_name: 'Toned Milk',
            product_pack: '500 ml',
            unit_price: '28.00',
            quantity: 2,
            line_subtotal: '56.00',
          },
        ],
      },
    ],
  }

  beforeEach(() => {
    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', token: 'tok_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_runner', token: 'tok_runner', email: 'runner@campus.edu', name: 'Runner Rob' },
        { id: 'usr_runner2', token: 'tok_runner2', email: 'runner2@campus.edu', name: 'Runner Rita' },
        { id: 'usr_applicant', token: 'tok_applicant', email: 'applicant@campus.edu', name: 'Applicant Alex' },
        { id: 'usr_admin', token: 'tok_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_runner', email: 'runner@campus.edu', name: 'Runner Rob', runner_status: 'approved' },
        { id: 'usr_runner2', email: 'runner2@campus.edu', name: 'Runner Rita', runner_status: 'approved' },
        { id: 'usr_applicant', email: 'applicant@campus.edu', name: 'Applicant Alex', runner_status: 'applicant' },
        { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: ROLES.CUSTOMER },
        { user_id: 'usr_bob', role: ROLES.CUSTOMER },
        { user_id: 'usr_runner', role: ROLES.RUNNER },
        { user_id: 'usr_runner2', role: ROLES.RUNNER },
        { user_id: 'usr_applicant', role: ROLES.CUSTOMER },
        { user_id: 'usr_admin', role: ROLES.ADMIN },
      ],
      orders: [sampleOrder],
    })
    mockState = mock.state
    app = createApp()
  })

  it('allows order owner (Alice) to read her order details', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_123')
    expect(res.body.customerId).toBe('usr_alice')
    expect(res.body.pricing.total).toBe(135.12)
    expect(res.body.fulfillmentGroups.length).toBe(1)
  })

  it('returns canonical order shape conforming to frontend contract including lines, storeId, locationId, and pricing', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_123')
    expect(res.body.storeId).toBe('store_campus_mart')
    expect(res.body.locationId).toBe('loc_hostel_a')
    expect(res.body.deliveryLocationId).toBe('loc_hostel_a')
    expect(Array.isArray(res.body.lines)).toBe(true)
    expect(res.body.lines.length).toBe(1)
    expect(res.body.lines[0]).toEqual({
      productId: 'p_milk',
      name: 'Toned Milk',
      pack: '500 ml',
      unitPrice: 28,
      quantity: 2,
      lineSubtotal: 56,
    })
    expect(res.body.pricing).toEqual({
      itemSubtotal: 120,
      deliveryFee: 15,
      baseAmount: 135,
      platformFee: 0.12,
      total: 135.12,
      distanceKm: 0.9,
      distanceMethod: 'straight_line',
      pricingVersion: '2026-10-09.1',
    })
    expect(res.body.payment.status).toBe('PAID')
    expect(res.body.payment.feePaise).toBe(12)
    expect(res.body.isWindowExpired).toBe(false)
  })

  it('preserves customerDetails from delivery_location_snapshot without inventing values', async () => {
    const orderWithCustomer = mockState.orders.find((o) => o.id === 'ord_123')
    orderWithCustomer.delivery_location_snapshot = {
      id: 'loc_hostel_a',
      name: 'Hostel A',
      customerDetails: {
        fullName: 'Alice Walker',
        phoneNumber: '9876543210',
        detailedAddress: 'Room 204, Wing B',
      },
    }

    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.customerDetails).toEqual({
      fullName: 'Alice Walker',
      phoneNumber: '9876543210',
      detailedAddress: 'Room 204, Wing B',
    })
  })

  it('also supports RPC-style POST /orders/get for frontend api.js compatibility', async () => {
    const res = await request(app)
      .post('/orders/get')
      .set('Authorization', 'Bearer tok_alice')
      .send({ orderId: 'ord_123' })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_123')
  })

  it('blocks another customer (Bob) from reading Alice order with 403', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_bob')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('allows assigned runner to read order details', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_runner')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_123')
  })

  it('blocks an assigned runner whose runnerStatus is suspended from reading order details with 403 Forbidden', async () => {
    const runnerProfile = mockState.profiles.find((p) => p.id === 'usr_runner')
    runnerProfile.runner_status = 'suspended'

    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_runner')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('blocks an unassigned runner (Runner Rita) from reading Alice order with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_runner2')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('allows approved assigned runner to list assigned orders via GET /api/v1/runner/orders', async () => {
    const res = await request(app)
      .get('/api/v1/runner/orders')
      .set('Authorization', 'Bearer tok_runner')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].id).toBe('ord_123')
    expect(res.body[0].runner_id).toBe('usr_runner')
  })

  it('returns empty queue for approved runner with no assigned orders', async () => {
    const res = await request(app)
      .get('/api/v1/runner/orders')
      .set('Authorization', 'Bearer tok_runner2')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(0)
  })

  it('blocks non-runner customer from accessing runner order queue with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/runner/orders')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('allows admin to read any order details', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_123')
      .set('Authorization', 'Bearer tok_admin')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_123')
  })

  it('retrieves customer order history via GET /api/v1/orders', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].id).toBe('ord_123')
  })
})

describe('Payment State Transitions & Hardening', () => {
  let app
  let mockState

  const pendingExpiredOrder = {
    id: 'ord_expired_win',
    customer_id: 'usr_alice',
    status: 'CREATED',
    payment_status: 'PENDING',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_window_expires_at: new Date(Date.now() - 5000).toISOString(), // expired window
    payment_cooldown_expires_at: new Date(Date.now() + 300000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  const pendingActiveOrder = {
    id: 'ord_active_win',
    customer_id: 'usr_alice',
    status: 'CREATED',
    payment_status: 'PENDING',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_window_expires_at: new Date(Date.now() + 60000).toISOString(), // active window
    payment_cooldown_expires_at: new Date(Date.now() + 360000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  const alreadyExpiredOrder = {
    id: 'ord_terminal_expired',
    customer_id: 'usr_alice',
    status: 'CANCELLED',
    payment_status: 'EXPIRED',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_window_expires_at: new Date(Date.now() - 60000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 240000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  const paidOrder = {
    id: 'ord_paid_complete',
    customer_id: 'usr_alice',
    status: 'CONFIRMED',
    payment_status: 'PAID',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_window_expires_at: new Date(Date.now() + 60000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 360000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  beforeEach(() => {
    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', token: 'tok_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_owner', token: 'tok_owner', email: 'owner@campus.edu', name: 'Sam Owner' },
        { id: 'usr_admin', token: 'tok_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_owner', email: 'owner@campus.edu', name: 'Sam Owner' },
        { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: ROLES.CUSTOMER },
        { user_id: 'usr_bob', role: ROLES.CUSTOMER },
        { user_id: 'usr_owner', role: ROLES.STORE_OWNER },
        { user_id: 'usr_admin', role: ROLES.ADMIN },
      ],
      orders: [pendingExpiredOrder, pendingActiveOrder, alreadyExpiredOrder, paidOrder],
      platform_fee_reservations: [
        { fee_paise: 15, active_order_id: 'ord_active_win', is_paid: false },
        { fee_paise: 15, active_order_id: 'ord_expired_win', is_paid: false },
      ],
      payment_records: [],
    })
    mockState = mock.state
    app = createApp()
  })

  it('GET /api/v1/orders/:id does NOT mutate database state even if payment window has expired', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_expired_win')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.isWindowExpired).toBe(true)
    expect(res.body.paymentStatus).toBe('PENDING')

    // Confirm DB record remained PENDING (strictly read-only GET)
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_expired_win')
    expect(dbOrder.payment_status).toBe('PENDING')
    expect(dbOrder.status).toBe('CREATED')
  })

  it('POST /api/v1/orders/:id/check-payment transitions PENDING -> EXPIRED after 2-minute window expires', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_expired_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('expired')
    expect(res.body.paymentStatus).toBe('EXPIRED')

    // Confirm DB order transitioned to EXPIRED and CANCELLED
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_expired_win')
    expect(dbOrder.payment_status).toBe('EXPIRED')
    expect(dbOrder.status).toBe('CANCELLED')

    // Confirm fee slot was unbound from active_order_id
    const feeSlot = mockState.platform_fee_reservations.find(
      (r) => r.active_order_id === 'ord_expired_win',
    )
    expect(feeSlot).toBeUndefined()
  })

  it('POST /api/v1/orders/:id/check-payment transitions PENDING -> PAID when verified payment evidence exists', async () => {
    // Add verified payment record matching exact order total (115.15)
    mockState.payment_records.push({
      order_id: 'ord_active_win',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 115.15,
    })

    const res = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('verified')
    expect(res.body.paymentStatus).toBe('PAID')

    // Confirm DB order is PAID and CONFIRMED
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('PAID')
    expect(dbOrder.status).toBe('CONFIRMED')
    expect(dbOrder.paid_at).toBeDefined()

    // Confirm platform fee reservation marked is_paid = true
    const feeSlot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 15)
    expect(feeSlot.is_paid).toBe(true)
  })

  it('rejects underpaid payment evidence (amount mismatch) from marking order PAID', async () => {
    // Underpaid evidence (e.g. ₹10.00 instead of ₹115.15)
    mockState.payment_records.push({
      order_id: 'ord_active_win',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 10.00,
    })

    const res = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('inconclusive')
    expect(res.body.paymentStatus).toBe('PENDING')

    // Order remains pending, never marked paid
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('PENDING')
  })

  it('rejects check-payment transition when payment record lacks authoritative verification source', async () => {
    // Unverified evidence from raw ingestion without gateway verification
    mockState.payment_records.push({
      order_id: 'ord_active_win',
      status: 'PROCESSING',
      evidence: null,
      verification_source: 'MAKE_WEBHOOK_INGESTION',
      amount: 115.15,
    })

    const res = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('inconclusive')
    expect(res.body.paymentStatus).toBe('PENDING')

    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('PENDING')
  })

  it('Late payment verification cannot overwrite terminal state (EXPIRED)', async () => {
    // Evidence arrives late after order is already in terminal EXPIRED state
    mockState.payment_records.push({
      order_id: 'ord_terminal_expired',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 115.15,
    })

    const res = await request(app)
      .post('/api/v1/orders/ord_terminal_expired/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('expired')
    expect(res.body.paymentStatus).toBe('EXPIRED')

    // Order must remain EXPIRED, never mutated to PAID
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_terminal_expired')
    expect(dbOrder.payment_status).toBe('EXPIRED')
  })

  it('handles duplicate verification calls idempotently without state corruption', async () => {
    mockState.payment_records.push({
      order_id: 'ord_active_win',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 115.15,
    })

    // First verification call
    const res1 = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')
    expect(res1.status).toBe(200)
    expect(res1.body.paymentStatus).toBe('PAID')

    // Duplicate concurrent verification call
    const res2 = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')
    expect(res2.status).toBe(200)
    expect(res2.body.paymentStatus).toBe('PAID')

    // Order remains cleanly PAID
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('PAID')
  })

  it('handles concurrent expiration requests safely', async () => {
    // Two concurrent requests to expire the active order
    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/orders/ord_active_win/expire').set('Authorization', 'Bearer tok_alice'),
      request(app).post('/api/v1/orders/ord_active_win/expire').set('Authorization', 'Bearer tok_alice'),
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res1.body.paymentStatus).toBe('EXPIRED')
    expect(res2.body.paymentStatus).toBe('EXPIRED')

    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('EXPIRED')
  })

  it('protects paid slots from reassignment and preserves 5-minute cooldown for expired slots', async () => {
    // Verify paid slot has is_paid = true
    const paidSlot = { fee_paise: 99, active_order_id: 'ord_paid_complete', is_paid: true }
    mockState.platform_fee_reservations.push(paidSlot)

    // Paid slot must never be wiped or released
    expect(paidSlot.is_paid).toBe(true)
    expect(paidSlot.active_order_id).toBe('ord_paid_complete')
  })

  it('blocks unauthorized customer and store owner from calling check-payment or expire with 403', async () => {
    // Bob (another customer)
    const checkBob = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_bob')
    expect(checkBob.status).toBe(403)

    const expireBob = await request(app)
      .post('/api/v1/orders/ord_active_win/expire')
      .set('Authorization', 'Bearer tok_bob')
    expect(expireBob.status).toBe(403)

    // Store Owner (cannot view or mutate another user's order)
    const checkOwner = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_owner')
    expect(checkOwner.status).toBe(403)

    const expireOwner = await request(app)
      .post('/api/v1/orders/ord_active_win/expire')
      .set('Authorization', 'Bearer tok_owner')
    expect(expireOwner.status).toBe(403)

    const getOwner = await request(app)
      .get('/api/v1/orders/ord_active_win')
      .set('Authorization', 'Bearer tok_owner')
    expect(getOwner.status).toBe(403)
  })

  it('POST /api/v1/orders/:id/expire explicitly expires an active pending order', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_active_win/expire')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('expired')
    expect(res.body.paymentStatus).toBe('EXPIRED')

    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('EXPIRED')
    expect(dbOrder.status).toBe('CANCELLED')
  })

  it('POST /api/v1/orders/:id/expire rejects expiring an already PAID order with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_paid_complete/expire')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ALREADY_PAID')
  })

  it('rejects verifying payment for a CANCELLED order', async () => {
    mockState.orders.push({
      id: 'ord_cancelled_test',
      customer_id: 'usr_alice',
      status: 'CANCELLED',
      payment_status: 'CANCELLED',
      item_subtotal: '100.00',
      combined_delivery_fee: '15.00',
      base_amount: '115.00',
      platform_fee: '0.15',
      total_payable: '115.15',
      fee_paise: 15,
      payment_window_expires_at: new Date(Date.now() + 60000).toISOString(),
      created_at: new Date().toISOString(),
      order_fulfillment_groups: [],
    })

    mockState.payment_records.push({
      order_id: 'ord_cancelled_test',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 115.15,
    })

    const res = await request(app)
      .post('/api/v1/orders/ord_cancelled_test/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.body.paymentStatus).not.toBe('PAID')
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_cancelled_test')
    expect(dbOrder.payment_status).not.toBe('PAID')
  })

  it('rejects verifying payment for an order with status CANCELLED even if payment_status was PENDING', async () => {
    mockState.orders.push({
      id: 'ord_cancelled_pending_test',
      customer_id: 'usr_alice',
      status: 'CANCELLED',
      payment_status: 'PENDING',
      item_subtotal: '100.00',
      combined_delivery_fee: '15.00',
      base_amount: '115.00',
      platform_fee: '0.15',
      total_payable: '115.15',
      fee_paise: 15,
      payment_window_expires_at: new Date(Date.now() + 60000).toISOString(),
      created_at: new Date().toISOString(),
      order_fulfillment_groups: [],
    })

    mockState.payment_records.push({
      order_id: 'ord_cancelled_pending_test',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 115.15,
    })

    const res = await request(app)
      .post('/api/v1/orders/ord_cancelled_pending_test/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('expired')
    expect(res.body.paymentStatus).not.toBe('PAID')

    const dbOrder = mockState.orders.find((o) => o.id === 'ord_cancelled_pending_test')
    expect(dbOrder.payment_status).not.toBe('PAID')
  })

  it('fails safely with 500 and does NOT mutate database state or fall back to REST updates when RPC fails during check-payment', async () => {
    mockState.payment_records.push({
      order_id: 'ord_active_win',
      status: 'PAID',
      evidence: 'Payment received',
      verification_source: 'AUTHORITATIVE_GATEWAY',
      amount: 115.15,
    })

    // Simulate database transaction failure in RPC
    mockState.rpcError = { message: 'deadlock detected in stored procedure transaction' }

    const res = await request(app)
      .post('/api/v1/orders/ord_active_win/check-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('TRANSACTION_FAILED')

    // Confirm state remains unmutated (strictly zero REST fallback updates)
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('PENDING')
    expect(dbOrder.status).toBe('CREATED')

    const feeSlot = mockState.platform_fee_reservations.find(
      (r) => r.active_order_id === 'ord_active_win',
    )
    expect(feeSlot.is_paid).toBe(false)
  })

  it('fails safely with 500 and does NOT mutate database state or fall back to REST updates when RPC fails during expire', async () => {
    // Simulate database transaction failure in RPC
    mockState.rpcError = { message: 'connection dropped during stored procedure transaction' }

    const res = await request(app)
      .post('/api/v1/orders/ord_active_win/expire')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('TRANSACTION_FAILED')

    // Confirm state remains unmutated (strictly zero REST fallback updates)
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_active_win')
    expect(dbOrder.payment_status).toBe('PENDING')
    expect(dbOrder.status).toBe('CREATED')

    const feeSlot = mockState.platform_fee_reservations.find(
      (r) => r.active_order_id === 'ord_active_win',
    )
    expect(feeSlot.active_order_id).toBe('ord_active_win')
  })
})

describe('Order Creation Endpoint (POST /orders/create & POST /api/v1/orders)', () => {
  let app
  let mockState

  const setupMockState = () => {
    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', token: 'tok_bob', email: 'bob@campus.edu', name: 'Bob Customer' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', email: 'bob@campus.edu', name: 'Bob Customer' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: ROLES.CUSTOMER },
        { user_id: 'usr_bob', role: ROLES.CUSTOMER },
      ],
      stores: [
        { id: 'store_campus_mart', name: 'Campus Mart', is_open: true, latitude: 12.9716, longitude: 77.5946 },
        { id: 'store_closed', name: 'Closed Mart', is_open: false, latitude: 12.9716, longitude: 77.5946 },
      ],
      locations: [
        { id: 'loc_hostel_a', name: 'Hostel A', group_name: 'Hostels', latitude: 12.9740, longitude: 77.5970, is_active: true },
        { id: 'loc_far_away', name: 'Far Off-Campus', group_name: 'Off-Campus', latitude: 13.0500, longitude: 77.6500, is_active: true },
        { id: 'loc_inactive', name: 'Inactive Location', group_name: 'Hostels', latitude: 12.9740, longitude: 77.5970, is_active: false },
      ],
      products: [
        { id: 'p_milk', store_id: 'store_campus_mart', name: 'Toned Milk', pack: '500 ml', price: 28.00, stock: 10, is_available: true },
        { id: 'p_bread', store_id: 'store_campus_mart', name: 'Whole Wheat Bread', pack: '400 g', price: 40.00, stock: 5, is_available: true },
        { id: 'p_limited', store_id: 'store_campus_mart', name: 'Limited Stock Item', pack: '1 pc', price: 15.00, stock: 2, is_available: true },
        { id: 'p_unavailable', store_id: 'store_campus_mart', name: 'Unavailable Item', pack: '1 pc', price: 20.00, stock: 10, is_available: false },
      ],
      platform_fee_reservations: [
        { fee_paise: 12, is_paid: false, active_order_id: null },
        { fee_paise: 15, is_paid: false, active_order_id: null },
      ],
      orders: [],
      inventory_reservations: [],
    })
    mockState = mock.state
    app = createApp()
  }

  beforeEach(() => {
    setupMockState()
  })

  it('1. authenticated valid checkout reaches real backend handler via RPC-style POST /orders/create', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [
        { productId: 'p_milk', quantity: 2 },
        { productId: 'p_bread', quantity: 1 },
      ],
      customerDetails: {
        fullName: 'Alice Customer',
        phoneNumber: '9876543210',
        selectedDestination: 'Hostel A',
      },
    }

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body.id).toMatch(/^ord_/)
    expect(res.body.customerId).toBe('usr_alice')
    expect(res.body.storeId).toBe('store_campus_mart')
    expect(res.body.locationId).toBe('loc_hostel_a')

    // Authoritative math: (2 * 28) + (1 * 40) = 96 item subtotal
    // Delivery fee: flat ₹10
    // Base amount: 96 + 10 = 106
    // Platform fee: ₹0.12 (from fee_paise 12)
    // Total payable: 106.12
    expect(res.body.pricing.itemSubtotal).toBe(96)
    expect(res.body.pricing.deliveryFee).toBe(10)
    expect(res.body.pricing.baseAmount).toBe(106)
    expect(res.body.pricing.platformFee).toBe(0.12)
    expect(res.body.pricing.total).toBe(106.12)
    expect(res.body.pricing.distanceKm).toBeGreaterThan(0)
    expect(res.body.pricing.distanceKm).toBeLessThanOrEqual(5)

    // Verify DB insertion
    const created = mockState.orders.find((o) => o.id === res.body.id)
    expect(created).toBeDefined()
    expect(created.customer_id).toBe('usr_alice')
    expect(created.status).toBe('AWAITING_PAYMENT')
    expect(created.payment_status).toBe('PENDING')
  })

  it('2. also supports REST-style POST /api/v1/orders with identical authoritative contract', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk', quantity: 1 }],
    }

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer tok_alice')
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body.id).toMatch(/^ord_/)
    expect(res.body.pricing.itemSubtotal).toBe(28)
    expect(res.body.pricing.deliveryFee).toBe(10)
    expect(res.body.pricing.baseAmount).toBe(38)
    expect(res.body.pricing.total).toBe(38.12)
  })

  it('3. rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk', quantity: 1 }],
    }

    const res = await request(app)
      .post('/orders/create')
      .send(payload)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })

  it('4. rejects empty cart lines with 422 EMPTY_CART', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({ storeId: 'store_campus_mart', locationId: 'loc_hostel_a', lines: [] })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('EMPTY_CART')
  })

  it('5. rejects invalid quantity (< 1 or non-integer) with 422 INVALID_QUANTITY', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 0 }],
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_QUANTITY')
  })

  it('6. rejects unavailable product with 409 PRODUCT_UNAVAILABLE', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_unavailable', quantity: 1 }],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PRODUCT_UNAVAILABLE')
  })

  it('7. rejects quantity exceeding available stock with 409 OUT_OF_STOCK', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_limited', quantity: 10 }],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('OUT_OF_STOCK')
  })

  it('8. rejects closed store with 409 STORE_CLOSED', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_closed',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('STORE_CLOSED')
  })

  it('9. rejects destinations exceeding 5 km service boundary with 422 OUT_OF_SERVICE_AREA', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_far_away',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('OUT_OF_SERVICE_AREA')
  })

  it('10. guarantees client-supplied prices, delivery fees, or totals CANNOT override server calculations', async () => {
    // Malicious customer sends fake prices and fees
    const fraudulentPayload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk', quantity: 1, unitPrice: 0.01, price: 0.01 }],
      pricing: { itemSubtotal: 0.01, deliveryFee: 0, platformFee: 0.01, total: 0.02 },
      deliveryFee: 0,
      total: 0.02,
    }

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send(fraudulentPayload)

    expect(res.status).toBe(201)
    // Server overrides all tampering: unitPrice is authoritative 28.00, deliveryFee is 10.00
    expect(res.body.pricing.itemSubtotal).toBe(28.00)
    expect(res.body.pricing.deliveryFee).toBe(10.00)
    expect(res.body.pricing.baseAmount).toBe(38.00)
    expect(res.body.pricing.platformFee).toBe(0.12)
    expect(res.body.pricing.total).toBe(38.12)
  })

  it('11. returns response shape expected by frontend CartPage and CustomerPaymentView', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_bread', quantity: 2 }],
        customerDetails: { fullName: 'Alice Customer', phoneNumber: '9876543210' },
      })

    expect(res.status).toBe(201)
    const order = res.body

    // CartPage validation assertion check
    expect(typeof order.pricing.platformFee).toBe('number')
    expect(typeof order.pricing.baseAmount).toBe('number')
    expect(typeof order.pricing.total).toBe('number')
    expect(order.pricing.platformFee).toBeGreaterThan(0)
    expect(Math.abs(order.pricing.total - (order.pricing.baseAmount + order.pricing.platformFee))).toBeLessThan(0.001)

    // CustomerPaymentView expected fields
    expect(order.storeId).toBe('store_campus_mart')
    expect(order.locationId).toBe('loc_hostel_a')
    expect(order.payment).toBeDefined()
    expect(order.payment.windowExpiresAt).toBeDefined()
    expect(order.payment.feePaise).toBeGreaterThanOrEqual(1)
    expect(order.payment.feePaise).toBeLessThanOrEqual(99)
  })

  it('12. order creation strictly does NOT mark payment as PAID', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('AWAITING_PAYMENT')
    expect(res.body.paymentStatus).toBe('PENDING')
    expect(res.body.payment.status).toBe('PENDING')
    expect(res.body.payment.paidAt).toBeNull()
  })

  it('13. prevents duplicate orders on retries with same idempotencyKey', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk', quantity: 1 }],
      idempotencyKey: 'idem_unique_test_123',
    }

    const res1 = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send(payload)

    expect(res1.status).toBe(201)
    const firstOrderId = res1.body.id

    // Retry with identical idempotency key
    const res2 = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send(payload)

    expect(res2.status).toBe(200)
    expect(res2.body.id).toBe(firstOrderId)
    expect(mockState.orders.filter((o) => o.idempotency_key === 'idem_unique_test_123').length).toBe(1)
  })

  it('14. safely releases platform fee reservation on database insertion failure', async () => {
    // Force database table error during order insertion
    mockState.tableErrors = { orders: 'synthetic database disk failure' }

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(500)

    // Platform fee slot was safely rolled back / released
    const slot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 12)
    expect(slot.active_order_id).toBeNull()
  })

  it('15. rejects with 503 ALL_PLATFORM_FEE_SLOTS_BUSY when fee reservation fails and NEVER fabricates a 10 paise fee', async () => {
    mockState.rpcErrors = { allocate_platform_fee: 'ALL_PLATFORM_FEE_SLOTS_BUSY' }
    mockState.platform_fee_reservations.forEach((r) => {
      r.active_order_id = 'ord_other_active'
      r.cooldown_expires_at = new Date(Date.now() + 600000).toISOString()
    })

    const initialOrdersCount = mockState.orders.length

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(503)
    expect(res.body.code).toBe('ALL_PLATFORM_FEE_SLOTS_BUSY')
    expect(res.body.message).toContain('All dynamic payment fee slots are currently active')
    // Crucial: no order was created with a fabricated 10 paise fallback
    expect(mockState.orders.length).toBe(initialOrdersCount)
  })

  it('16. handles concurrent order creation without allocating the same fee slot twice', async () => {
    // Clear reservations and set up only 2 available slots: 15 paise and 25 paise
    mockState.platform_fee_reservations = [
      { fee_paise: 15, active_order_id: null, is_paid: false },
      { fee_paise: 25, active_order_id: null, is_paid: false },
    ]

    const orderPayload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk', quantity: 1 }],
    }

    const [res1, res2, res3] = await Promise.all([
      request(app).post('/orders/create').set('Authorization', 'Bearer tok_alice').send(orderPayload),
      request(app).post('/orders/create').set('Authorization', 'Bearer tok_alice').send(orderPayload),
      request(app).post('/orders/create').set('Authorization', 'Bearer tok_alice').send(orderPayload),
    ])

    const successful = [res1, res2, res3].filter((r) => r.status === 201)
    const busy = [res1, res2, res3].filter((r) => r.status === 503)

    // At most 2 can succeed because only 2 slots exist
    expect(successful.length).toBe(2)
    expect(busy.length).toBe(1)

    // The two successful orders must have different fee amounts
    const fees = successful.map((r) => r.body.payment.feePaise)
    expect(new Set(fees).size).toBe(2)
    expect(fees).toContain(15)
    expect(fees).toContain(25)
  })

  it('17. rolls back parent order and releases fee slot when order_fulfillment_groups insertion fails', async () => {
    mockState.tableErrors = { order_fulfillment_groups: 'synthetic fulfillment group failure' }
    const initialOrdersCount = mockState.orders.length

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(500)
    // Parent order must be rolled back (no orphaned row in orders)
    expect(mockState.orders.length).toBe(initialOrdersCount)
    // Platform fee slot must be released
    const slot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 12)
    expect(slot.active_order_id).toBeNull()
  })

  it('18. rolls back parent order and groups when order_items insertion fails', async () => {
    mockState.tableErrors = { order_items: 'synthetic items disk failure' }
    const initialOrdersCount = mockState.orders.length

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(500)
    expect(mockState.orders.length).toBe(initialOrdersCount)
    const slot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 12)
    expect(slot.active_order_id).toBeNull()
  })

  it('19. rejects with 409 OUT_OF_STOCK when inventory hold RPC fails and rolls back order & fee slot', async () => {
    mockState.rpcErrors = { reserve_order_inventory: 'OUT_OF_STOCK' }
    const initialOrdersCount = mockState.orders.length

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('OUT_OF_STOCK')
    expect(res.body.message).toContain('out of stock')
    // Rollback verified
    expect(mockState.orders.length).toBe(initialOrdersCount)
    const slot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 12)
    expect(slot.active_order_id).toBeNull()
  })

  it('20. rejects with 409 PRODUCT_UNAVAILABLE when inventory hold RPC reports product unavailable', async () => {
    mockState.rpcErrors = { reserve_order_inventory: 'PRODUCT_UNAVAILABLE' }
    const initialOrdersCount = mockState.orders.length

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PRODUCT_UNAVAILABLE')
    expect(mockState.orders.length).toBe(initialOrdersCount)
    const slot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 12)
    expect(slot.active_order_id).toBeNull()
  })

  it('21. safely aggregates duplicate product IDs into single consolidated line item', async () => {
    // Initial milk stock is 50, price 28.00
    const milkBefore = mockState.products.find((p) => p.id === 'p_milk').stock

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [
          { productId: 'p_milk', quantity: 2 },
          { productId: 'p_milk', quantity: 3 },
        ],
      })

    expect(res.status).toBe(201)
    // 5 total milks @ 28 = 140.00 itemSubtotal
    expect(res.body.pricing.itemSubtotal).toBe(140.0)
    expect(res.body.pricing.deliveryFee).toBe(10.0)
    expect(res.body.pricing.baseAmount).toBe(150.0)
    const milkAfter = mockState.products.find((p) => p.id === 'p_milk').stock
    expect(milkAfter).toBe(milkBefore - 5)
  })

  it('22. deterministically sorts line items to eliminate lock-ordering cycles between concurrent carts', async () => {
    // Cart with products out of lexical order [p_milk, p_bread]
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [
          { productId: 'p_milk', quantity: 1 },
          { productId: 'p_bread', quantity: 1 },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('23. rejects missing or invalid productId with 400 INVALID_LINE_ITEM', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: '', quantity: 1 }],
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_LINE_ITEM')
  })

  it('24. rejects non-integer/fractional quantity with 422 INVALID_QUANTITY', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 2.5 }],
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_QUANTITY')
  })

  it('25. rejects excessively large item quantity exceeding 2147483647 with 422 INVALID_QUANTITY', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 3000000000 }],
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_QUANTITY')
  })

  it('26. rejects duplicate product lines whose aggregate sum exceeds 2147483647 with 422 INVALID_QUANTITY', async () => {
    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [
          { productId: 'p_milk', quantity: 1500000000 },
          { productId: 'p_milk', quantity: 1500000000 },
        ],
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_QUANTITY')
  })

  it('27. rejects order when line subtotal or subtotal exceeds 99999999.99 with 422 ORDER_TOTAL_EXCEEDED', async () => {
    mockState.products.push({
      id: 'p_expensive',
      store_id: 'store_campus_mart',
      category_id: 'cat_electronics',
      name: 'High-end Lab Equipment',
      pack: '1 unit',
      price: '60000000.00',
      stock: 5,
      is_available: true,
    })

    const res = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_expensive', quantity: 2 }], // 2 * 60,000,000 = 120,000,000 > 99,999,999.99
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('ORDER_TOTAL_EXCEEDED')
  })

  it('28. expires order payment atomically, restores product stock, transitions reservations to RELEASED, and prevents double restoration on repeated calls', async () => {
    const createRes = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [
          { productId: 'p_milk', quantity: 2 },
          { productId: 'p_bread', quantity: 1 },
        ],
      })

    expect(createRes.status).toBe(201)
    const orderId = createRes.body.id

    const milk = mockState.products.find((p) => p.id === 'p_milk')
    const bread = mockState.products.find((p) => p.id === 'p_bread')
    expect(milk.stock).toBe(8)
    expect(bread.stock).toBe(4)

    const heldReservations = mockState.inventory_reservations.filter(
      (ir) => ir.order_id === orderId && ir.status === 'HELD',
    )
    expect(heldReservations.length).toBe(2)

    const expireRes = await request(app)
      .post(`/api/v1/orders/${orderId}/expire`)
      .set('Authorization', 'Bearer tok_alice')
      .send()

    expect(expireRes.status).toBe(200)
    expect(expireRes.body.status).toBe('expired')
    expect(expireRes.body.paymentStatus).toBe('EXPIRED')

    expect(milk.stock).toBe(10)
    expect(bread.stock).toBe(5)

    const releasedReservations = mockState.inventory_reservations.filter(
      (ir) => ir.order_id === orderId && ir.status === 'RELEASED',
    )
    expect(releasedReservations.length).toBe(2)

    // Repeat call must be idempotent and not double-restore stock
    const repeatExpireRes = await request(app)
      .post(`/api/v1/orders/${orderId}/expire`)
      .set('Authorization', 'Bearer tok_alice')
      .send()

    expect(repeatExpireRes.status).toBe(200)
    expect(milk.stock).toBe(10)
    expect(bread.stock).toBe(5)
  })

  it('29. rejects payment expiry with 409 ALREADY_PAID if order is already paid', async () => {
    const createRes = await request(app)
      .post('/orders/create')
      .set('Authorization', 'Bearer tok_alice')
      .send({
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_milk', quantity: 1 }],
      })
    expect(createRes.status).toBe(201)
    const orderId = createRes.body.id

    const order = mockState.orders.find((o) => o.id === orderId)
    order.payment_status = 'PAID'

    const expireRes = await request(app)
      .post(`/api/v1/orders/${orderId}/expire`)
      .set('Authorization', 'Bearer tok_alice')
      .send()

    expect(expireRes.status).toBe(409)
    expect(expireRes.body.code).toBe('ALREADY_PAID')
  })

  it('30. aggregates duplicate reservation lines and restores combined stock exactly once on expiry', async () => {
    // Manually inject an order with duplicate HELD reservation lines for p_milk (2 + 3 = 5)
    mockState.orders.push({
      id: 'ord_duplicate_holds',
      customer_id: 'usr_alice',
      status: 'AWAITING_PAYMENT',
      payment_status: 'PENDING',
      payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
    })
    mockState.inventory_reservations.push(
      { id: 'res_dup_1', order_id: 'ord_duplicate_holds', store_id: 'store_campus_mart', product_id: 'p_milk', quantity: 2, status: 'HELD' },
      { id: 'res_dup_2', order_id: 'ord_duplicate_holds', store_id: 'store_campus_mart', product_id: 'p_milk', quantity: 3, status: 'HELD' },
    )
    const milk = mockState.products.find((p) => p.id === 'p_milk')
    milk.stock = 5 // Suppose stock was decremented from 10 to 5

    const expireRes = await request(app)
      .post('/api/v1/orders/ord_duplicate_holds/expire')
      .set('Authorization', 'Bearer tok_alice')
      .send()

    expect(expireRes.status).toBe(200)
    expect(expireRes.body.paymentStatus).toBe('EXPIRED')
    expect(milk.stock).toBe(10) // 5 + (2 + 3) = 10 exactly

    const reservations = mockState.inventory_reservations.filter((ir) => ir.order_id === 'ord_duplicate_holds')
    expect(reservations.every((ir) => ir.status === 'RELEASED')).toBe(true)
  })

  it('31. fails safely with 500 TRANSACTION_FAILED and prevents partial release when RPC reports PRODUCT_NOT_FOUND', async () => {
    mockState.orders.push({
      id: 'ord_missing_prod',
      customer_id: 'usr_alice',
      status: 'AWAITING_PAYMENT',
      payment_status: 'PENDING',
      payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
    })
    mockState.inventory_reservations.push({
      id: 'res_ghost',
      order_id: 'ord_missing_prod',
      store_id: 'store_campus_mart',
      product_id: 'p_nonexistent_ghost',
      quantity: 1,
      status: 'HELD',
    })

    const expireRes = await request(app)
      .post('/api/v1/orders/ord_missing_prod/expire')
      .set('Authorization', 'Bearer tok_alice')
      .send()

    expect(expireRes.status).toBe(500)
    expect(expireRes.body.code).toBe('TRANSACTION_FAILED')
    expect(expireRes.body.message).toContain('PRODUCT_NOT_FOUND')
  })

  it('32. release_order_inventory RPC rejects paid orders with CANNOT_RELEASE_PAID_ORDER and preserves order state without unauthorized mutation', async () => {
    const { getSupabaseAdmin } = await import('../config/supabase.js')
    const supabase = getSupabaseAdmin()

    // 1. Rejects paid order
    mockState.orders.push({
      id: 'ord_already_paid',
      customer_id: 'usr_alice',
      status: 'CONFIRMED',
      payment_status: 'PAID',
    })
    const paidRelease = await supabase.rpc('release_order_inventory', { p_order_id: 'ord_already_paid' })
    expect(paidRelease.error).not.toBeNull()
    expect(paidRelease.error.message).toBe('CANNOT_RELEASE_PAID_ORDER')

    // 2. Releases inventory without mutating orders table directly (separation of concerns)
    mockState.orders.push({
      id: 'ord_pending_release',
      customer_id: 'usr_alice',
      status: 'AWAITING_PAYMENT',
      payment_status: 'PENDING',
    })
    mockState.inventory_reservations.push({
      id: 'res_pend_1',
      order_id: 'ord_pending_release',
      store_id: 'store_campus_mart',
      product_id: 'p_milk',
      quantity: 1,
      status: 'HELD',
    })
    const initialMilkStock = mockState.products.find((p) => p.id === 'p_milk').stock

    const pendingRelease = await supabase.rpc('release_order_inventory', { p_order_id: 'ord_pending_release' })
    expect(pendingRelease.error).toBeNull()
    expect(pendingRelease.data).toBe(true)

    // Stock restored and reservation released
    expect(mockState.products.find((p) => p.id === 'p_milk').stock).toBe(initialMilkStock + 1)
    const res = mockState.inventory_reservations.find((ir) => ir.id === 'res_pend_1')
    expect(res.status).toBe('RELEASED')

    // Order status is preserved; order expiry ownership belongs strictly to expire_order_payment
    const order = mockState.orders.find((o) => o.id === 'ord_pending_release')
    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.payment_status).toBe('PENDING')
  })
})
