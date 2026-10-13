import { request } from './api'

export const runnerService = {
  /**
   * Retrieves active, available, and assigned orders for the authenticated runner.
   * Maps to POST /runner/orders/assigned on the backend, or runner.orders.assigned in mock mode.
   */
  getAssignedOrders: () => request('runner.orders.assigned'),
}
