/**
 * MOCK SERVER — stands in for the backend until Base44 / a real API is connected.
 * Everything here models what the server must do: it never trusts prices, fees or
 * totals sent by the browser, and it derives the user from the session token.
 */
import { calculateDeliveryFee, splitDeliveryFee, DELIVERY_FEE_MESSAGES } from '@/utils/deliveryFee'
import { calculateOrderTotals } from '@/utils/orderTotals'
import { ORDER_STATUS, transitionOrder } from '@/utils/orderMachine'
import { PAYMENT_STATUS, PAYMENT_SOURCE, transitionPayment } from '@/utils/paymentMachine'
import { SAMPLE_CATEGORIES } from '@/mocks/categories'
import { SAMPLE_ORDERS } from '@/mocks/orders'
import { createDb } from './db'
import { ApiError } from './errors'
import { getDistanceKm } from './routing'
import { PERMISSIONS, ROLES, hasPermission } from '@/utils/permissions'

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone ?? null,
  roles: [...u.roles],
  runnerStatus: u.runnerStatus ?? null,
  defaultLocationId: u.defaultLocationId ?? null,
})

const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

export function createMockServer({ routingProvider = null } = {}) {
  const db = createDb()

  function requireUser(token) {
    const userId = token && db.sessions.get(token)
    const user = userId && db.users.find((u) => u.id === userId)
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Please log in again.', 401)
    return user
  }

  function requirePermission(token, permission) {
    const user = requireUser(token)
    if (!hasPermission(user, permission)) throw new ApiError('FORBIDDEN', "You don't have access to do that.", 403)
    return user
  }

  const findUser = (id) => {
    const u = db.users.find((x) => x.id === id)
    if (!u) throw new ApiError('USER_NOT_FOUND', 'User not found.', 404)
    return u
  }

  async function computeDeliveryQuote(storeId, locationId) {
    const store = db.stores.find((s) => s.id === storeId)
    if (!store) throw new ApiError('STORE_NOT_FOUND', 'That store is not available.', 404)
    if (!store.isOpen) throw new ApiError('STORE_CLOSED', 'This store is closed right now.', 409)
    const location = db.locations.find((l) => l.id === locationId)
    if (!location) throw new ApiError('LOCATION_NOT_FOUND', 'Choose a delivery spot first.', 404)

    const { km, method } = await getDistanceKm(store.coords, location.coords, { routingProvider })
    const fee = calculateDeliveryFee(km)
    if (!fee.ok) {
      throw new ApiError(fee.reason, DELIVERY_FEE_MESSAGES[fee.reason], 422, {
        distanceKm: km,
        distanceMethod: method,
        maxKm: fee.maxKm,
      })
    }
    return {
      storeId,
      locationId,
      distanceKm: km,
      distanceMethod: method,
      deliveryFee: fee.fee,
      feeLabel: fee.label,
      pricingVersion: fee.pricingVersion,
    }
  }

  const handlers = {
    // ---- auth (demo only) -------------------------------------------------
    'auth.demoLogin': ({ role }) => {
      const user = db.users.find((u) => u.demoKey === role)
      if (!user) throw new ApiError('NO_DEMO_USER', 'No sample account for that role.', 404)
      const token = newId('tok')
      db.sessions.set(token, user.id)
      return { token, user: publicUser(user) }
    },
    'auth.logout': (_payload, { token }) => {
      db.sessions.delete(token)
      return { ok: true }
    },
    'auth.me': (_payload, { token }) => publicUser(requireUser(token)),
    'auth.forgotPassword': ({ email }) => {
      if (!email || !email.includes('@')) {
        throw new ApiError('INVALID_EMAIL', 'Please provide a valid email address.', 400)
      }
      return { ok: true, message: 'Password recovery email sent (demo simulation).' }
    },

    // ---- admin --------------------------------------------------------------
    'admin.users.list': (_payload, { token }) => {
      requirePermission(token, PERMISSIONS.USERS_READ)
      return db.users.map(publicUser)
    },

    /** Approve or suspend a runner applicant. Approval grants the runner role. */
    'admin.runners.setStatus': ({ userId, status }, { token }) => {
      requirePermission(token, PERMISSIONS.RUNNERS_APPROVE)
      if (!['approved', 'suspended'].includes(status)) throw new ApiError('INVALID_STATUS', 'Invalid runner status.', 422)
      const target = findUser(userId)
      if (target.runnerStatus == null) throw new ApiError('NOT_AN_APPLICANT', 'This user has not applied to be a runner.', 409)
      target.runnerStatus = status
      if (status === 'approved' && !target.roles.includes(ROLES.RUNNER)) target.roles.push(ROLES.RUNNER)
      return publicUser(target)
    },

    /** Grant or revoke a role. Only `roles.assign` (super admin) may do this. */
    'admin.roles.set': ({ userId, role, granted }, { token }) => {
      const actor = requirePermission(token, PERMISSIONS.ROLES_ASSIGN)
      if (!Object.values(ROLES).includes(role)) throw new ApiError('INVALID_ROLE', 'Unknown role.', 422)
      const target = findUser(userId)
      if (!granted && role === ROLES.SUPER_ADMIN) {
        if (target.id === actor.id) throw new ApiError('SELF_DEMOTION', "You can't remove your own super admin role.", 409)
        const remaining = db.users.filter((u) => u.roles.includes(ROLES.SUPER_ADMIN) && u.id !== target.id)
        if (remaining.length === 0) throw new ApiError('LAST_SUPER_ADMIN', 'There must always be at least one super admin.', 409)
      }
      if (role === ROLES.RUNNER && granted) target.runnerStatus = 'approved'
      target.roles = granted ? [...new Set([...target.roles, role])] : target.roles.filter((r) => r !== role)
      return publicUser(target)
    },

    // ---- locations & stores ------------------------------------------------
    'locations.list': () => db.locations.map(({ id, name, group }) => ({ id, name, group })),
    'stores.list': () => db.stores.map(({ id, name, isOpen }) => ({ id, name, isOpen })),

    // ---- catalogue ----------------------------------------------------------
    'catalogue.products': ({ storeId } = {}) => {
      if (storeId) {
        return db.products.filter((p) => p.storeId === storeId)
      }
      return db.products
    },
    'catalogue.categories': () => SAMPLE_CATEGORIES,

    // ---- delivery quote -----------------------------------------------------
    'delivery.quote': ({ storeId, locationId }) => computeDeliveryQuote(storeId, locationId),

    // ---- orders -------------------------------------------------------------
    /**
     * Creates an order from product IDs + quantities only. Any price, fee or total
     * in the payload is ignored; everything is recomputed here and snapshotted so
     * later price/fee changes never alter this order.
     */
    'orders.create': async ({ storeId, locationId, lines, customerDetails }, { token }) => {
      const user = requirePermission(token, PERMISSIONS.SHOP)
      if (!Array.isArray(lines) || lines.length === 0) {
        throw new ApiError('EMPTY_CART', 'Your cart is empty.', 422)
      }

      const pricedLines = lines.map(({ productId, quantity }) => {
        const product = db.products.find((p) => p.id === productId && p.storeId === storeId)
        if (!product) throw new ApiError('PRODUCT_UNAVAILABLE', 'An item in your cart is no longer available.', 409, { productId })
        if (!Number.isInteger(quantity) || quantity < 1) throw new ApiError('INVALID_QUANTITY', 'Invalid quantity.', 422, { productId })
        if (product.stock < quantity) {
          throw new ApiError('OUT_OF_STOCK', `Only ${product.stock} left of ${product.name}.`, 409, { productId, available: product.stock })
        }
        return { productId, name: product.name, pack: product.pack, unitPrice: product.price, quantity }
      })

      const quote = await computeDeliveryQuote(storeId, locationId)

      const orderId = newId('ord')
      let feeAllocation = null

      try {
        // Allocate unique dynamic platform fee (1 paisa - 99 paise)
        feeAllocation = db.feeAllocator.allocate({ orderId })
        const platformFee = feeAllocation.feeRupees

        const totals = calculateOrderTotals({
          lines: pricedLines,
          deliveryFee: quote.deliveryFee,
          platformFee,
        })
        const split = splitDeliveryFee(quote.deliveryFee)

        const order = {
          id: orderId,
          customerId: user.id,
          storeId,
          locationId,
          lines: pricedLines,
          customerDetails: customerDetails || null,
          pricing: {
            itemSubtotal: totals.itemSubtotal,
            deliveryFee: totals.deliveryFee,
            baseAmount: totals.baseAmount,
            platformFee: totals.platformFee,
            total: totals.total,
            distanceKm: quote.distanceKm,
            distanceMethod: quote.distanceMethod,
            pricingVersion: quote.pricingVersion,
          },
          payment: {
            status: PAYMENT_STATUS.PENDING,
            attemptId: feeAllocation.reservation.attemptId,
            feePaise: feeAllocation.feePaise,
            allocatedAt: feeAllocation.reservation.allocatedAt,
            windowExpiresAt: feeAllocation.reservation.windowExpiresAt,
            cooldownExpiresAt: feeAllocation.reservation.cooldownExpiresAt,
            paidAt: null,
          },
          // Internal ledger — never sent to the customer.
          ledger: {
            runnerPayout: split.runnerPayout,
            platformDeliveryShare: split.platformShare,
            storeCommission: null, // separate ledger, not derived from delivery fee
          },
          status: ORDER_STATUS.AWAITING_PAYMENT,
          paymentStatus: PAYMENT_STATUS.PENDING,
          createdAt: new Date().toISOString(),
        }
        db.orders.push(order)
        db.saveOrders?.()

        const { ledger: _ledger, ...customerView } = order
        return customerView
      } catch (err) {
        if (feeAllocation) {
          db.feeAllocator.release?.({ orderId })
        }
        throw err
      }
    },

    /**
     * Retrieves an order by ID. Validates ownership and applies server-authoritative
     * expiry checks based on the dynamic platform fee verification window.
     */
    'orders.get': ({ orderId }, { token }) => {
      const user = requireUser(token)
      if (!orderId) throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      const order = db.orders.find((o) => o.id === orderId)
      if (!order) throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)

      const isOwner = order.customerId === user.id
      const hasStaffAccess =
        user.roles.includes(ROLES.ADMIN) ||
        user.roles.includes(ROLES.SUPER_ADMIN) ||
        user.roles.includes(ROLES.RUNNER)

      if (!isOwner && !hasStaffAccess) {
        throw new ApiError('FORBIDDEN', 'You do not have permission to view this order.', 403)
      }

      // Strictly read-only query: does NOT mutate payment state on GET
      const now = Date.now()
      const isWindowExpired = Boolean(
        order.payment?.windowExpiresAt && now >= order.payment.windowExpiresAt,
      )

      const { ledger: _ledger, ...customerView } = order
      return {
        ...customerView,
        isWindowExpired,
      }
    },

    /**
     * Dedicated atomic payment expiration endpoint.
     */
    'orders.expire': ({ orderId }, { token }) => {
      const user = requireUser(token)
      if (!orderId) throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      const order = db.orders.find((o) => o.id === orderId)
      if (!order) throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)

      const isOwner = order.customerId === user.id
      const hasStaffAccess =
        user.roles.includes(ROLES.ADMIN) || user.roles.includes(ROLES.SUPER_ADMIN)

      if (!isOwner && !hasStaffAccess) {
        throw new ApiError('FORBIDDEN', "You do not have permission to expire this order's payment.", 403)
      }

      if (order.paymentStatus === PAYMENT_STATUS.PAID) {
        throw new ApiError('ALREADY_PAID', 'Cannot expire an order that is already paid.', 409)
      }

      order.paymentStatus = transitionPayment(
        order.paymentStatus,
        PAYMENT_STATUS.EXPIRED,
        PAYMENT_SOURCE.SYSTEM_TIMER,
      )
      if (order.payment) {
        order.payment.status = PAYMENT_STATUS.EXPIRED
      }
      order.status = transitionOrder(order.status, ORDER_STATUS.CANCELLED)
      db.saveOrders?.()

      const { ledger: _ledger, ...customerView } = order
      return {
        order: customerView,
        status: 'expired',
        paymentStatus: PAYMENT_STATUS.EXPIRED,
        message: 'Order payment successfully expired and cancelled.',
      }
    },

    /**
     * Checks payment status and requests verification evidence from the verification adapter.
     * Note: Only server-side evidence ('Payment received') marks payment as PAID.
     * A 'not received' response is inconclusive and directs the customer to support.
     */
    'orders.checkPayment': async ({ orderId }, { token }) => {
      const user = requireUser(token)
      if (!orderId) throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      const order = db.orders.find((o) => o.id === orderId)
      if (!order) throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)

      const isOwner = order.customerId === user.id
      const hasStaffAccess =
        user.roles.includes(ROLES.ADMIN) || user.roles.includes(ROLES.SUPER_ADMIN)
      if (!isOwner && !hasStaffAccess) {
        throw new ApiError('FORBIDDEN', "You do not have permission to check this order's payment.", 403)
      }

      const { ledger: _ledger, ...customerView } = order

      // Already paid
      if (order.paymentStatus === PAYMENT_STATUS.PAID) {
        return {
          order: customerView,
          status: 'verified',
          paymentStatus: PAYMENT_STATUS.PAID,
          message: 'Payment received and verified.',
        }
      }

      // Terminal state guard: EXPIRED, FAILED cannot be overwritten
      if (
        order.paymentStatus === PAYMENT_STATUS.EXPIRED ||
        order.paymentStatus === PAYMENT_STATUS.FAILED
      ) {
        return {
          order: customerView,
          status: 'expired',
          paymentStatus: order.paymentStatus,
          message: 'Payment verification window has expired or order was cancelled.',
        }
      }

      const now = Date.now()

      // Server-authoritative window expiry check
      if (order.payment?.windowExpiresAt && now >= order.payment.windowExpiresAt) {
        if (order.paymentStatus !== PAYMENT_STATUS.EXPIRED) {
          order.paymentStatus = transitionPayment(
            order.paymentStatus,
            PAYMENT_STATUS.EXPIRED,
            PAYMENT_SOURCE.SYSTEM_TIMER,
          )
          if (order.payment) {
            order.payment.status = PAYMENT_STATUS.EXPIRED
          }
          order.status = transitionOrder(order.status, ORDER_STATUS.CANCELLED)
          db.saveOrders?.()
        }
        const { ledger: _l, ...updatedView } = order
        return {
          order: updatedView,
          status: 'expired',
          paymentStatus: PAYMENT_STATUS.EXPIRED,
          message: 'Payment verification window has expired (2 minutes exceeded).',
        }
      }

      // Client check moves PENDING -> PROCESSING
      if (order.paymentStatus === PAYMENT_STATUS.PENDING) {
        order.paymentStatus = transitionPayment(
          order.paymentStatus,
          PAYMENT_STATUS.PROCESSING,
          PAYMENT_SOURCE.CLIENT,
        )
        if (order.payment) {
          order.payment.status = PAYMENT_STATUS.PROCESSING
        }
        db.saveOrders?.()
      }

      // Query mock verification adapter (simulating Make.com reconciliation)
      const verification = db.verificationAdapter.verifyPayment({
        orderId: order.id,
        amount: order.pricing.total,
        allocatedAt: order.payment?.allocatedAt,
        now,
      })

      if (verification.status === 'verified') {
        // Trusted Make.com evidence 'Payment received' transitions payment to PAID
        order.paymentStatus = transitionPayment(
          order.paymentStatus,
          PAYMENT_STATUS.PAID,
          PAYMENT_SOURCE.SERVER_VERIFIED,
        )
        if (order.payment) {
          order.payment.status = PAYMENT_STATUS.PAID
          order.payment.paidAt = now
        }
        order.status = transitionOrder(order.status, ORDER_STATUS.CONFIRMED)
        db.feeAllocator.markPaid({ orderId: order.id, now })
        db.saveOrders?.()

        const { ledger: _l, ...verifiedView } = order
        return {
          order: verifiedView,
          status: 'verified',
          paymentStatus: PAYMENT_STATUS.PAID,
          rawResponse: verification.rawResponse,
          message: verification.message,
        }
      }

      // Inconclusive response ('not received')
      // Reset PROCESSING -> PENDING since window is still active
      if (order.paymentStatus === PAYMENT_STATUS.PROCESSING) {
        order.paymentStatus = transitionPayment(
          order.paymentStatus,
          PAYMENT_STATUS.PENDING,
          PAYMENT_SOURCE.SERVER_VERIFIED,
        )
        if (order.payment) {
          order.payment.status = PAYMENT_STATUS.PENDING
        }
        db.saveOrders?.()
      }

      const { ledger: _l, ...inconclusiveView } = order
      return {
        order: inconclusiveView,
        status: 'inconclusive',
        paymentStatus: order.paymentStatus,
        rawResponse: verification.rawResponse,
        message: verification.message,
      }
    },

    /**
     * Retries payment for an expired order by allocating a new dynamic platform fee.
     * The old expired fee remains held in 5-minute cooldown.
     * Preserves an explicit, auditable attempt history.
     */
    'orders.retryPayment': ({ orderId }, { token }) => {
      const user = requireUser(token)
      if (!orderId) throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      const order = db.orders.find((o) => o.id === orderId)
      if (!order) throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)

      if (order.customerId !== user.id) {
        throw new ApiError('FORBIDDEN', "You do not have permission to retry this order's payment.", 403)
      }

      if (
        order.status !== ORDER_STATUS.AWAITING_PAYMENT ||
        order.paymentStatus === PAYMENT_STATUS.PAID
      ) {
        throw new ApiError('INVALID_STATE', 'This order cannot be retried.', 409)
      }

      const now = Date.now()
      const isExpired =
        order.paymentStatus === PAYMENT_STATUS.EXPIRED ||
        (order.payment?.windowExpiresAt && now >= order.payment.windowExpiresAt)
      if (!isExpired) {
        throw new ApiError('PAYMENT_ACTIVE', 'The current payment window is still active.', 409)
      }

      // Allocate new platform fee for this attempt
      const attemptId = newId('att')
      const newAllocation = db.feeAllocator.allocate({ orderId: order.id, attemptId, now })

      const newTotals = calculateOrderTotals({
        lines: order.lines,
        deliveryFee: order.pricing.deliveryFee,
        platformFee: newAllocation.feeRupees,
      })

      const previousAttempt = {
        attemptId: order.payment?.attemptId || order.id,
        feePaise: order.payment?.feePaise,
        platformFee: order.pricing.platformFee,
        allocatedAt: order.payment?.allocatedAt,
        expiredAt: now,
      }

      order.pricing.platformFee = newTotals.platformFee
      order.pricing.total = newTotals.total

      order.payment = {
        status: PAYMENT_STATUS.PENDING,
        attemptId,
        feePaise: newAllocation.feePaise,
        allocatedAt: newAllocation.reservation.allocatedAt,
        windowExpiresAt: newAllocation.reservation.windowExpiresAt,
        cooldownExpiresAt: newAllocation.reservation.cooldownExpiresAt,
        paidAt: null,
        history: [...(order.payment?.history || []), previousAttempt],
      }
      order.paymentStatus = PAYMENT_STATUS.PENDING

      db.saveOrders?.()

      const { ledger: _ledger, ...customerView } = order
      return customerView
    },

    // ---- runner orders ------------------------------------------------------
    /**
     * Lists assigned and available delivery orders for an authenticated runner.
     * Requires the runner.deliver permission (approved runner).
     */
    'runner.orders.assigned': (_payload, { token }) => {
      const user = requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      const source = db.orders.length > 0 ? db.orders : SAMPLE_ORDERS
      return source.filter(
        (o) =>
          o.runnerId === user.id ||
          !o.runnerId ||
          o.status === ORDER_STATUS.CONFIRMED ||
          o.status === ORDER_STATUS.PREPARING ||
          o.status === ORDER_STATUS.PICKED_UP ||
          o.status === ORDER_STATUS.ON_THE_WAY ||
          o.status === ORDER_STATUS.DELIVERED,
      )
    },
    'runner.orders': (_payload, { token }) => {
      requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      return db.orders.length > 0 ? db.orders : SAMPLE_ORDERS
    },
  }

  return {
    db,
    feeAllocator: db.feeAllocator,
    verificationAdapter: db.verificationAdapter,
    recordPaymentEvidence: (orderId, evidence) =>
      db.verificationAdapter.recordEvidence(orderId, evidence),
    async handle(name, payload = {}, ctx = {}) {
      const handler = handlers[name]
      if (!handler) throw new ApiError('NOT_FOUND', `Unknown endpoint ${name}`, 404)
      return handler(payload, ctx)
    },
  }
}
