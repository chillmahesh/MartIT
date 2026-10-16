/**
 * MOCK SERVER — stands in for the backend until Base44 / a real API is connected.
 * Everything here models what the server must do: it never trusts prices, fees or
 * totals sent by the browser, and it derives the user from the session token.
 */
import { calculateDeliveryFee, splitDeliveryFee, DELIVERY_FEE_MESSAGES } from '@/utils/deliveryFee'
import { calculateOrderTotals } from '@/utils/orderTotals'
import { ORDER_STATUS, canTransitionOrder, transitionOrder } from '@/utils/orderMachine'
import { PAYMENT_STATUS, PAYMENT_SOURCE, transitionPayment } from '@/utils/paymentMachine'
import { SAMPLE_CATEGORIES } from '@/mocks/categories'
import { SAMPLE_ORDERS } from '@/mocks/orders'
import { getOrderStoreIds, getOrderPickups } from '@/utils/runnerOrders'
import { generateOtp, hashOtp, isValidOtpFormat } from '@/utils/cryptoOtp'
import { createDb } from './db'
import { ApiError } from './errors'
import { getDistanceKm } from './routing'
import { DISTANCE_METHOD, straightLineKm } from '@/utils/distance'
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

    let km = null
    let method = DISTANCE_METHOD.STRAIGHT_LINE
    if (store.coords && location.coords) {
      try {
        const distResult = await getDistanceKm(store.coords, location.coords, { routingProvider })
        km = distResult.km
        method = distResult.method
      } catch {
        km = straightLineKm(store.coords, location.coords)
        method = DISTANCE_METHOD.STRAIGHT_LINE
      }
    } else {
      km = 0.5
    }

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

      const { ledger: _ledger, handoverOtpHash: _hash, _mockOtp: _otp, ...customerView } = order
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

    // ---- runner orders & workflow -------------------------------------------
    /**
     * Lists assigned and available delivery orders for an authenticated runner.
     * When isOnline is false, unassigned available requests are not offered.
     */
    'runner.orders.assigned': ({ isOnline = true } = {}, { token }) => {
      const user = requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }
      return db.orders
        .filter((o) => {
          if (o.runnerId === user.id) {
            return (
              o.status === ORDER_STATUS.PREPARING ||
              o.status === ORDER_STATUS.PICKED_UP ||
              o.status === ORDER_STATUS.ON_THE_WAY ||
              o.status === ORDER_STATUS.DELIVERED
            )
          }
          // Unassigned requests: offered only when runner is online
          if (!o.runnerId && o.status === ORDER_STATUS.CONFIRMED) {
            return Boolean(isOnline)
          }
          return false
        })
        .map((o) => {
          const sanitized = structuredClone(o)
          delete sanitized.handoverOtpHash
          delete sanitized._mockOtp
          return sanitized
        })
    },


    /**
     * Accepts a delivery request for the calling runner.
     * Prevents duplicate acceptance, concurrent claims by two runners, and offline acceptance.
     */
    'runner.order.accept': ({ orderId, isOnline = true } = {}, { token }) => {
      const user = requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      if (!orderId) {
        throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      }
      if (isOnline === false) {
        throw new ApiError('RUNNER_OFFLINE', 'Runner must be online to accept delivery requests.', 400)
      }

      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }

      const order = db.orders.find((o) => o.id === orderId)
      if (!order) {
        throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)
      }

      // Check if already accepted by this runner
      if (order.runnerId === user.id) {
        throw new ApiError(
          'ORDER_ALREADY_ACCEPTED',
          'You have already accepted this delivery request.',
          400,
          { orderId },
        )
      }

      // Check if already assigned to someone else
      if (order.runnerId && order.runnerId !== user.id) {
        throw new ApiError(
          'ORDER_ALREADY_ASSIGNED',
          'This delivery request has already been assigned to another runner.',
          409,
          { orderId, assignedRunnerId: order.runnerId },
        )
      }

      // Check if order is available for acceptance (must be CONFIRMED)
      if (order.status !== ORDER_STATUS.CONFIRMED) {
        throw new ApiError(
          'UNAVAILABLE_REQUEST',
          `Order is in ${order.status} status and is no longer available for acceptance.`,
          409,
          { orderId, status: order.status },
        )
      }

      // Atomic transition to PREPARING
      transitionOrder(order.status, ORDER_STATUS.PREPARING)
      order.status = ORDER_STATUS.PREPARING
      order.runnerId = user.id
      order.assignedAt = new Date().toISOString()

      // Multi-store initialization
      const storeIds = getOrderStoreIds(order)
      if (storeIds.length > 0 && (!order.pickups || order.pickups.length === 0)) {
        order.pickups = storeIds.map((sid) => ({
          storeId: sid,
          status: 'PENDING',
          pickedUpAt: null,
        }))
      }

      db.saveOrders?.()
      const { ledger: _ledger, ...customerView } = order
      return customerView
    },

    /**
     * Confirms pickup of an individual store in a (potentially multi-store) order.
     * When all required stores are picked up, advances order status to PICKED_UP.
     */
    'runner.order.pickupStore': ({ orderId, storeId }, { token }) => {
      const user = requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      if (!orderId || !storeId) {
        throw new ApiError('INVALID_INPUT', 'Order ID and Store ID are required.', 400)
      }

      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }

      const order = db.orders.find((o) => o.id === orderId)
      if (!order) {
        throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)
      }
      if (order.runnerId !== user.id) {
        throw new ApiError('FORBIDDEN', 'You are not assigned to this delivery.', 403)
      }
      if (order.status !== ORDER_STATUS.PREPARING) {
        throw new ApiError(
          'INVALID_ORDER_STATE',
          `Store pickups can only be confirmed while order is preparing (current: ${order.status}).`,
          400,
        )
      }

      const storeIds = getOrderStoreIds(order)
      if (!storeIds.includes(storeId)) {
        throw new ApiError('INVALID_STORE', 'Store is not part of this order.', 400)
      }

      if (!order.pickups || order.pickups.length === 0) {
        order.pickups = storeIds.map((sid) => ({
          storeId: sid,
          status: 'PENDING',
          pickedUpAt: null,
        }))
      }

      const pickup = order.pickups.find((p) => p.storeId === storeId)
      if (pickup) {
        pickup.status = 'PICKED_UP'
        pickup.pickedUpAt = new Date().toISOString()
      }

      // Check if all stores are now picked up
      const allPickedUp = order.pickups.every((p) => p.status === 'PICKED_UP')
      if (allPickedUp) {
        transitionOrder(order.status, ORDER_STATUS.PICKED_UP)
        order.status = ORDER_STATUS.PICKED_UP
        order.pickedUpAt = new Date().toISOString()
      }

      db.saveOrders?.()
      const { ledger: _ledger, ...customerView } = order
      return customerView
    },

    /**
     * Transitions an order forward along the state machine.
     * Prevents skipping states, repeating states, incomplete multi-store pickups,
     * and premature delivery without OTP.
     */
    'runner.order.transition': async ({ orderId, nextStatus }, { token }) => {

      const user = requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      if (!orderId || !nextStatus) {
        throw new ApiError('INVALID_INPUT', 'Order ID and target status are required.', 400)
      }

      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }

      const order = db.orders.find((o) => o.id === orderId)
      if (!order) {
        throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)
      }
      if (order.runnerId !== user.id) {
        throw new ApiError('FORBIDDEN', 'You are not assigned to this delivery.', 403)
      }

      if (order.status === nextStatus) {
        throw new ApiError(
          'INVALID_TRANSITION',
          `Order is already in ${nextStatus} status.`,
          400,
        )
      }

      // Multi-store pickup validation
      if (nextStatus === ORDER_STATUS.PICKED_UP) {
        const pickups = getOrderPickups(order)
        if (pickups.length > 1) {
          const pendingPickups = pickups.filter((p) => p.status !== 'PICKED_UP')
          if (pendingPickups.length > 0) {
            throw new ApiError(
              'PICKUPS_INCOMPLETE',
              `All store pickups must be complete before marking order as picked up. Pending stores: ${pendingPickups.map((p) => p.storeName).join(', ')}.`,
              400,
              { pendingStoreIds: pendingPickups.map((p) => p.storeId) },
            )
          }
        } else if (order.pickups && order.pickups.length === 1) {
          order.pickups[0].status = 'PICKED_UP'
          order.pickups[0].pickedUpAt = new Date().toISOString()
        }
      }

      // OTP verification restriction in Milestone 2
      if (nextStatus === ORDER_STATUS.DELIVERED) {
        throw new ApiError(
          'OTP_VERIFICATION_REQUIRED',
          'Customer OTP verification is required to complete delivery (Milestone 3).',
          400,
        )
      }

      // State machine validation
      if (!canTransitionOrder(order.status, nextStatus)) {
        throw new ApiError(
          'INVALID_TRANSITION',
          `Illegal order transition: cannot transition from ${order.status} to ${nextStatus}.`,
          400,
        )
      }

      transitionOrder(order.status, nextStatus)
      order.status = nextStatus

      if (nextStatus === ORDER_STATUS.PICKED_UP) {
        order.pickedUpAt = new Date().toISOString()
      } else if (nextStatus === ORDER_STATUS.ON_THE_WAY) {
        order.departedAt = new Date().toISOString()
        const otp = generateOtp()
        const otpHash = await hashOtp(otp)
        order.handoverOtpHash = otpHash
        order._mockOtp = otp
        order.handoverOtpExpiresAt = Date.now() + 5 * 60 * 1000
        order.handoverAttemptsCount = 0
        order.handoverLockedUntil = null
        order.handoverVerifiedAt = null
        order.lastOtpGeneratedAt = Date.now()
      }

      db.saveOrders?.()
      const { ledger: _ledger, ...customerView } = order
      return customerView
    },

    /**
     * Atomically verifies the customer delivery OTP and marks the order DELIVERED.
     * Enforces assigned runner authorization, ON_THE_WAY state, exact 6 digits,
     * SHA-256 hash matching, 5-minute expiry, and 3-attempt lockout.
     */
    'runner.order.verifyOtp': async ({ orderId, otp }, { token }) => {
      const user = requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      if (!orderId) {
        throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      }

      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }

      const order = db.orders.find((o) => o.id === orderId)
      if (!order) {
        throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)
      }

      // 1. Caller must be the assigned runner
      if (order.runnerId !== user.id) {
        throw new ApiError('FORBIDDEN', 'You are not assigned to this delivery.', 403)
      }

      // 2. Order must be ON_THE_WAY
      if (order.status !== ORDER_STATUS.ON_THE_WAY) {
        if (order.status === ORDER_STATUS.DELIVERED) {
          throw new ApiError('OTP_ALREADY_USED', 'This delivery has already been verified and completed.', 409)
        }
        throw new ApiError(
          'INVALID_ORDER_STATE',
          `Delivery verification is only permitted when order is out for delivery (current: ${order.status}).`,
          400,
        )
      }

      // 3. Challenge must not be already consumed
      if (order.handoverVerifiedAt) {
        throw new ApiError('OTP_ALREADY_USED', 'This delivery challenge has already been consumed.', 409)
      }

      const now = Date.now()

      // 4. Lockout check (5 minutes after 3 failed attempts)
      if (order.handoverLockedUntil && now < order.handoverLockedUntil) {
        const remainingSeconds = Math.ceil((order.handoverLockedUntil - now) / 1000)
        throw new ApiError(
          'OTP_LOCKED',
          `Verification is locked due to too many failed attempts. Try again in ${Math.ceil(remainingSeconds / 60)} minute(s).`,
          429,
          { lockedUntil: order.handoverLockedUntil, remainingSeconds },
        )
      }

      // 5. Expiry check (5-minute window)
      if (order.handoverOtpExpiresAt && now > order.handoverOtpExpiresAt) {
        throw new ApiError(
          'OTP_EXPIRED',
          'Delivery OTP has expired. Please ask the customer to refresh their code.',
          410,
        )
      }


      // 6. Format validation: exactly 6 numeric digits
      if (!isValidOtpFormat(otp)) {
        throw new ApiError(
          'OTP_INVALID_FORMAT',
          'OTP must contain exactly 6 numeric digits.',
          400,
        )
      }

      // 7. Hash comparison
      const submittedHash = await hashOtp(otp)
      if (!order.handoverOtpHash || submittedHash !== order.handoverOtpHash) {
        order.handoverAttemptsCount = (order.handoverAttemptsCount || 0) + 1
        if (order.handoverAttemptsCount >= 3) {
          order.handoverLockedUntil = now + 5 * 60 * 1000 // Lock for 5 minutes
          db.saveOrders?.()
          throw new ApiError(
            'OTP_LOCKED',
            'Maximum verification attempts exceeded. Verification is locked for 5 minutes.',
            429,
            { attemptsRemaining: 0, lockedUntil: order.handoverLockedUntil },
          )
        }

        const remaining = 3 - order.handoverAttemptsCount
        db.saveOrders?.()
        throw new ApiError(
          'OTP_INVALID',
          `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`,
          400,
          { attemptsRemaining: remaining },
        )
      }

      // 8. Atomic verification & transition
      transitionOrder(order.status, ORDER_STATUS.DELIVERED)
      order.status = ORDER_STATUS.DELIVERED
      order.handoverVerifiedAt = new Date().toISOString()
      order.deliveredAt = new Date().toISOString()
      order.handoverOtpHash = null
      order._mockOtp = null

      db.saveOrders?.()
      const { ledger: _ledger, ...customerView } = order
      return customerView
    },

    // ---- customer order & delivery OTP endpoints ----------------------------
    /**
     * Retrieves the delivery OTP challenge for the authenticated customer.
     * Strictly restricted to the order's owner and only when ON_THE_WAY.
     */
    'customer.order.getDeliveryOtp': ({ orderId }, { token }) => {
      const user = requireUser(token)
      if (!orderId) {
        throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      }

      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }

      const order = db.orders.find((o) => o.id === orderId)
      if (!order) {
        throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)
      }

      if (order.customerId !== user.id) {
        throw new ApiError('FORBIDDEN', 'You do not have permission to view delivery OTP for this order.', 403)
      }

      if (order.status !== ORDER_STATUS.ON_THE_WAY) {
        throw new ApiError('OTP_NOT_AVAILABLE', 'Delivery OTP is only available when the order is out for delivery.', 400)
      }

      const now = Date.now()
      const isLocked = Boolean(order.handoverLockedUntil && now < order.handoverLockedUntil)
      const isExpired = Boolean(order.handoverOtpExpiresAt && now > order.handoverOtpExpiresAt)

      return {
        orderId: order.id,
        otp: isLocked || isExpired ? null : (order._mockOtp || '724915'),
        expiresAt: order.handoverOtpExpiresAt || (now + 300000),
        isLocked,
        lockedUntil: order.handoverLockedUntil || null,
        isExpired,
        isDemoMode: true,
        demoMode: true,
        attemptsRemaining: Math.max(0, 3 - (order.handoverAttemptsCount || 0)),
      }
    },

    /**
     * Customer refresh/resend endpoint for delivery OTP.
     * Generates a fresh challenge without resetting active lockouts.
     */
    'customer.order.refreshOtp': async ({ orderId }, { token }) => {
      const user = requireUser(token)
      if (!orderId) {
        throw new ApiError('INVALID_ORDER_ID', 'Order reference is required.', 400)
      }

      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }

      const order = db.orders.find((o) => o.id === orderId)
      if (!order) {
        throw new ApiError('ORDER_NOT_FOUND', 'Order not found.', 404)
      }

      if (order.customerId !== user.id) {
        throw new ApiError('FORBIDDEN', 'You do not have permission to refresh OTP for this order.', 403)
      }

      if (order.status !== ORDER_STATUS.ON_THE_WAY) {
        throw new ApiError('OTP_NOT_AVAILABLE', 'Delivery OTP can only be refreshed when order is out for delivery.', 400)
      }

      const now = Date.now()
      // Lockout persistence: resend must NOT clear active lockout!
      if (order.handoverLockedUntil && now < order.handoverLockedUntil) {
        const remainingSeconds = Math.ceil((order.handoverLockedUntil - now) / 1000)
        throw new ApiError(
          'OTP_LOCKED',
          `Cannot regenerate OTP while verification is locked. Try again in ${Math.ceil(remainingSeconds / 60)} minute(s).`,
          429,
          { lockedUntil: order.handoverLockedUntil, remainingSeconds },
        )
      }

      // Rate limit resend (minimum 5s in demo)
      if (order.lastOtpGeneratedAt && now - order.lastOtpGeneratedAt < 5000) {
        throw new ApiError('OTP_RATE_LIMITED', 'Please wait before requesting another OTP.', 429)
      }

      const newOtp = generateOtp()
      const newHash = await hashOtp(newOtp)

      order.handoverOtpHash = newHash
      order._mockOtp = newOtp
      order.handoverOtpExpiresAt = now + 5 * 60 * 1000
      order.handoverAttemptsCount = 0
      order.lastOtpGeneratedAt = now

      db.saveOrders?.()

      return {
        orderId: order.id,
        otp: newOtp,
        expiresAt: order.handoverOtpExpiresAt,
        isDemoMode: true,
        demoMode: true,
      }
    },

    /**
     * Lists orders belonging to the authenticated customer.
     */
    'customer.orders.list': (_payload, { token }) => {
      const user = requireUser(token)
      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }
      return db.orders
        .filter((o) => o.customerId === user.id)
        .map((o) => {
          const { ledger: _ledger, handoverOtpHash: _hash, _mockOtp: _otp, ...view } = o
          return view
        })
    },

    'runner.orders': (_payload, { token }) => {
      requirePermission(token, PERMISSIONS.RUNNER_DELIVER)
      for (const sample of SAMPLE_ORDERS) {
        if (!db.orders.some((o) => o.id === sample.id)) {
          db.orders.push(structuredClone(sample))
        }
      }
      return db.orders
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
