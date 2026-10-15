import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { ROLES } from '../utils/permissions.js'

export const ordersRouter = Router()

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
    const isWindowExpired = now >= windowExpiry

    // Format response without internal OTP hash or secrets
    // Notice: does NOT mutate database records on GET request!
    const responseOrder = {
      id: order.id,
      customerId: order.customer_id,
      runnerId: order.runner_id,
      deliveryLocationId: order.delivery_location_id,
      deliveryLocationSnapshot: order.delivery_location_snapshot,
      status: order.status,
      paymentStatus: order.payment_status,
      isWindowExpired,
      pricing: {
        itemSubtotal: Number(order.item_subtotal),
        deliveryFee: Number(order.combined_delivery_fee),
        baseAmount: Number(order.base_amount),
        platformFee: Number(order.platform_fee),
        total: Number(order.total_payable),
        distanceKm: Number(order.route_distance_km),
        pricingVersion: order.fee_policy_version,
      },
      payment: {
        status: order.payment_status,
        attemptId: order.payment_attempt_id,
        feePaise: order.fee_paise,
        allocatedAt: order.payment_allocated_at,
        windowExpiresAt: order.payment_window_expires_at,
        cooldownExpiresAt: order.payment_cooldown_expires_at,
        paidAt: order.paid_at,
      },
      fulfillmentGroups: order.order_fulfillment_groups,
      createdAt: order.created_at,
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

    // 4. Server-verified evidence check (e.g. from payment_records / Make.com webhook)
    const { data: verifiedPayment } = await supabase
      .from('payment_records')
      .select('*')
      .eq('order_id', order.id)
      .eq('evidence', 'Payment received')
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

    // 5. Inconclusive check response ('not received') while window is still active
    return res.status(200).json({
      orderId: order.id,
      status: 'inconclusive',
      paymentStatus: 'PENDING',
      message: 'Payment not received yet. Direct customer to contact admin if money was deducted.',
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
async function executeAtomicPaymentVerification(supabase, orderId) {
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

