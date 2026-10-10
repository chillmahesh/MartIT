import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import { ROLES } from '../utils/permissions.js'

export const ordersRouter = Router()

/**
 * GET /api/v1/orders - Authenticated customer's order history
 * Strictly read-only; no state mutations.
 */
ordersRouter.get('/api/v1/orders', authenticate, async (req, res, next) => {
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

    res.status(200).json(orders || [])
  } catch (err) {
    next(err)
  }
})

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

    // 2. Terminal state guard: If already EXPIRED, FAILED, or REFUNDED, prevent late overwrite
    if (['EXPIRED', 'FAILED', 'REFUNDED'].includes(order.payment_status)) {
      return res.status(200).json({
        orderId: order.id,
        status: 'expired',
        paymentStatus: order.payment_status,
        message: 'Payment verification window has expired or order was cancelled.',
      })
    }

    // 3. Server-authoritative 2-minute timer expiry check
    if (now >= windowExpiry) {
      await executeAtomicPaymentExpiry(supabase, order.id)

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

    await executeAtomicPaymentExpiry(supabase, order.id)

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

    res.status(200).json(orders || [])
  } catch (err) {
    next(err)
  }
}

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
