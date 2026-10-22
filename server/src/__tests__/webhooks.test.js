import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createMockSupabaseClient } from './testHelpers.js'
import { env } from '../config/env.js'
import { setGatewayVerifier } from '../routes/webhooks.js'
import { getSupabaseAdmin } from '../config/supabase.js'

describe('Make.com Payment Verification Webhook Integration', () => {
  let app
  let mockState

  // Sample orders representing different lifecycle states
  const activeOrder = {
    id: 'ord_webhook_active',
    customer_id: 'usr_alice',
    status: 'AWAITING_PAYMENT',
    payment_status: 'PENDING',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_attempt_id: 'att_active_1',
    payment_allocated_at: new Date().toISOString(),
    payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 420000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  const windowExpiredOrder = {
    id: 'ord_webhook_win_expired',
    customer_id: 'usr_alice',
    status: 'AWAITING_PAYMENT',
    payment_status: 'PENDING',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_attempt_id: 'att_expired_win',
    payment_allocated_at: new Date(Date.now() - 300000).toISOString(),
    payment_window_expires_at: new Date(Date.now() - 180000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 120000).toISOString(),
    created_at: new Date(Date.now() - 300000).toISOString(),
    order_fulfillment_groups: [],
  }

  const terminalExpiredOrder = {
    id: 'ord_webhook_terminal_expired',
    customer_id: 'usr_alice',
    status: 'CANCELLED',
    payment_status: 'EXPIRED',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_attempt_id: 'att_term_1',
    payment_allocated_at: new Date(Date.now() - 600000).toISOString(),
    payment_window_expires_at: new Date(Date.now() - 480000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() - 180000).toISOString(),
    created_at: new Date(Date.now() - 600000).toISOString(),
    order_fulfillment_groups: [],
  }

  const cancelledOrder = {
    id: 'ord_webhook_cancelled',
    customer_id: 'usr_alice',
    status: 'CANCELLED',
    payment_status: 'PENDING',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_attempt_id: 'att_canc_1',
    payment_allocated_at: new Date().toISOString(),
    payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 420000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  const paidOrder = {
    id: 'ord_webhook_paid',
    customer_id: 'usr_alice',
    status: 'CONFIRMED',
    payment_status: 'PAID',
    item_subtotal: '100.00',
    combined_delivery_fee: '15.00',
    base_amount: '115.00',
    platform_fee: '0.15',
    total_payable: '115.15',
    fee_paise: 15,
    payment_attempt_id: 'att_paid_1',
    paid_at: new Date().toISOString(),
    payment_allocated_at: new Date().toISOString(),
    payment_window_expires_at: new Date(Date.now() + 120000).toISOString(),
    payment_cooldown_expires_at: new Date(Date.now() + 420000).toISOString(),
    created_at: new Date().toISOString(),
    order_fulfillment_groups: [],
  }

  const validSecret = env.MAKE_WEBHOOK_SECRET || 'test-make-webhook-secret-min-16-chars'

  beforeEach(() => {
    // Reset pluggable gateway verifier to default repo state (no gateway)
    setGatewayVerifier(null)

    const mock = createMockSupabaseClient({
      users: [
        { id: 'usr_alice', token: 'tok_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
      ],
      profiles: [
        { id: 'usr_alice', email: 'alice@campus.edu', name: 'Alice Customer' },
      ],
      userRoles: [
        { user_id: 'usr_alice', role: 'customer' },
      ],
      orders: [
        structuredClone(activeOrder),
        structuredClone(windowExpiredOrder),
        structuredClone(terminalExpiredOrder),
        structuredClone(cancelledOrder),
        structuredClone(paidOrder),
      ],
      platform_fee_reservations: [
        { fee_paise: 15, active_order_id: 'ord_webhook_active', is_paid: false },
        { fee_paise: 15, active_order_id: 'ord_webhook_win_expired', is_paid: false },
      ],
      payment_records: [],
    })
    mockState = mock.state
    app = createApp()
  })

  describe('Authentication & Secret Validation', () => {
    it('rejects incoming webhook when authentication header is missing with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHENTICATED')

      // Verify order remained unmutated
      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(mockState.payment_records.length).toBe(0)
    })

    it('rejects incoming webhook with invalid shared secret with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', 'completely-wrong-token-value')
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHENTICATED')
      expect(mockState.payment_records.length).toBe(0)
    })

    it('rejects with 500 WEBHOOK_UNCONFIGURED when server MAKE_WEBHOOK_SECRET is empty or unconfigured', async () => {
      const origSecret = env.MAKE_WEBHOOK_SECRET
      try {
        env.MAKE_WEBHOOK_SECRET = ''
        const res = await request(app)
          .post('/api/v1/webhooks/make-payment')
          .set('x-make-secret', 'any-secret-value')
          .send({
            orderId: 'ord_webhook_active',
            amount: 115.15,
            evidence: 'Payment received',
          })

        expect(res.status).toBe(500)
        expect(res.body.code).toBe('WEBHOOK_UNCONFIGURED')
      } finally {
        env.MAKE_WEBHOOK_SECRET = origSecret
      }
    })

    it('accepts valid secret via x-make-secret header and fails closed to unverified evidence', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.verified).toBe(false)
      expect(res.body.paymentStatus).toBe('PENDING')
      expect(res.body.reason).toBe('NO_AUTHORITATIVE_GATEWAY_INTEGRATION')

      // Order must NOT be marked PAID
      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(order.status).toBe('AWAITING_PAYMENT')
    })

    it('accepts valid secret via x-webhook-secret header and fails closed to unverified evidence', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-webhook-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.verified).toBe(false)
      expect(res.body.paymentStatus).toBe('PENDING')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
    })

    it('accepts valid secret via Authorization Bearer header and fails closed to unverified evidence', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('Authorization', `Bearer ${validSecret}`)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.verified).toBe(false)
      expect(res.body.paymentStatus).toBe('PENDING')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
    })
  })

  describe('Payload Validation & Malformed Events', () => {
    it('rejects request with missing orderId with 400 INVALID_ORDER_ID', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_ORDER_ID')
    })

    it('rejects request with missing amount with 400 INVALID_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          evidence: 'Payment received',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_AMOUNT')
    })

    it('rejects request with non-numeric or non-positive amount with 400 INVALID_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: -50.00,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_AMOUNT')
    })

    it('rejects completely empty JSON body with 400 INVALID_ORDER_ID', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_ORDER_ID')
    })
  })

  describe('Order Reference & Amount Matching', () => {
    it('returns 404 ORDER_NOT_FOUND when order reference does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_non_existent',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('ORDER_NOT_FOUND')
      expect(mockState.payment_records.length).toBe(0)
    })

    it('rejects underpaid notification (amount mismatch) with 400 PAYMENT_AMOUNT_MISMATCH', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 10.00, // Expected: 115.15
          evidence: 'Payment received',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PAYMENT_AMOUNT_MISMATCH')

      // Ensure order remains PENDING
      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(mockState.payment_records.length).toBe(0)
    })

    it('rejects notification where platform fee paise does not match with 400 PAYMENT_AMOUNT_MISMATCH', async () => {
      // 115.14 instead of 115.15 (1 paise mismatch)
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.14,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PAYMENT_AMOUNT_MISMATCH')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(mockState.payment_records.length).toBe(0)
    })
  })

  describe('Unverified and Negative Evidence Handling', () => {
    it('rejects notification indicating transaction failure with 400 PAYMENT_FAILED_NOTIFICATION', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          status: 'FAILED',
          evidence: 'Transaction failed at bank',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PAYMENT_FAILED_NOTIFICATION')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(mockState.payment_records.length).toBe(0)
    })

    it('rejects notification with declined status with 400 PAYMENT_FAILED_NOTIFICATION', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Payment declined by issuer bank',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PAYMENT_FAILED_NOTIFICATION')
    })

    it('rejects notification without authoritative positive evidence with 400 UNVERIFIED_EVIDENCE', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          evidence: 'Customer visited payment screen',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('UNVERIFIED_EVIDENCE')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(mockState.payment_records.length).toBe(0)
    })
  })

  describe('Terminal Order & Expiry Guards (No Late Overwrite)', () => {
    it('rejects webhook for cancelled order with 409 TERMINAL_STATE', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_cancelled',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('TERMINAL_STATE')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_cancelled')
      expect(order.status).toBe('CANCELLED')
    })

    it('rejects webhook for terminal EXPIRED order with 409 TERMINAL_STATE', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_terminal_expired',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('TERMINAL_STATE')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_terminal_expired')
      expect(order.payment_status).toBe('EXPIRED')
    })

    it('rejects webhook arriving after 2-minute payment window with 400 PAYMENT_WINDOW_EXPIRED', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_win_expired',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PAYMENT_WINDOW_EXPIRED')

      const order = mockState.orders.find((o) => o.id === 'ord_webhook_win_expired')
      expect(order.payment_status).toBe('PENDING') // Not marked PAID
    })
  })

  describe('Fail-Closed Security & Regression: Forged Payloads & Untrusted Webhook Proof', () => {
    it('strictly proves that a forged SUCCESS payload with a fabricated UTR cannot mark an order PAID, even with a valid webhook secret', async () => {
      const forgedPayload = {
        orderId: 'ord_webhook_active',
        amount: 115.15,
        utr: 'fabricated_utr_998877665544',
        sender: 'Attacker / 9999999999@upi',
        status: 'SUCCESS',
        evidence: 'Payment received',
        rawPayload: {
          forged: true,
          fakeBankRef: 'PAYTM_FORGED_12345',
        },
      }

      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send(forgedPayload)

      // 1. Webhook acknowledges receipt but reports unverified and does NOT mark PAID
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.orderId).toBe('ord_webhook_active')
      expect(res.body.verified).toBe(false)
      expect(res.body.paymentStatus).toBe('PENDING')
      expect(res.body.reason).toBe('NO_AUTHORITATIVE_GATEWAY_INTEGRATION')

      // 2. Order in database MUST REMAIN PENDING and AWAITING_PAYMENT
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(dbOrder.payment_status).toBe('PENDING')
      expect(dbOrder.status).toBe('AWAITING_PAYMENT')
      expect(dbOrder.paid_at).toBeUndefined()

      // 3. Platform fee dynamic slot must remain unconfirmed (is_paid = false)
      const feeSlot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 15)
      expect(feeSlot.is_paid).toBe(false)
      expect(feeSlot.paid_at).toBeUndefined()

      // 4. Payment record in DB must be stored strictly as unverified audit evidence
      expect(mockState.payment_records.length).toBe(1)
      const record = mockState.payment_records[0]
      expect(record.order_id).toBe('ord_webhook_active')
      expect(Number(record.amount)).toBe(115.15)
      expect(record.status).toBe('PROCESSING')
      expect(record.evidence).toBeNull() // Critical: evidence = null prevents database shortcut bypass
      expect(record.verification_source).toBe('MAKE_WEBHOOK_INGESTION')
      expect(record.raw_payload.verifiedSettlement).toBe(false)
      expect(record.raw_payload.utr).toBe('fabricated_utr_998877665544')
    })

    it('proves that stored unverified notification record strictly prevents mark_platform_fee_paid shortcut', async () => {
      // 1. Ingest unverified notification via webhook
      await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          utr: 'unverified_utr_123',
          evidence: 'Payment received',
        })

      // 2. Attempt to call mark_platform_fee_paid directly
      const supabase = getSupabaseAdmin()
      const { error } = await supabase.rpc('mark_platform_fee_paid', {
        p_order_id: 'ord_webhook_active',
      })

      // Must be rejected by database anti-shortcut guard
      expect(error).not.toBeNull()
      expect(error.message).toBe('UNVERIFIED_PAYMENT_SHORTCUT_PROHIBITED')

      // Order remains untouched
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(dbOrder.payment_status).toBe('PENDING')
    })

    it('proves that customer check-payment polling remains inconclusive after unverified Make.com notification', async () => {
      // 1. Customer polls before webhook
      const checkBefore = await request(app)
        .post('/api/v1/orders/ord_webhook_active/check-payment')
        .set('Authorization', 'Bearer tok_alice')

      expect(checkBefore.status).toBe(200)
      expect(checkBefore.body.status).toBe('inconclusive')
      expect(checkBefore.body.paymentStatus).toBe('PENDING')

      // 2. Webhook arrives with unverified claim
      const webhookRes = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          utr: 'unverified_utr_777',
          evidence: 'Payment received',
        })

      expect(webhookRes.status).toBe(200)
      expect(webhookRes.body.verified).toBe(false)

      // 3. Customer polls after webhook: still inconclusive because notification is unverified
      const checkAfter = await request(app)
        .post('/api/v1/orders/ord_webhook_active/check-payment')
        .set('Authorization', 'Bearer tok_alice')

      expect(checkAfter.status).toBe(200)
      expect(checkAfter.body.status).toBe('inconclusive')
      expect(checkAfter.body.paymentStatus).toBe('PENDING')
    })

    it('safely and idempotently handles duplicate/retried unverified webhook events without double-crediting or error', async () => {
      const payload = {
        orderId: 'ord_webhook_active',
        amount: 115.15,
        utr: '429182749102',
        evidence: 'Payment received',
      }

      // 1. Initial delivery
      const res1 = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send(payload)

      expect(res1.status).toBe(200)
      expect(res1.body.verified).toBe(false)
      expect(res1.body.paymentStatus).toBe('PENDING')
      expect(res1.body.isDuplicate).toBe(false)

      // 2. Retried/duplicate delivery from Make.com
      const res2 = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send(payload)

      expect(res2.status).toBe(200)
      expect(res2.body.success).toBe(true)
      expect(res2.body.isDuplicate).toBe(true)
      expect(res2.body.verified).toBe(false)
      expect(res2.body.paymentStatus).toBe('PENDING')

      // Payment records count must remain exactly 1 (no duplicates)
      expect(mockState.payment_records.length).toBe(1)
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(dbOrder.payment_status).toBe('PENDING')
    })
  })

  describe('Authoritative Gateway Verification Pipeline (Pluggable Verifier)', () => {
    it('successfully processes authenticated webhook, marks order PAID and CONFIRMED, and records payment evidence when gateway verifies settlement', async () => {
      // Inject authoritative gateway verifier that confirms genuine bank settlement
      setGatewayVerifier(async ({ orderId, amount, utr }) => {
        expect(orderId).toBe('ord_webhook_active')
        expect(amount).toBe(115.15)
        expect(utr).toBe('429182749102')
        return {
          verified: true,
          provider: 'PAYTM_AUTHORITATIVE',
          merchantId: 'MID_CAMPUS_MART',
          terminalStatus: 'TXN_SUCCESS',
        }
      })

      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          utr: '429182749102',
          sender: 'Student John / 9876543210@paytm',
          evidence: 'Payment received',
          status: 'SUCCESS',
          rawPayload: {
            bankRef: 'paytm_txn_998127',
            source: 'gmail_paytm_parser',
          },
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.orderId).toBe('ord_webhook_active')
      expect(res.body.verified).toBe(true)
      expect(res.body.paymentStatus).toBe('PAID')

      // Verify DB order state
      const dbOrder = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(dbOrder.payment_status).toBe('PAID')
      expect(dbOrder.status).toBe('CONFIRMED')
      expect(dbOrder.paid_at).toBeDefined()

      // Verify payment record persisted with verified status
      expect(mockState.payment_records.length).toBe(1)
      const record = mockState.payment_records[0]
      expect(record.order_id).toBe('ord_webhook_active')
      expect(Number(record.amount)).toBe(115.15)
      expect(record.status).toBe('PAID')
      expect(record.evidence).toBe('Payment received')

      // Verify dynamic platform fee slot locked as is_paid = true
      const feeSlot = mockState.platform_fee_reservations.find((r) => r.fee_paise === 15)
      expect(feeSlot.is_paid).toBe(true)
      expect(feeSlot.paid_at).toBeDefined()

      // Verify customer check-payment endpoint returns verified
      const checkAfter = await request(app)
        .post('/api/v1/orders/ord_webhook_active/check-payment')
        .set('Authorization', 'Bearer tok_alice')

      expect(checkAfter.status).toBe(200)
      expect(checkAfter.body.status).toBe('verified')
      expect(checkAfter.body.paymentStatus).toBe('PAID')
    })

    it('does not confirm an order when persisting authoritative evidence fails', async () => {
      setGatewayVerifier(async () => ({
        verified: true,
        provider: 'PAYTM_AUTHORITATIVE',
        terminalStatus: 'TXN_SUCCESS',
      }))
      mockState.updateErrors = { payment_records: 'simulated evidence write failure' }

      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          utr: 'verified_but_unpersisted_123',
          evidence: 'Payment received',
        })

      expect(res.status).toBe(500)
      const order = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(order.payment_status).toBe('PENDING')
      expect(order.status).toBe('AWAITING_PAYMENT')
      expect(mockState.payment_records[0].status).toBe('PROCESSING')
      expect(mockState.payment_records[0].evidence).toBeNull()
    })

    it('fails closed and keeps order PENDING when authoritative gateway rejects the transaction', async () => {
      // Inject gateway verifier that finds transaction invalid or unconfirmed
      setGatewayVerifier(async () => {
        return {
          verified: false,
          reason: 'GATEWAY_TXN_NOT_FOUND',
          message: 'Transaction reference not found at bank gateway.',
        }
      })

      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_active',
          amount: 115.15,
          utr: 'fake_or_unsettled_utr',
          evidence: 'Payment received',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.verified).toBe(false)
      expect(res.body.paymentStatus).toBe('PENDING')
      expect(res.body.reason).toBe('GATEWAY_TXN_NOT_FOUND')

      const dbOrder = mockState.orders.find((o) => o.id === 'ord_webhook_active')
      expect(dbOrder.payment_status).toBe('PENDING')
      expect(dbOrder.status).toBe('AWAITING_PAYMENT')
    })

    it('returns idempotent success for orders already in PAID state', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/make-payment')
        .set('x-make-secret', validSecret)
        .send({
          orderId: 'ord_webhook_paid',
          amount: 115.15,
          evidence: 'Payment received',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.isDuplicate).toBe(true)
      expect(res.body.paymentStatus).toBe('PAID')
    })
  })
})
