import { request } from './api'

/** Admin console calls. The server enforces permissions on every one of these. */
export const adminService = {
  listUsers: () => request('admin.users.list'),
  setRunnerStatus: (userId, status) => request('admin.runners.setStatus', { userId, status }),
  setRole: (userId, role, granted) => request('admin.roles.set', { userId, role, granted }),
  listOrders: (filters = {}) => request('admin.orders.list', filters),
  updateStore: (storeId, updates) => request('stores.update', { storeId, ...updates }),
  updateProduct: (productId, updates) => request('catalogue.products.update', { productId, ...updates }),
}
