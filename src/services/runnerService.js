import { request } from './api'

export const runnerService = {
  /**
   * Retrieves active, available, and assigned orders for the authenticated runner.
   * Maps to POST /runner/orders/assigned on the backend, or runner.orders.assigned in mock mode.
   * When isOnline is false, unassigned requests are excluded from results.
   */
  getAssignedOrders: ({ isOnline = true } = {}) =>
    request('runner.orders.assigned', { isOnline }),

  /**
   * Atomically accepts an available delivery request for the current authenticated runner.
   * Prevents duplicate assignment and validates runner availability.
   */
  acceptOrder: (orderId, { isOnline = true } = {}) =>
    request('runner.order.accept', { orderId, isOnline }),

  /**
   * Records pickup confirmation for a specific store in a (potentially multi-store) order.
   * When all stores are picked up, advances order status to PICKED_UP.
   */
  pickupStore: (orderId, storeId) =>
    request('runner.order.pickupStore', { orderId, storeId }),

  /**
   * Transitions an order forward along the permitted state machine lifecycle.
   */
  transitionOrder: (orderId, nextStatus) =>
    request('runner.order.transition', { orderId, nextStatus }),

  /**
   * Submits a 6-digit handover OTP to atomically verify and complete delivery.
   * Enforces runner assignment, order status (ON_THE_WAY), expiry, and lockout limits.
   */
  verifyOtp: (orderId, otp) =>
    request('runner.order.verifyOtp', { orderId, otp }),

  /**
   * Records a delay or operational issue reported by the assigned runner.
   */
  reportDelay: (orderId, { reason, note = '' } = {}) =>
    request('runner.order.reportDelay', { orderId, reason, note }),
}

