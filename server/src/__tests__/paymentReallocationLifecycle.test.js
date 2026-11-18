import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { ROLES } from '../utils/permissions.js'
import { setMakeVerifier, inFlightPaymentChecks, inFlightPaymentReallocations, recentReallocations } from '../routes/orders.js'
import { buildUpiPayload } from '../../../src/utils/upi.js'
import { env } from '../config/env.js'

describe('MartIT Dynamic UPI Payment Reallocation & Timeout Lifecycle (Milestone 15)', () => {
  let app
  let mockState

  const now = Date.now()

  // Base test order: itemSubtotal=100, combinedDeliveryFee=20, baseAmount=120, platformFee=0.37 (37 paise), total=120.37
  const baseOrder = {
    id: 'ord_realloc_test',
    customer_id: 'usr_alice',
    runner_id: null,
    delivery_location_id: 'loc_hostel_a',
    delivery_location_snapshot: { id: 'loc_hostel_a', name: 'Hostel A', group_name: 'Campus' },
    status: 'AWAITING_PAYMENT',
    payment_status: 'PENDING',
    item_subtotal: '100.00',
    combined_delivery_fee: '20.00',
    base_amount: '120.00',
    platform_fee: '0.37',
    total_payable: '120.37',
    route_distance_km: '1.2000',
    route_stop_sequence: [],
    routing_provider: 'straight_line',
    routing_mode: 'walking',
    fee_policy_version: '2026-11-17.1',
    payment_attempt_id: 'att_orig_37',
    fee_paise: 37,
    payment_allocated_at: new Date(now - 310000).toISOString(), // 5m 10s ago
    payment_window_expires_at: new Date(now - 10000).toISOString(), // expired 10s ago
    payment_cooldown_expires_at: new Date(now + 290000).toISOString(),
    paid_at: null,
    created_at: new Date(now - 310000).toISOString(),
    order_fulfillment_groups: [
      {
        id: 'grp_1',
        store_id: 'store_campus_mart',
        store_snapshot: { id: 'store_campus_mart', name: 'Campus Mart' },
        status: 'PENDING',
        pickup_sequence_index: 0,
        order_items: [
          {
            id: 'item_1',
            product_id: 'p_milk',
            product_name: 'Toned Milk',
            product_pack: '500 ml',
            unit_price: '50.00',
            quantity: 2,
            line_subtotal: '100.00',
          },
        ],
      },
    ],
  }

  // Pre-seed 99 dynamic platform fee reservation slots
  const seedSlots = Array.from({ length: 99 }, (_, i) => {
    const paise = i + 1
    if (paise === 37) {
      return {
        fee_paise: 37,
        active_order_id: 'ord_realloc_test',
        attempt_id: 'att_orig_37',
        allocated_at: new Date(now - 310000).toISOString(),
        window_expires_at: new Date(now - 10000).toISOString(),
        cooldown_expires_at: new Date(now + 290000).toISOString(),
        is_paid: false,
        paid_at: null,
      }
    }
    return {
      fee_paise: paise,
      active_order_id: null,
      attempt_id: null,
      allocated_at: null,
      window_expires_at: null,
      cooldown_expires_at: null,
      is_paid: false,
      paid_at: null,
    }
  })

  beforeEach(() => {
    inFlightPaymentChecks.clear()
    inFlightPaymentReallocations.clear()
    recentReallocations.clear()
    setMakeVerifier(null)

    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', token: 'tok_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_admin', token: 'tok_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
        { id: 'usr_bob', email: 'bob@campus.edu', name: 'Bob Intruder' },
        { id: 'usr_admin', email: 'admin@campus.edu', name: 'Admin Adam' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: ROLES.CUSTOMER },
        { user_id: 'usr_bob', role: ROLES.CUSTOMER },
        { user_id: 'usr_admin', role: ROLES.ADMIN },
      ],
      orders: [structuredClone(baseOrder)],
      platformFeeReservations: structuredClone(seedSlots),
    })

    mockState = mock.state
    app = createApp()
  })

  afterEach(() => {
    inFlightPaymentChecks.clear()
    inFlightPaymentReallocations.clear()
    recentReallocations.clear()
    setMakeVerifier(null)
  })

  // 1. Initial allocation uses the correct base total and a valid suffix
  it('1. verifies that the initial order has authoritative base total and a valid platform-fee suffix', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_realloc_test')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.pricing.baseAmount).toBe(120)
    expect(res.body.pricing.itemSubtotal).toBe(100)
    expect(res.body.pricing.deliveryFee).toBe(20)
    expect(res.body.pricing.platformFee).toBe(0.37)
    expect(res.body.pricing.total).toBe(120.37)
    expect(res.body.payment.feePaise).toBe(37)
    expect(res.body.payment.feePaise).toBeGreaterThanOrEqual(1)
    expect(res.body.payment.feePaise).toBeLessThanOrEqual(99)
  })

  // 2. A successful verification confirms payment and prevents reallocation
  it('2. prevents reallocation when payment has been successfully confirmed', async () => {
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_realloc_test')
    dbOrder.payment_status = 'PAID'
    dbOrder.status = 'CONFIRMED'

    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ALREADY_PAID')
  })

  // 3. An expired allocation becomes eligible for reallocation under the existing safety policy
  it('3. allows reallocation once the payment allocation window has passed', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_realloc_test')
    expect(res.body.status).toBe('AWAITING_PAYMENT')
    expect(res.body.paymentStatus).toBe('PENDING')
    expect(res.body.payment.status).toBe('PENDING')
  })

  // 4. Reallocation assigns a different available suffix when previous suffix is unavailable/in cooldown
  it('4. assigns a different available suffix because the previous suffix is held in cooldown', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    // Suffix 37 was in cooldown, so next available slot 1 (or another free slot) is assigned
    expect(res.body.payment.feePaise).not.toBe(37)
    expect(res.body.payment.feePaise).toBe(1)
    expect(res.body.pricing.platformFee).toBe(0.01)

    // Verify slot 37 is unbound from active order but has cooldown set
    const oldSlot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 37)
    expect(oldSlot.active_order_id).toBeNull()
    expect(oldSlot.cooldown_expires_at).toBeDefined()
  })

  // 5. The final amount equals the authoritative base total plus the new suffix
  it('5. ensures replacement payment total equals base amount plus the new assigned suffix', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    const newPaise = res.body.payment.feePaise
    const expectedFee = Number((newPaise / 100).toFixed(2))
    const expectedTotal = Number((120 + expectedFee).toFixed(2))

    expect(res.body.pricing.baseAmount).toBe(120)
    expect(res.body.pricing.platformFee).toBe(expectedFee)
    expect(res.body.pricing.total).toBe(expectedTotal)
    expect(res.body.total_payable).toBe(expectedTotal)
  })

  // 6. The new UPI URI and QR use the exact replacement amount
  it('6. generates valid UPI URI and QR code parameters matching the exact replacement total', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    const payableAmount = res.body.pricing.total

    const payload = buildUpiPayload({
      payeeVpa: 'martit@okhdfcbank',
      payeeName: 'MartIT Campus Store',
      amount: payableAmount,
      orderId: res.body.id,
      note: `MartIT Order ${res.body.id}`,
    })

    expect(payload.ok).toBe(true)
    expect(payload.uri).toContain(`am=${payableAmount.toFixed(2)}`)
    expect(payload.uri).toContain(`tr=${res.body.id}`)
    expect(payload.uri).toContain('cu=INR')
  })

  // 7. The new allocation receives a fresh five-minute timeout
  it('7. assigns a fresh 5-minute timeout window (300 seconds) to the reallocated attempt', async () => {
    const beforeCall = Date.now()

    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    const windowExpiry = new Date(res.body.payment.windowExpiresAt).getTime()
    const allocatedTime = new Date(res.body.payment.allocatedAt).getTime()

    const durationSeconds = Math.round((windowExpiry - allocatedTime) / 1000)
    expect(durationSeconds).toBe(300) // Exactly 5 minutes (300 seconds)
    expect(windowExpiry).toBeGreaterThan(beforeCall + 295000)
  })

  // 8. The old allocation is no longer treated as the active allocation
  it('8. replaces payment_attempt_id so old attempt is no longer treated as the active allocation', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.payment.attemptId).not.toBe('att_orig_37')
    expect(res.body.payment.attemptId).toMatch(/^att_/)

    const dbOrder = mockState.orders.find((o) => o.id === 'ord_realloc_test')
    expect(dbOrder.payment_attempt_id).toBe(res.body.payment.attemptId)
  })

  // 9. Double-clicks and concurrent reallocation requests cannot create duplicate active allocations
  it('9. handles rapid double-clicks idempotently without burning multiple fee suffixes', async () => {
    // First reallocation
    const res1 = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res1.status).toBe(200)
    const firstAttemptId = res1.body.payment.attemptId
    const firstFeePaise = res1.body.payment.feePaise

    // Rapid second click (within seconds of reallocation)
    const res2 = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res2.status).toBe(200)
    // Suffix and attempt ID are preserved rather than burning another slot
    expect(res2.body.payment.attemptId).toBe(firstAttemptId)
    expect(res2.body.payment.feePaise).toBe(firstFeePaise)
  })

  // 10. A late payment or unresolved verification cannot incorrectly credit a different order
  it('10. rejects late payment webhook matching the old attempt and old suffix', async () => {
    // Reallocate order to slot 1 (total 120.01)
    await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    const validSecret = env.MAKE_WEBHOOK_SECRET || 'test-make-webhook-secret-min-16-chars'

    // Case A: Notification arrives with old attempt ID -> rejects with PAYMENT_ATTEMPT_MISMATCH
    const webhookAttemptRes = await request(app)
      .post('/api/v1/webhooks/make-payment')
      .set('x-make-secret', validSecret)
      .send({
        orderId: 'ord_realloc_test',
        amount: 120.37,
        attemptId: 'att_orig_37',
        status: 'SUCCESS',
        evidence: 'Payment received',
      })

    expect(webhookAttemptRes.status).toBe(400)
    expect(webhookAttemptRes.body.code).toBe('PAYMENT_ATTEMPT_MISMATCH')

    // Case B: Notification arrives with old amount (no attemptId) -> rejects with PAYMENT_AMOUNT_MISMATCH
    const webhookAmountRes = await request(app)
      .post('/api/v1/webhooks/make-payment')
      .set('x-make-secret', validSecret)
      .send({
        orderId: 'ord_realloc_test',
        amount: 120.37,
        status: 'SUCCESS',
        evidence: 'Payment received',
      })

    expect(webhookAmountRes.status).toBe(400)
    expect(webhookAmountRes.body.code).toBe('PAYMENT_AMOUNT_MISMATCH')

    // Order remains in AWAITING_PAYMENT / PENDING
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_realloc_test')
    expect(dbOrder.payment_status).toBe('PENDING')
    expect(dbOrder.status).toBe('AWAITING_PAYMENT')
  })

  // 11. Customer ownership and order-state authorization are enforced
  it('11. blocks unauthorized customers (403) and unauthenticated callers (401)', async () => {
    // Unauthenticated
    const unauth = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')

    expect(unauth.status).toBe(401)

    // Bob trying to reallocate Alice's order
    const bob = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_bob')

    expect(bob.status).toBe(403)
  })

  // 12. Reallocation does not change item subtotals, delivery fees, additional-store surcharges or fulfillment data
  it('12. preserves all non-payment order attributes, line items, and fulfillment groups exactly', async () => {
    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(200)
    expect(res.body.pricing.itemSubtotal).toBe(100)
    expect(res.body.pricing.deliveryFee).toBe(20)
    expect(res.body.pricing.baseAmount).toBe(120)
    expect(res.body.deliveryLocationId).toBe('loc_hostel_a')
    expect(res.body.lines.length).toBe(1)
    expect(res.body.lines[0].productId).toBe('p_milk')
    expect(res.body.lines[0].quantity).toBe(2)
    expect(res.body.fulfillmentGroups.length).toBe(1)
  })

  // 13. Failed, malformed, unknown or timed-out Make.com verification responses never mark an order paid
  it('13. fails closed and never marks order paid on inconclusive, negative, or timed-out Make.com responses', async () => {
    // Configure Make verifier returning inconclusive / negative
    setMakeVerifier(async () => ({
      success: false,
      status: 'inconclusive',
      reason: 'NOT_RECEIVED',
      message: 'Payment not detected in merchant notifications.',
    }))

    // Reset order window so it is active
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_realloc_test')
    dbOrder.payment_window_expires_at = new Date(Date.now() + 200000).toISOString()

    const checkRes = await request(app)
      .post('/api/v1/orders/ord_realloc_test/check-payment')
      .set('Authorization', 'Bearer tok_alice')
      .set('x-bypass-delay', 'true')

    expect(checkRes.status).toBe(200)
    expect(checkRes.body.status).toBe('inconclusive')
    expect(checkRes.body.paymentStatus).toBe('PENDING')
    expect(dbOrder.payment_status).toBe('PENDING')
    expect(dbOrder.status).toBe('AWAITING_PAYMENT')
  })

  // 14. Expired or cancelled orders cannot bypass the established lifecycle through reallocation
  it('14. rejects payment reallocation when order is cancelled by user or admin', async () => {
    const dbOrder = mockState.orders.find((o) => o.id === 'ord_realloc_test')
    dbOrder.status = 'CANCELLED'
    dbOrder.payment_status = 'FAILED'

    const res = await request(app)
      .post('/api/v1/orders/ord_realloc_test/retry-payment')
      .set('Authorization', 'Bearer tok_alice')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('INVALID_STATE')
  })

  // RPC-style alias endpoint compatibility
  it('supports RPC-style endpoint POST /orders/retryPayment with { orderId } payload', async () => {
    const res = await request(app)
      .post('/orders/retryPayment')
      .set('Authorization', 'Bearer tok_alice')
      .send({ orderId: 'ord_realloc_test' })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('ord_realloc_test')
    expect(res.body.payment.feePaise).toBe(1)
    expect(res.body.pricing.total).toBe(120.01)
  })
})
