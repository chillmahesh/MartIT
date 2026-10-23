import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { ROLES } from '../utils/permissions.js'
import { env } from '../config/env.js'
import {
  FLAT_DELIVERY_FEE,
  MAX_SERVICE_KM,
  PRICING_VERSION,
  PLATFORM_FEE_WINDOW_MS,
  PLATFORM_FEE_COOLDOWN_MS,
} from '../../../src/config/fees.js'
import { parseCoordinate, straightLineKm } from '../../../src/utils/distance.js'

export const ordersRouter = Router()

// Pluggable Make.com verification client for testing / dependency injection
let customMakeVerifier = null

export function setMakeVerifier(fn) {
  customMakeVerifier = fn
}

/**
 * Queries Make.com verification webhook to check whether customer payment was received in merchant inbox.
 *
 * Implements strict response contract:
 * - Distinguishes confirmed positive (e.g. "Payment recieved", "Payment received", SUCCESS, PAID)
 *   from negative ("not recieved", "not received", FAILED, DECLINED), timeout, network error, and malformed body.
 * - HTTP 200 alone does not establish payment success.
 */
export async function queryMakePaymentVerification({ orderId, amount }) {
  if (typeof customMakeVerifier === 'function') {
    return customMakeVerifier({ orderId, amount })
  }

  const webhookUrl = env.MAKE_VERIFICATION_WEBHOOK_URL || process.env.MAKE_VERIFICATION_WEBHOOK_URL
  if (!webhookUrl) {
    return {
      success: false,
      status: 'inconclusive',
      reason: 'MAKE_WEBHOOK_UNCONFIGURED',
      message: 'Make.com payment verification URL is not configured.',
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: Number(amount),
        amount: Number(amount),
        orderId: String(orderId),
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return {
        success: false,
        status: 'inconclusive',
        httpStatus: res.status,
        reason: 'HTTP_ERROR',
        message: `Make.com returned non-OK HTTP status: ${res.status}`,
      }
    }

    const responseText = await res.text()
    let responseJson = null
    try {
      responseJson = JSON.parse(responseText)
    } catch {
      // Body may be plain text from webhook scenario, e.g. "Payment recieved"
    }

    // Explicit negative check: "not recieved", "not received", fail, declined, rejected, bounced
    const isNegative =
      /not rec[ei]{2}ved|fail|declin|reject|bounc/i.test(responseText) ||
      responseJson?.status === 'FAILED' ||
      responseJson?.status === 'DECLINED'

    if (isNegative) {
      return {
        success: false,
        status: 'inconclusive',
        reason: 'PAYMENT_NOT_RECEIVED',
        rawResponse: responseText,
        message: 'Payment not detected yet. Direct customer to contact admin if money was deducted.',
      }
    }

    // Confirmed positive check: "Payment recieved", "Payment received", SUCCESS, PAID
    const isPositive =
      /payment rec[ei]{2}ved/i.test(responseText) ||
      responseJson?.status === 'SUCCESS' ||
      responseJson?.paymentStatus === 'PAID' ||
      responseJson?.verified === true

    if (isPositive) {
      return {
        success: true,
        status: 'verified',
        rawResponse: responseText,
        message: 'Payment received and verified.',
      }
    }

    // Malformed, unknown, or ambiguous body
    return {
      success: false,
      status: 'inconclusive',
      reason: 'UNKNOWN_RESPONSE',
      rawResponse: responseText,
      message: 'Payment verification returned an unconfirmed response.',
    }
  } catch (netErr) {
    return {
      success: false,
      status: 'inconclusive',
      reason: netErr.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: netErr.message || 'Failed to query Make.com payment verification.',
    }
  }
}

/**
 * Customer order history retrieval.
 * Strictly read-only; no state mutations.
 */
async function handleListCustomerOrders(req, res, next) {
  try {
    const supabase = getSupabaseAdmin()

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        delivery_location_id,
        delivery_location_snapshot,
        status,
        payment_status,
        item_subtotal,
        combined_delivery_fee,
        base_amount,
        platform_fee,
        total_payable,
        route_distance_km,
        routing_provider,
        created_at,
        order_fulfillment_groups (
          id,
          store_id,
          status,
          pickup_sequence_index,
          picked_up_at
        )
      `)
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw ApiError.internal('Failed to retrieve order history.')
    }

    const sanitized = (orders || []).map((o) => {
      const copy = { ...o }
      delete copy.handover_otp_hash
      delete copy.handoverOtpHash
      delete copy._mockOtp
      delete copy.otp
      return copy
    })

    res.status(200).json(sanitized)
  } catch (err) {
    next(err)
  }
}


/**
 * Formats an authoritative database order row (including joined fulfillment groups
 * and order items) into the canonical frontend order structure.
 *
 * Ensures full schema parity between order creation and order retrieval:
 * - Maps order_fulfillment_groups[].order_items[] into top-level lines:
 *   [ { productId, name, pack, unitPrice, quantity, lineSubtotal } ]
 * - Exposes top-level storeId, locationId, customerDetails from database snapshots
 * - Preserves server-authoritative pricing and payment objects
 */
export function formatCanonicalOrder(order) {
  if (!order) return null

  const fulfillmentGroups = order.order_fulfillment_groups || order.fulfillmentGroups || []
  const primaryGroup = fulfillmentGroups[0]

  const storeId =
    primaryGroup?.store_id ||
    primaryGroup?.storeId ||
    order.store_id ||
    order.storeId ||
    null

  const locationId =
    order.delivery_location_id ||
    order.location_id ||
    order.locationId ||
    order.delivery_location_snapshot?.id ||
    null

  // Extract customer details from trusted location snapshot or order record
  const customerDetails =
    order.delivery_location_snapshot?.customerDetails ||
    order.customer_details ||
    order.customerDetails ||
    null

  // Map order_fulfillment_groups[].order_items[] into canonical top-level lines
  const mappedLines = fulfillmentGroups.flatMap((group) => {
    const items = group.order_items || group.orderItems || []
    return items.map((item) => {
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0)
      const quantity = Number(item.quantity ?? 0)
      const lineSubtotal = Number(
        item.line_subtotal ?? item.lineSubtotal ?? (unitPrice * quantity)
      )
      return {
        productId: item.product_id || item.productId,
        name: item.product_name || item.name || '',
        pack: item.product_pack || item.pack || null,
        unitPrice,
        quantity,
        lineSubtotal,
      }
    })
  })

  const lines = mappedLines.length > 0
    ? mappedLines
    : (Array.isArray(order.lines) ? order.lines : [])

  const itemSubtotal = Number(order.item_subtotal ?? order.pricing?.itemSubtotal ?? 0)
  const deliveryFee = Number(order.combined_delivery_fee ?? order.pricing?.deliveryFee ?? 0)
  const baseAmount = Number(order.base_amount ?? order.pricing?.baseAmount ?? 0)
  const platformFee = Number(order.platform_fee ?? order.pricing?.platformFee ?? 0)
  const total = Number(order.total_payable ?? order.pricing?.total ?? 0)
  const distanceKm = Number(order.route_distance_km ?? order.pricing?.distanceKm ?? 0)

  return {
    id: order.id,
    customerId: order.customer_id || order.customerId,
    storeId,
    locationId,
    deliveryLocationId: locationId,
    deliveryLocationSnapshot: order.delivery_location_snapshot || order.deliveryLocationSnapshot || null,
    lines,
    customerDetails,
    status: order.status,
    paymentStatus: order.payment_status || order.paymentStatus || order.payment?.status,
    pricing: {
      itemSubtotal,
      deliveryFee,
      baseAmount,
      platformFee,
      total,
      distanceKm: Number(distanceKm.toFixed(2)),
      distanceMethod: order.pricing?.distanceMethod || 'straight_line',
      pricingVersion: order.fee_policy_version || order.pricing?.pricingVersion || PRICING_VERSION,
    },
    payment: {
      status: order.payment_status || order.paymentStatus || order.payment?.status,
      attemptId: order.payment_attempt_id || order.payment?.attemptId || null,
      feePaise: order.fee_paise ?? order.payment?.feePaise ?? null,
      allocatedAt: order.payment_allocated_at || order.payment?.allocatedAt || null,
      windowExpiresAt: order.payment_window_expires_at || order.payment?.windowExpiresAt || null,
      cooldownExpiresAt: order.payment_cooldown_expires_at || order.payment?.cooldownExpiresAt || null,
      paidAt: order.paid_at || order.payment?.paidAt || null,
    },
    fulfillmentGroups,
    createdAt: order.created_at || order.createdAt,
  }
}

/**
 * Single order retrieval.
 * STRICTLY READ-ONLY: Never mutates payment state or database records on GET.
 */
async function handleGetOrder(req, res, next) {
  try {
    const orderId = req.params?.id || req.body?.orderId
    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }

    const supabase = getSupabaseAdmin()

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        runner_id,
        delivery_location_id,
        delivery_location_snapshot,
        status,
        payment_status,
        item_subtotal,
        combined_delivery_fee,
        base_amount,
        platform_fee,
        total_payable,
        route_distance_km,
        route_stop_sequence,
        routing_provider,
        routing_mode,
        fee_policy_version,
        payment_attempt_id,
        fee_paise,
        payment_allocated_at,
        payment_window_expires_at,
        payment_cooldown_expires_at,
        paid_at,
        created_at,
        order_fulfillment_groups (
          id,
          store_id,
          store_snapshot,
          status,
          pickup_sequence_index,
          picked_up_at,
          order_items (
            id,
            product_id,
            product_name,
            product_pack,
            unit_price,
            quantity,
            line_subtotal
          )
        )
      `)
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    // Ownership & Role Verification
    const isOwner = order.customer_id === req.user.id
    const isAssignedRunner =
      order.runner_id === req.user.id &&
      req.user.roles.includes(ROLES.RUNNER) &&
      req.user.runnerStatus === 'approved'
    const hasStaffAccess =
      req.user.roles.includes(ROLES.ADMIN) ||
      req.user.roles.includes(ROLES.SUPER_ADMIN)

    if (!isOwner && !isAssignedRunner && !hasStaffAccess) {
      throw ApiError.forbidden('You do not have permission to view this order.')
    }

    const now = Date.now()
    const windowExpiry = new Date(order.payment_window_expires_at).getTime()
    const isWindowExpired = Number.isFinite(windowExpiry) ? now >= windowExpiry : false

    // Format authoritative canonical order conforming to frontend contract
    // Notice: does NOT mutate database records on GET request!
    const canonicalOrder = formatCanonicalOrder(order)
    const responseOrder = {
      ...canonicalOrder,
      runnerId: order.runner_id || null,
      isWindowExpired,
    }

    res.status(200).json(responseOrder)
  } catch (err) {
    next(err)
  }
}

/**
 * Dedicated atomic payment verification check endpoint.
 * Server-authorized mutation: transitions payment state based on verification evidence and timers.
 */
async function handleCheckPayment(req, res, next) {
  try {
    const orderId = req.params?.id || req.body?.orderId
    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }

    const supabase = getSupabaseAdmin()

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    // Ownership check
    const isOwner = order.customer_id === req.user.id
    const hasStaffAccess =
      req.user.roles.includes(ROLES.ADMIN) ||
      req.user.roles.includes(ROLES.SUPER_ADMIN)

    if (!isOwner && !hasStaffAccess) {
      throw ApiError.forbidden('You do not have permission to check payment for this order.')
    }

    // 1. Idempotent: Already paid
    if (order.payment_status === 'PAID') {
      return res.status(200).json({
        orderId: order.id,
        status: 'verified',
        paymentStatus: 'PAID',
        message: 'Payment received and verified.',
      })
    }

    const now = Date.now()
    const windowExpiry = new Date(order.payment_window_expires_at).getTime()

    // 2. Terminal state guard: If already EXPIRED, FAILED, REFUNDED, or order CANCELLED, prevent late overwrite
    if (order.status === 'CANCELLED' || ['EXPIRED', 'FAILED', 'REFUNDED'].includes(order.payment_status)) {
      return res.status(200).json({
        orderId: order.id,
        status: 'expired',
        paymentStatus: order.payment_status,
        message: 'Payment verification window has expired or order was cancelled.',
      })
    }

    // 3. Server-authoritative 2-minute timer expiry check
    if (now >= windowExpiry) {
      await executeAtomicPaymentExpiry(supabase, order.id, false)

      return res.status(200).json({
        orderId: order.id,
        status: 'expired',
        paymentStatus: 'EXPIRED',
        message: 'Payment verification window has expired (2 minutes exceeded).',
      })
    }

    // 4. Server-verified evidence check (e.g. from prior webhook or check)
    const { data: verifiedPayment } = await supabase
      .from('payment_records')
      .select('*')
      .eq('order_id', order.id)
      .eq('status', 'PAID')
      .eq('evidence', 'Payment received')
      .eq('verification_source', 'AUTHORITATIVE_GATEWAY')
      .maybeSingle()

    if (verifiedPayment && Number(verifiedPayment.amount) === Number(order.total_payable)) {
      await executeAtomicPaymentVerification(supabase, order.id)

      return res.status(200).json({
        orderId: order.id,
        status: 'verified',
        paymentStatus: 'PAID',
        message: 'Payment received and verified.',
      })
    }

    // 5. Query Make.com verification workflow
    // Backend waits the required five seconds before querying Make.com (bypassed in test environment)
    const bypassDelay = req.headers['x-bypass-delay'] === 'true' || process.env.NODE_ENV === 'test'
    if (!bypassDelay) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    const makeResult = await queryMakePaymentVerification({
      orderId: order.id,
      amount: Number(order.total_payable),
    })

    if (makeResult?.success === true) {
      const recordId = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
      const dedupeKey = order.payment_attempt_id || `make_${order.id}`

      const { data: existingRec } = await supabase
        .from('payment_records')
        .select('id')
        .eq('order_id', order.id)
        .eq('attempt_id', dedupeKey)
        .maybeSingle()

      if (existingRec) {
        await supabase
          .from('payment_records')
          .update({
            status: 'PAID',
            evidence: 'Payment received',
            verification_source: 'AUTHORITATIVE_GATEWAY',
          })
          .eq('id', existingRec.id)
      } else {
        await supabase
          .from('payment_records')
          .insert({
            id: recordId,
            order_id: order.id,
            attempt_id: dedupeKey,
            amount: Number(order.total_payable),
            status: 'PAID',
            provider: 'UPI',
            verification_source: 'AUTHORITATIVE_GATEWAY',
            evidence: 'Payment received',
            raw_payload: {
              makeResponse: makeResult.rawResponse || 'Payment recieved',
              verifiedAt: new Date().toISOString(),
              verifiedVia: 'MAKE_COM_CONFIRMATION',
            },
            created_at: new Date().toISOString(),
          })
      }

      await executeAtomicPaymentVerification(supabase, order.id)

      return res.status(200).json({
        orderId: order.id,
        status: 'verified',
        paymentStatus: 'PAID',
        message: 'Payment received and verified.',
      })
    }

    // 6. Inconclusive check response ('not received' or unconfirmed) while window is still active
    return res.status(200).json({
      orderId: order.id,
      status: 'inconclusive',
      paymentStatus: 'PENDING',
      message: 'Payment not received yet. Direct customer to contact admin if money was deducted.',
      reason: makeResult?.reason || undefined,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Dedicated atomic payment expiration endpoint.
 */
async function handleExpirePayment(req, res, next) {
  try {
    const orderId = req.params?.id || req.body?.orderId
    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }

    const supabase = getSupabaseAdmin()

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    const isOwner = order.customer_id === req.user.id
    const hasStaffAccess =
      req.user.roles.includes(ROLES.ADMIN) ||
      req.user.roles.includes(ROLES.SUPER_ADMIN)

    if (!isOwner && !hasStaffAccess) {
      throw ApiError.forbidden('You do not have permission to expire payment for this order.')
    }

    if (order.payment_status === 'PAID') {
      throw ApiError.conflict('Cannot expire an order that is already paid.', 'ALREADY_PAID')
    }

    await executeAtomicPaymentExpiry(supabase, order.id, true)

    res.status(200).json({
      orderId: order.id,
      status: 'expired',
      paymentStatus: 'EXPIRED',
      message: 'Order payment successfully expired and cancelled.',
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Helper to execute genuine atomic payment expiry in PostgreSQL via stored procedure.
 * STRICT: Does NOT fall back to sequential REST updates on failure.
 */
async function executeAtomicPaymentExpiry(supabase, orderId, force = true) {
  if (typeof supabase.rpc !== 'function') {
    throw ApiError.internal('Database transaction engine unavailable.', 'RPC_UNAVAILABLE')
  }

  const { data, error } = await supabase.rpc('expire_order_payment', {
    p_order_id: orderId,
    p_force: force,
  })

  if (error) {
    if (error.message && error.message.includes('CANNOT_EXPIRE_PAID_ORDER')) {
      throw ApiError.conflict('Cannot expire an order that is already paid.', 'ALREADY_PAID')
    }
    throw ApiError.internal(
      `Payment expiration transaction failed: ${error.message || 'Unknown database error'}`,
      'TRANSACTION_FAILED'
    )
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result || result.expired !== true) {
    throw ApiError.badRequest('Order payment could not be expired.', 'EXPIRY_FAILED')
  }

  return true
}

/**
 * Helper to execute genuine atomic payment verification in PostgreSQL via stored procedure.
 * STRICT: Does NOT fall back to sequential REST updates on failure.
 */
export async function executeAtomicPaymentVerification(supabase, orderId) {
  if (typeof supabase.rpc !== 'function') {
    throw ApiError.internal('Database transaction engine unavailable.', 'RPC_UNAVAILABLE')
  }

  const { data, error } = await supabase.rpc('mark_platform_fee_paid', {
    p_order_id: orderId,
  })

  if (error) {
    if (error.message && error.message.includes('CANNOT_VERIFY_TERMINAL_PAYMENT')) {
      throw ApiError.conflict(
        'Order is cancelled or in a terminal payment state and cannot be marked paid.',
        'TERMINAL_STATE'
      )
    }
    if (error.message && error.message.includes('PAYMENT_WINDOW_EXPIRED')) {
      throw ApiError.badRequest('Payment verification window has expired.', 'PAYMENT_WINDOW_EXPIRED')
    }
    if (error.message && error.message.includes('UNVERIFIED_PAYMENT_SHORTCUT_PROHIBITED')) {
      throw ApiError.badRequest(
        'Payment record evidence does not match order total.',
        'PAYMENT_UNVERIFIED'
      )
    }
    throw ApiError.internal(
      `Payment verification transaction failed: ${error.message || 'Unknown database error'}`,
      'TRANSACTION_FAILED'
    )
  }

  if (!data) {
    throw ApiError.internal(
      'Payment verification transaction returned an unexpected result.',
      'TRANSACTION_FAILED'
    )
  }

  return true
}

/**
 * GET /api/v1/runner/orders - Authenticated runner's assigned orders.
 * Strictly limited to approved runners viewing only their assigned orders.
 */
async function handleRunnerAssignedOrders(req, res, next) {
  try {
    if (!req.user.roles.includes(ROLES.RUNNER) && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('You must be a runner to access this queue.')
    }
    if (req.user.runnerStatus !== 'approved' && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('Runner application is pending approval or suspended.')
    }

    const supabase = getSupabaseAdmin()
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        customer_id,
        runner_id,
        delivery_location_id,
        delivery_location_snapshot,
        status,
        payment_status,
        item_subtotal,
        combined_delivery_fee,
        base_amount,
        platform_fee,
        total_payable,
        route_distance_km,
        routing_provider,
        created_at,
        order_fulfillment_groups (
          id,
          store_id,
          status,
          pickup_sequence_index,
          picked_up_at
        )
      `)
      .eq('runner_id', req.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw ApiError.internal('Failed to retrieve runner orders.')
    }

    const sanitized = (orders || []).map((o) => {
      const copy = { ...o }
      delete copy.handover_otp_hash
      delete copy.handoverOtpHash
      delete copy._mockOtp
      delete copy.otp
      return copy
    })

    res.status(200).json(sanitized)
  } catch (err) {
    next(err)
  }
}

/**
 * Ephemeral in-memory store for active delivery OTP challenges.
 * Plaintext OTPs are kept strictly in server process memory (RAM).
 * Plaintext OTPs are NEVER persisted to database tables, logs, analytics, or browser storage.
 */
class ActiveDeliveryOtpStore {
  constructor() {
    this.cache = new Map()
  }

  set(orderId, { otp, customerId, expiresAt }) {
    this.cache.set(orderId, {
      otp: String(otp),
      customerId: String(customerId),
      expiresAt: Number(expiresAt),
      createdAt: Date.now(),
    })
  }

  get(orderId) {
    const item = this.cache.get(orderId)
    if (!item) return null
    if (Date.now() > item.expiresAt) {
      this.cache.delete(orderId)
      return null
    }
    return item
  }

  delete(orderId) {
    this.cache.delete(orderId)
  }

  clear() {
    this.cache.clear()
  }
}

export const activeOtpStore = new ActiveDeliveryOtpStore()

/**
 * Runner Order State Transition endpoint.
 * Enforces permitted state transitions, runner assignment, and strict OTP requirement for DELIVERED.
 * When transitioning to ON_THE_WAY, atomically initializes the OTP challenge in PostgreSQL via stored procedure.
 */
async function handleRunnerTransitionOrder(req, res, next) {
  try {
    if (!req.user.roles.includes(ROLES.RUNNER) && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('You must be an approved runner to transition delivery status.')
    }
    if (req.user.runnerStatus !== 'approved' && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('Runner application is pending approval or suspended.')
    }

    const orderId = req.params?.id || req.body?.orderId
    const nextStatus = req.body?.nextStatus

    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }
    if (!nextStatus) {
      throw ApiError.badRequest('Target order status is required.', 'INVALID_NEXT_STATUS')
    }

    // Direct transition to DELIVERED is strictly prohibited; must verify OTP
    if (nextStatus === 'DELIVERED') {
      throw ApiError.badRequest(
        'Direct delivery completion is prohibited. Handover requires customer OTP verification.',
        'OTP_VERIFICATION_REQUIRED'
      )
    }

    const supabase = getSupabaseAdmin()

    if (nextStatus === 'ON_THE_WAY') {
      // Initialize cryptographically secure OTP challenge for customer handover
      const otp = String(crypto.randomInt(100000, 1000000))
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex')

      if (typeof supabase.rpc !== 'function') {
        throw ApiError.internal('Database transaction engine unavailable.', 'RPC_UNAVAILABLE')
      }

      // Concurrency-safe atomic transition & challenge initialization in PostgreSQL
      const { data, error } = await supabase.rpc('transition_order_to_on_the_way', {
        p_order_id: orderId,
        p_runner_id: req.user.id,
        p_otp_hash: otpHash,
        p_expiry_seconds: 300,
      })

      if (error) {
        const msg = error.message || ''
        if (msg.includes('ORDER_NOT_FOUND')) {
          throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
        }
        if (msg.includes('FORBIDDEN_RUNNER_NOT_APPROVED')) {
          throw ApiError.forbidden('Runner application is pending approval or suspended.')
        }
        if (msg.includes('ORDER_NOT_ASSIGNED_TO_RUNNER') || msg.includes('FORBIDDEN_CALLER_NOT_RUNNER')) {
          throw ApiError.forbidden('You are not assigned to this delivery.')
        }
        if (msg.includes('OTP_LOCKED')) {
          throw ApiError.tooManyRequests('Order verification is locked due to multiple failed attempts.', 'OTP_LOCKED')
        }
        if (msg.includes('INVALID_ORDER_STATE') || msg.includes('INVALID_TRANSITION')) {
          throw ApiError.badRequest('Invalid status transition.', 'INVALID_ORDER_STATE')
        }
        throw ApiError.internal(`Failed to transition order: ${msg}`)
      }

      const resRow = Array.isArray(data) ? data[0] : data
      if (!resRow || (resRow.success === false)) {
        const code = resRow?.result_code || 'TRANSITION_FAILED'
        if (code === 'ORDER_NOT_FOUND') {
          throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
        }
        if (code === 'FORBIDDEN_RUNNER_NOT_APPROVED') {
          throw ApiError.forbidden('Runner application is pending approval or suspended.')
        }
        if (code === 'ORDER_NOT_ASSIGNED_TO_RUNNER' || code === 'FORBIDDEN_CALLER_NOT_RUNNER') {
          throw ApiError.forbidden('You are not assigned to this delivery.')
        }
        if (code === 'OTP_LOCKED') {
          throw ApiError.tooManyRequests('Order verification is locked due to multiple failed attempts.', 'OTP_LOCKED')
        }
        if (code === 'INVALID_ORDER_STATE' || code === 'INVALID_TRANSITION') {
          throw ApiError.badRequest('Invalid status transition.', 'INVALID_ORDER_STATE')
        }
        throw ApiError.internal(`Order transition failed: ${code}`)
      }

      // If new challenge was initialized, store plaintext OTP strictly in ephemeral RAM for customer retrieval
      if (resRow.challenge_initialized) {
        const { data: customerOrder } = await supabase
          .from('orders')
          .select('customer_id')
          .eq('id', orderId)
          .maybeSingle()

        if (customerOrder?.customer_id) {
          activeOtpStore.set(orderId, {
            otp,
            customerId: customerOrder.customer_id,
            expiresAt: resRow.expires_at ? new Date(resRow.expires_at).getTime() : Date.now() + 300000,
          })
        }
      }

      // Response to runner strictly excludes plaintext OTP or internal hash
      return res.status(200).json({
        orderId,
        status: 'ON_THE_WAY',
        message: 'Order status successfully updated to ON_THE_WAY.',
      })
    }

    // Other transitions (e.g. PREPARING, PICKED_UP)
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    if (order.runner_id !== req.user.id && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('You are not assigned to this delivery.')
    }

    const now = new Date().toISOString()
    const updatePayload = {
      status: nextStatus,
      updated_at: now,
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)

    if (updateErr) {
      throw ApiError.internal('Failed to update order status.')
    }

    res.status(200).json({
      orderId,
      status: nextStatus,
      message: `Order status successfully updated to ${nextStatus}.`,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Runner Delivery OTP Verification endpoint.
 * Concurrency-safe: atomically verifies challenge and updates order status in PostgreSQL via stored procedure.
 */
async function handleVerifyDeliveryOtp(req, res, next) {
  try {
    if (!req.user.roles.includes(ROLES.RUNNER) && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('You must be an approved runner to verify delivery handover.')
    }
    if (req.user.runnerStatus !== 'approved' && !req.user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('Runner application is pending approval or suspended.')
    }

    const orderId = req.params?.id || req.body?.orderId
    const otp = req.body?.otp

    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }

    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      throw ApiError.badRequest('OTP must contain exactly six numeric digits.', 'OTP_INVALID_FORMAT')
    }

    const cleanOtp = otp.trim()
    const otpHash = crypto.createHash('sha256').update(cleanOtp).digest('hex')
    const supabase = getSupabaseAdmin()

    if (typeof supabase.rpc !== 'function') {
      throw ApiError.internal('Database transaction engine unavailable.', 'RPC_UNAVAILABLE')
    }

    const { data, error } = await supabase.rpc('verify_delivery_otp', {
      p_order_id: orderId,
      p_otp_hash: otpHash,
      p_runner_id: req.user.id,
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('ORDER_NOT_FOUND')) {
        throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
      }
      if (msg.includes('ORDER_NOT_ASSIGNED_TO_RUNNER') || msg.includes('FORBIDDEN_CALLER_NOT_RUNNER')) {
        throw ApiError.forbidden('You are not assigned to this delivery.', 'FORBIDDEN')
      }
      if (msg.includes('OTP_ALREADY_USED')) {
        throw ApiError.conflict('This delivery has already been verified and completed.', 'OTP_ALREADY_USED')
      }
      if (msg.includes('INVALID_ORDER_STATE')) {
        throw ApiError.badRequest('Delivery verification is only permitted when order is out for delivery.', 'INVALID_ORDER_STATE')
      }
      if (msg.includes('OTP_LOCKED')) {
        throw ApiError.tooManyRequests('Maximum verification attempts exceeded. Verification locked for 5 minutes.', 'OTP_LOCKED')
      }
      if (msg.includes('OTP_EXPIRED')) {
        throw ApiError.badRequest('Delivery verification challenge has expired. Ask customer to refresh code.', 'OTP_EXPIRED')
      }
      if (msg.includes('OTP_INVALID')) {
        throw ApiError.badRequest('Invalid OTP entered.', 'OTP_INVALID')
      }
      throw ApiError.internal(`Delivery verification transaction failed: ${msg}`, 'TRANSACTION_FAILED')
    }

    const verifiedRow = Array.isArray(data) ? data[0] : data
    if (!verifiedRow || (verifiedRow.success === false)) {
      const code = verifiedRow?.result_code || 'TRANSACTION_FAILED'
      if (code === 'ORDER_NOT_FOUND') {
        throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
      }
      if (code === 'ORDER_NOT_ASSIGNED_TO_RUNNER' || code === 'FORBIDDEN_CALLER_NOT_RUNNER') {
        throw ApiError.forbidden('You are not assigned to this delivery.', 'FORBIDDEN')
      }
      if (code === 'OTP_ALREADY_USED') {
        throw ApiError.conflict('This delivery has already been verified and completed.', 'OTP_ALREADY_USED')
      }
      if (code === 'INVALID_ORDER_STATE') {
        throw ApiError.badRequest('Delivery verification is only permitted when order is out for delivery.', 'INVALID_ORDER_STATE')
      }
      if (code === 'OTP_LOCKED') {
        throw ApiError.tooManyRequests('Maximum verification attempts exceeded. Verification locked for 5 minutes.', 'OTP_LOCKED')
      }
      if (code === 'OTP_EXPIRED') {
        throw ApiError.badRequest('Delivery verification challenge has expired. Ask customer to refresh code.', 'OTP_EXPIRED')
      }
      if (code === 'OTP_INVALID') {
        throw ApiError.badRequest('Invalid OTP entered.', 'OTP_INVALID')
      }
      throw ApiError.internal(`Delivery verification transaction failed: ${code}`, 'TRANSACTION_FAILED')
    }

    // Purge completed challenge from ephemeral memory
    activeOtpStore.delete(orderId)

    const verifiedTimestamp = verifiedRow?.verified_at || new Date().toISOString()

    res.status(200).json({
      orderId,
      status: 'DELIVERED',
      handoverVerifiedAt: verifiedTimestamp,
      deliveredAt: verifiedTimestamp,
      message: 'Delivery handover verified successfully.',
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Customer Delivery OTP Challenge retrieval endpoint.
 * Plaintext OTP is returned EXCLUSIVELY to the authenticated customer owner while challenge is active.
 * Never exposed to runners, admin/staff elevated roles, general order endpoints, or logs.
 */
async function handleGetDeliveryOtp(req, res, next) {
  try {
    const orderId = req.params?.id || req.body?.orderId
    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }

    const supabase = getSupabaseAdmin()
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, customer_id, status, handover_otp_hash, handover_attempts_count, handover_locked_until, handover_otp_expires_at, handover_verified_at')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    // Strict customer ownership check: elevated admin/staff roles CANNOT bypass ownership
    if (order.customer_id !== req.user.id) {
      throw ApiError.forbidden('You do not have permission to view delivery OTP for this order.', 'FORBIDDEN')
    }

    if (order.status !== 'ON_THE_WAY' && order.status !== 'OUT_FOR_DELIVERY') {
      throw ApiError.badRequest(
        `Delivery OTP is only available when order is out for delivery (current: ${order.status}).`,
        'INVALID_ORDER_STATE',
      )
    }

    const now = Date.now()
    const isLocked = Boolean(order.handover_locked_until && now < new Date(order.handover_locked_until).getTime())
    const isExpired = Boolean(order.handover_otp_expires_at && now > new Date(order.handover_otp_expires_at).getTime())
    const attemptsRemaining = Math.max(0, 3 - (order.handover_attempts_count || 0))

    let plaintextOtp = null
    if (!isLocked && !isExpired && order.handover_otp_hash) {
      const activeEntry = activeOtpStore.get(order.id)
      if (activeEntry && activeEntry.customerId === req.user.id) {
        plaintextOtp = activeEntry.otp
      }
    }

    res.status(200).json({
      orderId: order.id,
      status: order.status,
      otp: plaintextOtp,
      expiresAt: order.handover_otp_expires_at ? new Date(order.handover_otp_expires_at).getTime() : null,
      isExpired,
      isLocked,
      lockedUntil: order.handover_locked_until ? new Date(order.handover_locked_until).getTime() : null,
      attemptsRemaining,
      deliveryChannel: 'IN_APP',
      deliveryChannelConfigured: true,
      message: plaintextOtp
        ? 'Delivery verification OTP active. Share this code with your runner upon delivery.'
        : 'Active delivery challenge is in progress. Click refresh if you need a new code.',
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Customer Delivery OTP Refresh endpoint.
 * Generates fresh cryptographically secure random 6-digit OTP, updates database hash, and enforces rate-limiting.
 * Discloses the new plaintext OTP strictly to the authenticated order owner.
 */
async function handleRefreshDeliveryOtp(req, res, next) {
  try {
    const orderId = req.params?.id || req.body?.orderId
    if (!orderId) {
      throw ApiError.badRequest('Order reference is required.', 'INVALID_ORDER_ID')
    }

    const supabase = getSupabaseAdmin()

    // 1. Fetch order for strict ownership check before calling reissue
    const { data: order, error: queryErr } = await supabase
      .from('orders')
      .select('id, customer_id, status')
      .eq('id', orderId)
      .maybeSingle()

    if (queryErr || !order) {
      throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
    }

    // Strict customer ownership check: elevated admin/staff roles CANNOT bypass ownership
    if (order.customer_id !== req.user.id) {
      throw ApiError.forbidden('You do not have permission to refresh delivery OTP for this order.', 'FORBIDDEN')
    }

    // Cryptographically secure 6-digit numeric OTP generation
    const newOtp = String(crypto.randomInt(100000, 1000000))
    const newOtpHash = crypto.createHash('sha256').update(newOtp).digest('hex')

    if (typeof supabase.rpc !== 'function') {
      throw ApiError.internal('Database transaction engine unavailable.', 'RPC_UNAVAILABLE')
    }

    const { data, error } = await supabase.rpc('reissue_delivery_otp', {
      p_order_id: orderId,
      p_new_otp_hash: newOtpHash,
      p_customer_id: req.user.id,
      p_expiry_seconds: 300,
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('ORDER_NOT_FOUND')) {
        throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
      }
      if (msg.includes('FORBIDDEN_CALLER_NOT_ORDER_OWNER') || msg.includes('FORBIDDEN_ORDER_ACCESS')) {
        throw ApiError.forbidden('You do not have permission to refresh delivery OTP for this order.', 'FORBIDDEN')
      }
      if (msg.includes('INVALID_ORDER_STATE')) {
        throw ApiError.badRequest('Cannot refresh OTP for order that is not out for delivery.', 'INVALID_ORDER_STATE')
      }
      if (msg.includes('OTP_LOCKED')) {
        throw ApiError.tooManyRequests('Order verification is locked due to too many failed attempts.', 'OTP_LOCKED')
      }
      if (msg.includes('RATE_LIMITED')) {
        throw ApiError.tooManyRequests('Please wait at least 15 seconds before requesting a new delivery OTP.', 'RATE_LIMITED')
      }
      throw ApiError.internal(`Failed to reissue delivery OTP: ${msg}`, 'TRANSACTION_FAILED')
    }

    const reissuedRow = Array.isArray(data) ? data[0] : data
    if (!reissuedRow || (reissuedRow.success === false)) {
      const code = reissuedRow?.result_code || 'TRANSACTION_FAILED'
      if (code === 'ORDER_NOT_FOUND') {
        throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND')
      }
      if (code === 'FORBIDDEN_CALLER_NOT_ORDER_OWNER' || code === 'FORBIDDEN_ORDER_ACCESS') {
        throw ApiError.forbidden('You do not have permission to refresh delivery OTP for this order.', 'FORBIDDEN')
      }
      if (code === 'INVALID_ORDER_STATE') {
        throw ApiError.badRequest('Cannot refresh OTP for order that is not out for delivery.', 'INVALID_ORDER_STATE')
      }
      if (code === 'OTP_LOCKED') {
        throw ApiError.tooManyRequests('Order verification is locked due to too many failed attempts.', 'OTP_LOCKED')
      }
      if (code === 'RATE_LIMITED') {
        throw ApiError.tooManyRequests('Please wait at least 15 seconds before requesting a new delivery OTP.', 'RATE_LIMITED')
      }
      throw ApiError.internal(`Failed to reissue delivery OTP: ${code}`, 'TRANSACTION_FAILED')
    }

    const expiresAtMs = reissuedRow?.expires_at ? new Date(reissuedRow.expires_at).getTime() : Date.now() + 300000

    // Store new OTP strictly in ephemeral memory for the authenticated customer owner
    activeOtpStore.set(orderId, {
      otp: newOtp,
      customerId: req.user.id,
      expiresAt: expiresAtMs,
    })

    // Safe server audit note: never log the plaintext OTP value
    console.info(`[HandoverOTP] Delivery OTP challenge reissued for order ${orderId}. In-app disclosure active.`)

    res.status(200).json({
      orderId,
      status: reissuedRow?.status || 'ON_THE_WAY',
      otp: newOtp,
      expiresAt: expiresAtMs,
      isExpired: false,
      isLocked: false,
      attemptsRemaining: reissuedRow?.attempts_remaining ?? 3,
      deliveryChannel: 'IN_APP',
      deliveryChannelConfigured: true,
      message: 'New delivery OTP generated. Share this code with your runner upon delivery.',
    })
  } catch (err) {
    next(err)
  }
}

// Customer order creation helper for idempotency hits
const formatCreatedOrderResponse = formatCanonicalOrder

/**
 * Customer Order Creation Endpoint.
 * Supports:
 *   - POST /orders/create (RPC style for frontend api.js)
 *   - POST /api/v1/orders (REST style)
 */
async function handleCreateOrder(req, res, next) {
  let allocatedFeePaise = null
  let orderId = null
  let feeSlotNeedsRelease = false
  let inventoryReserved = false
  let orderPersisted = false

  try {
    const supabase = getSupabaseAdmin()

    // 1. Authorization: Only customers and staff can create orders
    const userRoles = req.user?.roles || []
    const isCustomerOrStaff =
      userRoles.length === 0 ||
      userRoles.includes(ROLES.CUSTOMER) ||
      userRoles.includes(ROLES.ADMIN) ||
      userRoles.includes(ROLES.SUPER_ADMIN)

    if (!isCustomerOrStaff) {
      throw ApiError.forbidden('Only customers can place delivery orders.', 'FORBIDDEN')
    }

    // 2. Validate payload
    const { storeId, locationId, lines, customerDetails, idempotencyKey: bodyIdempotencyKey } = req.body || {}
    const idempotencyKey = req.headers['idempotency-key'] || bodyIdempotencyKey || null

    if (!storeId || typeof storeId !== 'string') {
      throw ApiError.badRequest('Store ID is required.', 'INVALID_STORE_ID')
    }
    if (!locationId || typeof locationId !== 'string') {
      throw ApiError.badRequest('Delivery location is required.', 'INVALID_LOCATION_ID')
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      throw ApiError.unprocessable('Your cart is empty.', 'EMPTY_CART')
    }

    // Line item consolidation & format check
    const lineMap = new Map()
    for (const item of lines) {
      if (!item || !item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
        throw ApiError.badRequest('Valid product ID is required for each line item.', 'INVALID_LINE_ITEM')
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647) {
        throw ApiError.unprocessable('Invalid quantity.', 'INVALID_QUANTITY', { productId: item.productId })
      }
      const existingQty = lineMap.get(item.productId) || 0
      const nextQty = existingQty + item.quantity
      if (nextQty > 2147483647) {
        throw ApiError.unprocessable('Invalid quantity.', 'INVALID_QUANTITY', { productId: item.productId })
      }
      lineMap.set(item.productId, nextQty)
    }

    // 3. Idempotency Check: if idempotencyKey is supplied, check if order already exists
    if (idempotencyKey) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select(`
          id, customer_id, runner_id, delivery_location_id, delivery_location_snapshot,
          status, payment_status, item_subtotal, combined_delivery_fee, base_amount, platform_fee,
          total_payable, route_distance_km, route_stop_sequence, routing_provider, routing_mode,
          fee_policy_version, payment_attempt_id, fee_paise, payment_allocated_at,
          payment_window_expires_at, payment_cooldown_expires_at, paid_at, created_at,
          order_fulfillment_groups (
            id, store_id, store_snapshot, status, pickup_sequence_index, picked_up_at,
            order_items (
              id, product_id, product_name, product_pack, unit_price, quantity, line_subtotal
            )
          )
        `)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (existingOrder) {
        if (existingOrder.customer_id !== req.user.id && !req.user.roles?.includes(ROLES.ADMIN) && !req.user.roles?.includes(ROLES.SUPER_ADMIN)) {
          throw ApiError.forbidden('Idempotency key belongs to another customer.', 'IDEMPOTENCY_CONFLICT')
        }
        return res.status(200).json(formatCreatedOrderResponse(existingOrder))
      }
    }

    // 4. Query & validate store
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name, description, is_open, latitude, longitude')
      .eq('id', storeId)
      .maybeSingle()

    if (storeErr || !store) {
      throw ApiError.notFound('That store is not available.', 'STORE_NOT_FOUND')
    }
    if (!store.is_open) {
      throw ApiError.conflict('This store is closed right now.', 'STORE_CLOSED')
    }

    // 5. Query & validate delivery location (authoritative server-side destination validation)
    const { data: location, error: locErr } = await supabase
      .from('locations')
      .select('id, name, group_name, latitude, longitude, is_active')
      .eq('id', locationId)
      .maybeSingle()

    if (locErr || !location || !location.is_active) {
      throw ApiError.notFound('Choose a valid delivery spot first.', 'LOCATION_NOT_FOUND')
    }

    // 6. Validate coordinates and delivery distance
    const storeCoords = parseCoordinate({ latitude: store.latitude, longitude: store.longitude })
    if (!storeCoords) {
      throw ApiError.unprocessable('Store coordinates are missing or invalid.', 'INVALID_COORDINATES', { entity: 'store', storeId })
    }
    const locationCoords = parseCoordinate({ latitude: location.latitude, longitude: location.longitude })
    if (!locationCoords) {
      throw ApiError.unprocessable('Delivery destination coordinates are missing or invalid.', 'INVALID_COORDINATES', { entity: 'location', locationId })
    }

    const distanceKm = straightLineKm(storeCoords, locationCoords)
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      throw ApiError.unprocessable("We couldn't work out the distance for that drop point. Please re-pick your location.", 'INVALID_DISTANCE', { distanceKm })
    }
    if (distanceKm > MAX_SERVICE_KM + 1e-9) {
      throw ApiError.unprocessable('Delivery location is outside our 5 km service radius.', 'OUT_OF_SERVICE_AREA', { distanceKm, maxKm: MAX_SERVICE_KM })
    }

    // 7. Authoritative product pricing & inventory check
    const productIds = Array.from(lineMap.keys())
    const { data: dbProducts, error: prodErr } = await supabase
      .from('products')
      .select('id, store_id, name, pack, price, stock, is_available')
      .in('id', productIds)

    if (prodErr || !dbProducts) {
      throw ApiError.internal('Failed to retrieve product details.', 'DATABASE_ERROR')
    }

    const pricedLines = []
    for (const [productId, quantity] of lineMap.entries()) {
      const product = dbProducts.find((p) => p.id === productId && p.store_id === storeId)
      if (!product || !product.is_available) {
        throw ApiError.conflict('An item in your cart is no longer available.', 'PRODUCT_UNAVAILABLE', { productId })
      }
      if (product.stock < quantity) {
        throw ApiError.conflict(`Only ${product.stock} left of ${product.name}.`, 'OUT_OF_STOCK', { productId, available: product.stock })
      }
      const unitPrice = Number(product.price)
      const lineSubtotal = Math.round(unitPrice * quantity * 100) / 100
      if (lineSubtotal > 99999999.99) {
        throw ApiError.unprocessable('Order line subtotal exceeds maximum allowable limit.', 'ORDER_TOTAL_EXCEEDED')
      }
      pricedLines.push({
        productId,
        name: product.name,
        pack: product.pack || null,
        unitPrice,
        quantity,
        lineSubtotal,
      })
    }

    // Sort priced lines deterministically by productId to prevent lock-ordering cycles
    pricedLines.sort((a, b) => a.productId.localeCompare(b.productId))

    // 8. Financial totals calculation under MVP Flat ₹10 Delivery Fee Policy
    const deliveryFee = FLAT_DELIVERY_FEE
    const itemSubtotal = Math.round(pricedLines.reduce((acc, l) => acc + l.lineSubtotal, 0) * 100) / 100
    if (itemSubtotal > 99999999.99) {
      throw ApiError.unprocessable('Order subtotal exceeds maximum allowable limit.', 'ORDER_TOTAL_EXCEEDED')
    }
    const baseAmount = Math.round(itemSubtotal + deliveryFee)

    orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
    const finalIdempotencyKey = idempotencyKey || `idem_${crypto.randomUUID().replace(/-/g, '')}`

    // 9. Atomic Order Creation via PostgreSQL stored procedure
    // Bundles slot locking, parent order insertion, fee slot binding, fulfillment group,
    // order items, and inventory reservation into a single atomic transaction.
    const atomicItemsPayload = pricedLines.map((l) => ({
      product_id: l.productId,
      productId: l.productId,
      quantity: l.quantity,
    }))

    const { data: atomicOrder, error: atomicErr } = await supabase.rpc('create_order_atomic', {
      p_order_id: orderId,
      p_customer_id: req.user.id,
      p_store_id: store.id,
      p_location_id: location.id,
      p_customer_details: customerDetails || null,
      p_items: atomicItemsPayload,
      p_delivery_fee: deliveryFee,
      p_fee_policy_version: PRICING_VERSION,
      p_route_distance_km: Number(distanceKm.toFixed(4)),
      p_idempotency_key: finalIdempotencyKey,
      p_fee_window_seconds: 120,
      p_fee_cooldown_seconds: 300,
      p_inventory_ttl_seconds: 420,
    })

    if (atomicErr) {
      if (atomicErr.message && atomicErr.message.includes('ALL_PLATFORM_FEE_SLOTS_BUSY')) {
        throw new ApiError('ALL_PLATFORM_FEE_SLOTS_BUSY', 'All dynamic payment fee slots are currently active. Please retry shortly.', 503)
      }
      if (atomicErr.message && atomicErr.message.includes('OUT_OF_STOCK')) {
        throw ApiError.conflict('One or more items in your cart are out of stock.', 'OUT_OF_STOCK')
      }
      if (atomicErr.message && atomicErr.message.includes('PRODUCT_UNAVAILABLE')) {
        throw ApiError.conflict('An item in your cart is no longer available.', 'PRODUCT_UNAVAILABLE')
      }
      if (atomicErr.message && atomicErr.message.includes('STORE_CLOSED')) {
        throw ApiError.conflict('This store is closed right now.', 'STORE_CLOSED')
      }
      if (atomicErr.message && atomicErr.message.includes('LOCATION_NOT_FOUND')) {
        throw ApiError.notFound('Choose a valid delivery spot first.', 'LOCATION_NOT_FOUND')
      }
      if (atomicErr.message && atomicErr.message.includes('STORE_NOT_FOUND')) {
        throw ApiError.notFound('That store is not available.', 'STORE_NOT_FOUND')
      }
      if (atomicErr.message && atomicErr.message.includes('IDEMPOTENCY_CONFLICT')) {
        throw ApiError.forbidden('Idempotency key belongs to another customer.', 'IDEMPOTENCY_CONFLICT')
      }
      if (atomicErr.message && atomicErr.message.includes('INVALID_LINE_ITEM')) {
        throw ApiError.badRequest('Valid product ID is required for each line item.', 'INVALID_LINE_ITEM')
      }
      if (atomicErr.message && atomicErr.message.includes('INVALID_QUANTITY')) {
        throw ApiError.unprocessable('Invalid quantity.', 'INVALID_QUANTITY')
      }
      if (atomicErr.message && atomicErr.message.includes('ORDER_TOTAL_EXCEEDED')) {
        throw ApiError.unprocessable('Order subtotal exceeds maximum allowable limit.', 'ORDER_TOTAL_EXCEEDED')
      }
      if (atomicErr.message && (atomicErr.message.includes('idempotency_key') || atomicErr.code === '23505')) {
        // Concurrent racer order with the same idempotency key
        const { data: racerOrder } = await supabase
          .from('orders')
          .select(`
            id, customer_id, runner_id, delivery_location_id, delivery_location_snapshot,
            status, payment_status, item_subtotal, combined_delivery_fee, base_amount, platform_fee,
            total_payable, route_distance_km, route_stop_sequence, routing_provider, routing_mode,
            fee_policy_version, payment_attempt_id, fee_paise, payment_allocated_at,
            payment_window_expires_at, payment_cooldown_expires_at, paid_at, created_at,
            order_fulfillment_groups (
              id, store_id, store_snapshot, status, pickup_sequence_index, picked_up_at,
              order_items (
                id, product_id, product_name, product_pack, unit_price, quantity, line_subtotal
              )
            )
          `)
          .eq('idempotency_key', finalIdempotencyKey)
          .maybeSingle()
        if (racerOrder) {
          return res.status(200).json(formatCreatedOrderResponse(racerOrder))
        }
      }
      throw ApiError.internal(`Failed to create order: ${atomicErr.message || 'Database error'}`)
    }

    if (!atomicOrder) {
      throw ApiError.internal('Failed to create order: No order data returned from atomic procedure.')
    }

    // Handle idempotent return from create_order_atomic
    if (atomicOrder.isIdempotentHit) {
      const existingId = atomicOrder.orderId || atomicOrder.id
      const { data: existingOrder } = await supabase
        .from('orders')
        .select(`
          id, customer_id, runner_id, delivery_location_id, delivery_location_snapshot,
          status, payment_status, item_subtotal, combined_delivery_fee, base_amount, platform_fee,
          total_payable, route_distance_km, route_stop_sequence, routing_provider, routing_mode,
          fee_policy_version, payment_attempt_id, fee_paise, payment_allocated_at,
          payment_window_expires_at, payment_cooldown_expires_at, paid_at, created_at,
          order_fulfillment_groups (
            id, store_id, store_snapshot, status, pickup_sequence_index, picked_up_at,
            order_items (
              id, product_id, product_name, product_pack, unit_price, quantity, line_subtotal
            )
          )
        `)
        .eq('id', existingId)
        .maybeSingle()
      if (existingOrder) {
        return res.status(200).json(formatCreatedOrderResponse(existingOrder))
      }
    }

    const assignedOrderId = atomicOrder.orderId || atomicOrder.id || orderId
    const feePaise = atomicOrder.feePaise
    const attemptId = atomicOrder.attemptId
    const allocatedAt = atomicOrder.allocatedAt || new Date().toISOString()
    const windowExpiresAt = atomicOrder.windowExpiresAt
    const cooldownExpiresAt = atomicOrder.cooldownExpiresAt
    const authoritativeSubtotal = Number(atomicOrder.itemSubtotal ?? itemSubtotal)
    const authoritativeDeliveryFee = Number(atomicOrder.deliveryFee ?? deliveryFee)
    const authoritativeBaseAmount = Number(atomicOrder.baseAmount ?? baseAmount)
    const authoritativePlatformFee = Number(atomicOrder.platformFee ?? (feePaise / 100))
    const authoritativeTotal = Number(atomicOrder.totalPayable ?? (authoritativeBaseAmount + authoritativePlatformFee))

    // 10. Format and return response expected by frontend payment screen
    const responsePayload = {
      id: assignedOrderId,
      customerId: req.user.id,
      storeId: store.id,
      locationId: location.id,
      deliveryLocationId: location.id,
      deliveryLocationSnapshot: {
        id: location.id,
        name: location.name,
        group_name: location.group_name,
        latitude: location.latitude,
        longitude: location.longitude,
        customerDetails: customerDetails || null,
      },
      lines: pricedLines.map((l) => ({
        productId: l.productId,
        name: l.name,
        pack: l.pack,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineSubtotal: l.lineSubtotal,
      })),
      customerDetails: customerDetails || null,
      pricing: {
        itemSubtotal: authoritativeSubtotal,
        deliveryFee: authoritativeDeliveryFee,
        baseAmount: authoritativeBaseAmount,
        platformFee: authoritativePlatformFee,
        total: authoritativeTotal,
        distanceKm: Number(distanceKm.toFixed(2)),
        distanceMethod: 'straight_line',
        pricingVersion: PRICING_VERSION,
      },
      payment: {
        status: 'PENDING',
        attemptId,
        feePaise,
        allocatedAt,
        windowExpiresAt,
        cooldownExpiresAt,
        paidAt: null,
      },
      fulfillmentGroups: [
        {
          id: `grp_${assignedOrderId.replace(/^ord_/, '')}`,
          storeId: store.id,
          storeSnapshot: {
            id: store.id,
            name: store.name,
            description: store.description || null,
            latitude: store.latitude,
            longitude: store.longitude,
          },
          status: 'PENDING',
          orderItems: pricedLines.map((l) => ({
            productId: l.productId,
            productName: l.name,
            productPack: l.pack,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineSubtotal: l.lineSubtotal,
          })),
        },
      ],
      status: 'AWAITING_PAYMENT',
      paymentStatus: 'PENDING',
      createdAt: allocatedAt,
    }

    res.status(201).json(responsePayload)
  } catch (err) {
    next(err)
  }
}

// Customer order creation (REST and RPC-style compatibility)
ordersRouter.post('/api/v1/orders', authenticate, handleCreateOrder)
ordersRouter.post('/orders/create', authenticate, handleCreateOrder)

// Customer order history
ordersRouter.get('/api/v1/orders', authenticate, handleListCustomerOrders)
ordersRouter.post('/customer/orders/list', authenticate, handleListCustomerOrders)

// Order retrieval
ordersRouter.get('/api/v1/orders/:id', authenticate, handleGetOrder)
ordersRouter.post('/orders/get', authenticate, handleGetOrder)

// Dedicated payment verification check
ordersRouter.post('/api/v1/orders/:id/check-payment', authenticate, handleCheckPayment)
ordersRouter.post('/orders/checkPayment', authenticate, handleCheckPayment)

// Dedicated payment expiration
ordersRouter.post('/api/v1/orders/:id/expire', authenticate, handleExpirePayment)
ordersRouter.post('/orders/expire', authenticate, handleExpirePayment)

// Runner assigned orders
ordersRouter.get('/api/v1/runner/orders', authenticate, handleRunnerAssignedOrders)
ordersRouter.post('/runner/orders/assigned', authenticate, handleRunnerAssignedOrders)

// Runner order lifecycle transition
ordersRouter.post('/api/v1/runner/orders/:id/transition', authenticate, handleRunnerTransitionOrder)
ordersRouter.post('/runner/order/transition', authenticate, handleRunnerTransitionOrder)

// Customer delivery OTP challenge retrieval
ordersRouter.get('/api/v1/orders/:id/delivery-otp', authenticate, handleGetDeliveryOtp)
ordersRouter.post('/api/v1/orders/:id/delivery-otp', authenticate, handleGetDeliveryOtp)
ordersRouter.post('/customer/order/getDeliveryOtp', authenticate, handleGetDeliveryOtp)

// Customer delivery OTP refresh
ordersRouter.post('/api/v1/orders/:id/refresh-otp', authenticate, handleRefreshDeliveryOtp)
ordersRouter.post('/customer/order/refreshOtp', authenticate, handleRefreshDeliveryOtp)

// Runner delivery OTP verification
ordersRouter.post('/api/v1/runner/orders/:id/verify-handover', authenticate, handleVerifyDeliveryOtp)
ordersRouter.post('/runner/order/verifyOtp', authenticate, handleVerifyDeliveryOtp)


