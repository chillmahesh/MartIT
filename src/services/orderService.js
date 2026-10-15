import { request } from './api'

export const orderService = {
  /**
   * Sends product IDs and quantities ONLY. The server re-prices items, re-checks stock,
   * recalculates the delivery fee and snapshots it on the order.
   */
  create: ({ storeId, locationId, lines, customerDetails }) =>
    request('orders.create', {
      storeId,
      locationId,
      lines: lines.map(({ productId, quantity }) => ({ productId, quantity })),
      customerDetails,
    }),

  /**
   * Retrieves an authoritative order by reference ID.
   */
  get: (orderId) => request('orders.get', { orderId }),

  /**
   * Requests server-authoritative payment verification for an order.
   */
  checkPayment: (orderId) => request('orders.checkPayment', { orderId }),

  /**
   * Dedicated atomic payment expiration for an order.
   */
  expire: (orderId) => request('orders.expire', { orderId }),

  /**
   * Explicitly retries payment for an expired order by allocating a new dynamic platform fee.
   */
  retryPayment: (orderId) => request('orders.retryPayment', { orderId }),

  /**
   * Retrieves delivery OTP verification challenge for an authenticated customer's order.
   */
  getDeliveryOtp: (orderId) => request('customer.order.getDeliveryOtp', { orderId }),

  /**
   * Requests a fresh delivery OTP challenge for the authenticated customer's order.
   */
  refreshDeliveryOtp: (orderId) => request('customer.order.refreshOtp', { orderId }),

  /**
   * Lists authoritative orders belonging to the authenticated customer.
   */
  listMyOrders: () => request('customer.orders.list'),
}

