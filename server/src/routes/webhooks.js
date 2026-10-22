import crypto from 'node:crypto'
import { Router } from 'express'
import { env } from '../config/env.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { executeAtomicPaymentVerification } from './orders.js'

export const webhooksRouter = Router()

// Pluggable gateway verifier for authoritative server-to-server gateway verification.
let customGatewayVerifier = null

/**
 * Allows injecting an authoritative payment gateway verifier (for tests or official gateway client).
 */
export function setGatewayVerifier(fn) {
  customGatewayVerifier = fn
}

/**
 * Sanitized structured logger for payment webhook operations.
 * CRITICAL: NEVER logs secrets, tokens, customer credentials, or sensitive banking PII.
 */
function logWebhook(level, event, data = {}) {
  const payload = {
    tag: 'PAYMENT_WEBHOOK',
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }
  const str = JSON.stringify(payload)
  if (level === 'error') {
    console.error(str)
  } else if (level === 'warn') {
    console.warn(str)
  } else {
    console.info(str)
  }
}

/**
 * Timing-safe shared-secret authentication middleware for incoming Make.com payment webhooks.
 *
 * Supports:
 * - Header: 'x-make-secret'
 * - Header: 'x-webhook-secret'
 * - Header: 'Authorization: Bearer <secret>'
 *
 * Security:
 * - Uses constant-time digest comparison (SHA-256 + timingSafeEqual) to prevent timing attacks.
 * - Rejects unconfigured servers safely.
 * - Never prints or leaks secrets in error messages or logs.
 */
export function authenticateWebhook(req, res, next) {
  logWebhook('info', 'REQUEST_RECEIVED', {
    path: req.originalUrl,
    method: req.method,
    hasMakeSecret: Boolean(req.headers['x-make-secret']),
    hasWebhookSecret: Boolean(req.headers['x-webhook-secret']),
    hasBearer: Boolean(
      typeof req.headers['authorization'] === 'string' &&
        req.headers['authorization'].startsWith('Bearer '),
    ),
  })

  const configuredSecret = env.MAKE_WEBHOOK_SECRET || process.env.MAKE_WEBHOOK_SECRET
  if (!configuredSecret || typeof configuredSecret !== 'string' || !configuredSecret.trim()) {
    logWebhook('error', 'AUTH_REJECTED', {
      reason: 'WEBHOOK_UNCONFIGURED',
      message: 'MAKE_WEBHOOK_SECRET is not configured on the server.',
    })
    throw ApiError.internal('Payment webhook service is not configured on the server.', 'WEBHOOK_UNCONFIGURED')
  }

  const rawHeader =
    req.headers['x-make-secret'] ||
    req.headers['x-webhook-secret'] ||
    (typeof req.headers['authorization'] === 'string' && req.headers['authorization'].startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : null)

  if (!rawHeader || typeof rawHeader !== 'string') {
    logWebhook('warn', 'AUTH_REJECTED', {
      reason: 'MISSING_CREDENTIALS',
    })
    throw ApiError.unauthorized('Missing webhook authentication credentials.', 'UNAUTHENTICATED')
  }

  const hashConfigured = crypto.createHash('sha256').update(configuredSecret).digest()
  const hashHeader = crypto.createHash('sha256').update(rawHeader).digest()

  if (!crypto.timingSafeEqual(hashConfigured, hashHeader)) {
    logWebhook('warn', 'AUTH_REJECTED', {
      reason: 'INVALID_SECRET',
    })
    throw ApiError.unauthorized('Invalid webhook authentication secret.', 'UNAUTHENTICATED')
  }

  logWebhook('info', 'AUTH_SUCCESS', {
    path: req.originalUrl,
  })

  next()
}

/**
 * Server-side trusted payment gateway verification provider.
 *
 * In accordance with MartIT security policies:
 * - Make.com email/SMS parsing, caller-supplied UTRs, client claims, and shared webhook secrets
 *   are NOT sufficient proof of bank settlement.
 * - If an authoritative server-to-server gateway verification source is configured (e.g. Paytm MID/API),
 *   it must verify merchant account, transaction identity, exact amount, and terminal success.
 * - If no trusted verification mechanism exists, it fails closed: the payment notification is ingested
 *   as unverified evidence only and NEVER marked PAID.
 */
export async function verifyWithAuthoritativePaymentGateway({ orderId, amount, utr }) {
  if (typeof customGatewayVerifier === 'function') {
    return customGatewayVerifier({ orderId, amount, utr })
  }

  // FAIL CLOSED: No working trusted Paytm payment-status verification mechanism exists in this repository.
  // In accordance with MartIT security policies:
  // - Email/SMS parsing, caller-claimed "SUCCESS", "Payment received", a UTR, and shared webhook secrets
  //   are NOT sufficient proof of bank settlement.
  // - We fail closed: store the incoming notification as pending/unverified evidence only, and never
  //   transition the order to PAID without authoritative server-side gateway confirmation.
  // - We do not fabricate verification or invent a Paytm API.
  return {
    verified: false,
    reason: 'NO_AUTHORITATIVE_GATEWAY_INTEGRATION',
    message:
      'No trusted server-to-server Paytm or banking payment status verification client exists in this repository. Ingestion fails closed to unverified evidence.',
  }
}

/**
 * Ingests payment notifications from Make.com (Paytm Business UPI email/SMS ingestion).
 *
 * SECURITY INVARIANTS:
 * 1. Email/SMS notifications from Make.com, caller-claimed "SUCCESS", "Payment received", UTRs,
 *    and shared webhook secrets are UNTRUSTED for settlement.
 * 2. Incoming notifications are recorded in `public.payment_records` as pending/unverified evidence
 *    (`status = 'PROCESSING'`, `evidence = NULL`) for staff audit and reconciliation.
 * 3. An order is NEVER transitioned to PAID unless verified by an authoritative server-side gateway.
 *    In the absence of a trusted Paytm verification client, the system FAILS CLOSED.
 * 4. Mismatched amounts, unknown orders, malformed payloads, and terminal orders are strictly rejected.
 * 5. Retried events are handled idempotently without duplicate records or state corruption.
 */
export async function handleMakePaymentWebhook(req, res, next) {
  try {
    const body = req.body || {}
    const orderId = body.orderId || body.order_id || body.tr || body.orderRef
    const rawAmount = body.amount ?? body.am ?? body.paidAmount
    const status = body.status ? String(body.status).toUpperCase() : null
    const evidenceText = typeof body.evidence === 'string' ? body.evidence : ''

    logWebhook('info', 'PAYLOAD_RECEIVED', {
      orderId: orderId || null,
      rawAmount: rawAmount !== undefined ? rawAmount : null,
      status: status || null,
      hasEvidenceText: Boolean(evidenceText),
      hasUtr: Boolean(body.utr || body.rrn || body.transactionId || body.txnId),
    })

    // 1. Validate order reference
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      logWebhook('warn', 'PAYLOAD_REJECTED', {
        reason: 'INVALID_ORDER_ID',
      })
      throw ApiError.badRequest('Valid order reference is required.', 'INVALID_ORDER_ID')
    }

    // 2. Validate payment amount
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
      logWebhook('warn', 'PAYLOAD_REJECTED', {
        orderId,
        reason: 'MISSING_AMOUNT',
      })
      throw ApiError.badRequest('Payment amount is required.', 'INVALID_AMOUNT')
    }

    const parsedAmount = Number(rawAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      logWebhook('warn', 'PAYLOAD_REJECTED', {
        orderId,
        reason: 'INVALID_AMOUNT',
        parsedAmount,
      })
      throw ApiError.badRequest('Payment amount must be a positive number.', 'INVALID_AMOUNT')
    }

    // 3. Reject explicit failure or decline notifications
    if (
      status === 'FAILED' ||
      status === 'CANCELLED' ||
      status === 'DECLINED' ||
      /fail|declin|bounc|reject/i.test(evidenceText)
    ) {
      logWebhook('warn', 'NOTIFICATION_REJECTED', {
        orderId,
        status,
        reason: 'PAYMENT_FAILED_NOTIFICATION',
      })
      throw ApiError.badRequest(
        'Webhook notification indicates a failed or declined transaction.',
        'PAYMENT_FAILED_NOTIFICATION',
      )
    }

    // 4. Require positive notification evidence
    const hasNotificationEvidence =
      evidenceText === 'Payment received' ||
      status === 'SUCCESS' ||
      status === 'PAID' ||
      /payment received|received rs|credited/i.test(evidenceText)

    if (!hasNotificationEvidence) {
      logWebhook('warn', 'NOTIFICATION_REJECTED', {
        orderId,
        status,
        reason: 'UNVERIFIED_EVIDENCE',
      })
      throw ApiError.badRequest(
        'Webhook notification lacks payment evidence.',
        'UNVERIFIED_EVIDENCE',
      )
    }

    const supabase = getSupabaseAdmin()

    // 5. Query order from database
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId.trim())
      .maybeSingle()

    if (orderErr) {
      logWebhook('error', 'DATABASE_ERROR', {
        orderId,
        error: orderErr.message,
      })
      throw ApiError.internal(`Database error querying order: ${orderErr.message}`)
    }

    if (!order) {
      logWebhook('warn', 'ORDER_NOT_FOUND', {
        orderId,
      })
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    // 6. Idempotency Check: Already paid
    if (order.payment_status === 'PAID') {
      logWebhook('info', 'IDEMPOTENT_ALREADY_PAID', {
        orderId: order.id,
      })
      return res.status(200).json({
        success: true,
        orderId: order.id,
        paymentStatus: 'PAID',
        verified: true,
        message: 'Order is already marked paid.',
        isDuplicate: true,
      })
    }

    // 7. Terminal State Guard: CANCELLED or terminal payment states cannot transition
    if (order.status === 'CANCELLED' || ['EXPIRED', 'FAILED', 'REFUNDED'].includes(order.payment_status)) {
      logWebhook('warn', 'TERMINAL_STATE_REJECTED', {
        orderId: order.id,
        orderStatus: order.status,
        paymentStatus: order.payment_status,
      })
      throw ApiError.conflict(
        'Order is cancelled or in a terminal payment state and cannot be marked paid.',
        'TERMINAL_STATE',
      )
    }

    // 8. Payment Window Expiry Guard: Webhooks arriving after the 2-minute payment window cannot mark paid
    const now = Date.now()
    const windowExpiry = new Date(order.payment_window_expires_at).getTime()
    if (Number.isFinite(windowExpiry) && now >= windowExpiry) {
      logWebhook('warn', 'WINDOW_EXPIRED_REJECTED', {
        orderId: order.id,
        windowExpiresAt: order.payment_window_expires_at,
        expiredByMs: now - windowExpiry,
      })
      throw ApiError.badRequest('Payment verification window has expired.', 'PAYMENT_WINDOW_EXPIRED')
    }

    // 9. Dynamic Platform Fee Anti-Tampering Check: Exact amount match required
    const expectedTotal = Number(order.total_payable)
    const amountDiff = Math.abs(parsedAmount - expectedTotal)

    if (amountDiff > 0.005) {
      logWebhook('warn', 'AMOUNT_MISMATCH_REJECTED', {
        orderId: order.id,
        expectedTotal,
        receivedAmount: parsedAmount,
        difference: Number(amountDiff.toFixed(4)),
      })
      throw ApiError.badRequest(
        `Payment amount (${parsedAmount.toFixed(2)}) does not match order total payable (${expectedTotal.toFixed(2)}).`,
        'PAYMENT_AMOUNT_MISMATCH',
        { expectedAmount: expectedTotal, receivedAmount: parsedAmount },
      )
    }

    // 10. Deduplicate event and persist payment evidence
    const utr = body.utr || body.rrn || body.transactionId || body.txnId || null
    const dedupeKey = utr || body.attemptId || body.eventId || order.payment_attempt_id || `att_${order.id}`

    const { data: existingRecord } = await supabase
      .from('payment_records')
      .select('*')
      .eq('order_id', order.id)
      .eq('attempt_id', dedupeKey)
      .maybeSingle()

    let recordId = existingRecord?.id || `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

    if (!existingRecord) {
      // FAIL-CLOSED INGESTION:
      // Store notification evidence as PROCESSING with evidence = null.
      // This strictly avoids satisfying the mark_platform_fee_paid anti-shortcut constraint
      // (which requires status = 'PAID' OR evidence IS NOT NULL) until authoritative verification succeeds.
      const { error: insertErr } = await supabase.from('payment_records').insert({
        id: recordId,
        order_id: order.id,
        attempt_id: dedupeKey,
        amount: expectedTotal,
        status: 'PROCESSING',
        provider: body.provider || 'UPI',
        verification_source: 'MAKE_WEBHOOK_INGESTION',
        evidence: null,
        raw_payload: {
          utr: utr || null,
          sender: body.sender || body.payer || null,
          timestamp: body.timestamp || new Date().toISOString(),
          receivedAmount: parsedAmount,
          notificationText: evidenceText || null,
          raw: body.rawPayload || null,
          verifiedSettlement: false,
          ingestionSource: 'make_webhook',
        },
        created_at: new Date().toISOString(),
      })

      if (insertErr) {
        if (insertErr.message?.includes('PAYMENT_AMOUNT_MISMATCH')) {
          logWebhook('warn', 'PAYMENT_RECORD_INSERT_REJECTED', {
            orderId: order.id,
            error: insertErr.message,
          })
          throw ApiError.badRequest('Payment record amount rejected by database constraint.', 'PAYMENT_AMOUNT_MISMATCH')
        }
        logWebhook('error', 'PAYMENT_RECORD_INSERT_FAILED', {
          orderId: order.id,
          error: insertErr.message,
        })
        throw ApiError.internal(`Failed to persist payment evidence: ${insertErr.message || 'Database error'}`)
      }
    }

    logWebhook('info', 'EVIDENCE_INGESTION', {
      orderId: order.id,
      recordId,
      attemptId: dedupeKey,
      amount: expectedTotal,
      isDuplicate: Boolean(existingRecord),
      status: 'PROCESSING',
    })

    // 11. Authoritative Payment Gateway Verification
    // Never trust client/Make claims alone; verify directly against authoritative banking provider.
    const gatewayVerification = await verifyWithAuthoritativePaymentGateway({
      orderId: order.id,
      amount: expectedTotal,
      utr,
    })

    logWebhook('info', 'GATEWAY_VERIFICATION_EVALUATED', {
      orderId: order.id,
      verified: gatewayVerification.verified,
      reason: gatewayVerification.reason || null,
    })

    if (!gatewayVerification.verified) {
      // FAIL CLOSED: No authoritative gateway confirmed bank settlement.
      // Do NOT call executeAtomicPaymentVerification(). Order remains PENDING.
      logWebhook('info', 'INGESTION_FAILED_CLOSED', {
        orderId: order.id,
        reason: gatewayVerification.reason,
        orderRemainsStatus: order.payment_status,
      })
      return res.status(200).json({
        success: true,
        orderId: order.id,
        paymentStatus: order.payment_status,
        verified: false,
        isDuplicate: Boolean(existingRecord),
        message:
          'Payment notification ingested as unverified evidence. Authoritative bank settlement verification required before order confirmation.',
        reason: gatewayVerification.reason,
      })
    }

    // 12. Authoritative Gateway Confirmed: Upgrade evidence to verified and execute atomic transition
    await supabase
      .from('payment_records')
      .update({
        status: 'PAID',
        evidence: 'Payment received',
      })
      .eq('id', recordId)

    await executeAtomicPaymentVerification(supabase, order.id)

    logWebhook('info', 'GATEWAY_VERIFIED_SETTLED', {
      orderId: order.id,
      amount: expectedTotal,
    })

    return res.status(200).json({
      success: true,
      orderId: order.id,
      paymentStatus: 'PAID',
      verified: true,
      message: 'Payment received and authoritatively verified. Order confirmed.',
    })
  } catch (err) {
    next(err)
  }
}

// Mount webhook routes
webhooksRouter.post('/api/v1/webhooks/make-payment', authenticateWebhook, handleMakePaymentWebhook)
webhooksRouter.post('/api/v1/webhooks/payment', authenticateWebhook, handleMakePaymentWebhook)
webhooksRouter.post('/webhooks/make-payment', authenticateWebhook, handleMakePaymentWebhook)
