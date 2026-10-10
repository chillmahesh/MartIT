import { setSupabaseAdmin } from '../config/supabase.js'
import { ROLES } from '../utils/permissions.js'

/**
 * Creates an in-memory mock Supabase client for testing Express routes.
 */
export function createMockSupabaseClient({
  users = [],
  profiles = [],
  userRoles = [],
  stores = [],
  locations = [],
  categories = [],
  products = [],
  orders = [],
  platform_fee_reservations = [],
  payment_records = [],
} = {}) {
  const state = {
    users: structuredClone(users),
    profiles: structuredClone(profiles),
    user_roles: structuredClone(userRoles || []),
    stores: structuredClone(stores),
    locations: structuredClone(locations),
    categories: structuredClone(categories),
    products: structuredClone(products),
    orders: structuredClone(orders),
    platform_fee_reservations: structuredClone(platform_fee_reservations),
    payment_records: structuredClone(payment_records),
  }

  const client = {
    auth: {
      async getUser(token) {
        if (!token || token === 'invalid-token') {
          return { data: { user: null }, error: { message: 'Invalid token' } }
        }
        const user = state.users.find((u) => u.token === token)
        if (!user) {
          return { data: { user: null }, error: { message: 'User not found for token' } }
        }
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: { name: user.name },
            },
          },
          error: null,
        }
      },
    },

    from(table) {
      if (state.tableErrors && state.tableErrors[table]) {
        const queryError = { message: state.tableErrors[table] }
        return {
          select() { return this },
          eq() { return this },
          order() { return this },
          limit() { return this },
          async maybeSingle() { return { data: null, error: queryError } },
          async single() { return { data: null, error: queryError } },
          then(resolve) { return resolve({ data: null, error: queryError }) },
        }
      }

      if (!state[table]) {
        state[table] = []
      }
      let currentTableData = state[table]
      let filters = []
      let selectedFields = null
      let isSingle = false
      let pendingUpdate = null
      let isDelete = false

      const query = {
        select(fields) {
          selectedFields = fields
          return query
        },
        eq(column, value) {
          filters.push({ column, value })
          return query
        },
        order() {
          return query
        },
        limit(n) {
          return query
        },
        async maybeSingle() {
          let results = currentTableData.filter((row) =>
            filters.every((f) => row[f.column] === f.value),
          )
          return { data: results[0] || null, error: null }
        },
        async single() {
          let results = currentTableData.filter((row) =>
            filters.every((f) => row[f.column] === f.value),
          )
          if (results.length === 0) {
            return { data: null, error: { message: 'No rows found', code: 'PGRST116' } }
          }
          return { data: results[0], error: null }
        },
        async upsert(values, options) {
          const arr = Array.isArray(values) ? values : [values]
          for (const item of arr) {
            const idx = currentTableData.findIndex((row) =>
              row.user_id === item.user_id && row.role === item.role,
            )
            if (idx >= 0) {
              currentTableData[idx] = { ...currentTableData[idx], ...item }
            } else {
              currentTableData.push({ ...item })
            }
          }
          return { data: values, error: null }
        },
        update(values) {
          pendingUpdate = values
          return query
        },
        delete() {
          isDelete = true
          return query
        },
        then(resolve, reject) {
          if (pendingUpdate) {
            for (let i = 0; i < currentTableData.length; i++) {
              if (filters.every((f) => currentTableData[i][f.column] === f.value)) {
                currentTableData[i] = { ...currentTableData[i], ...pendingUpdate }
              }
            }
            return resolve({ data: currentTableData, error: null })
          }

          if (isDelete) {
            state[table] = currentTableData.filter(
              (row) => !filters.every((f) => row[f.column] === f.value),
            )
            return resolve({ data: null, error: null })
          }

          let results = currentTableData.filter((row) =>
            filters.every((f) => row[f.column] === f.value),
          )
          // Handle relationships in mock if queried
          if (table === 'profiles') {
            results = results.map((p) => ({
              ...p,
              user_roles: state.user_roles.filter((r) => r.user_id === p.id),
            }))
          }
          resolve({ data: results, error: null })
        },
      }

      return query
    },

    async rpc(fn, args) {
      if (state.rpcError) {
        return { data: null, error: state.rpcError }
      }

      if (fn === 'expire_order_payment') {
        const orderId = args?.p_order_id
        const force = args?.p_force ?? false
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) {
          return { data: null, error: { message: 'ORDER_NOT_FOUND' } }
        }
        if (order.payment_status === 'PAID') {
          return { data: null, error: { message: 'CANNOT_EXPIRE_PAID_ORDER' } }
        }
        if (order.payment_status === 'EXPIRED') {
          return { data: [{ expired: true, previous_status: 'EXPIRED' }], error: null }
        }
        const now = Date.now()
        const windowExp = new Date(order.payment_window_expires_at).getTime()
        if (['PENDING', 'PROCESSING'].includes(order.payment_status) && (force || now >= windowExp)) {
          const prevStatus = order.payment_status
          order.payment_status = 'EXPIRED'
          order.status = 'CANCELLED'
          order.updated_at = new Date().toISOString()
          const fee = state.platform_fee_reservations.find(
            (r) => r.active_order_id === orderId && !r.is_paid,
          )
          if (fee) fee.active_order_id = null
          if (state.inventory_reservations) {
            state.inventory_reservations
              .filter((ir) => ir.order_id === orderId && ir.status === 'HELD')
              .forEach((ir) => {
                ir.status = 'RELEASED'
                ir.released_at = new Date().toISOString()
              })
          }
          return { data: [{ expired: true, previous_status: prevStatus }], error: null }
        }
        return { data: [{ expired: false, previous_status: order.payment_status }], error: null }
      }

      if (fn === 'mark_platform_fee_paid') {
        const orderId = args?.p_order_id
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) {
          return { data: null, error: { message: 'ORDER_NOT_FOUND' } }
        }
        if (order.payment_status === 'PAID') {
          return { data: true, error: null }
        }
        if (order.status === 'CANCELLED' || ['EXPIRED', 'FAILED', 'REFUNDED'].includes(order.payment_status)) {
          return { data: null, error: { message: 'CANNOT_VERIFY_TERMINAL_PAYMENT' } }
        }
        const now = Date.now()
        const windowExp = new Date(order.payment_window_expires_at).getTime()
        if (now >= windowExp) {
          return { data: null, error: { message: 'PAYMENT_WINDOW_EXPIRED' } }
        }
        const hasVerifiedRecord = (state.payment_records || []).some(
          (pr) => pr.order_id === orderId && Number(pr.amount) === Number(order.total_payable),
        )
        if (!hasVerifiedRecord) {
          return { data: null, error: { message: 'UNVERIFIED_PAYMENT_SHORTCUT_PROHIBITED' } }
        }

        order.payment_status = 'PAID'
        order.status = 'CONFIRMED'
        order.paid_at = new Date().toISOString()
        order.updated_at = order.paid_at

        const fee = state.platform_fee_reservations.find(
          (r) => r.active_order_id === orderId || r.fee_paise === order?.fee_paise,
        )
        if (fee) {
          fee.is_paid = true
          fee.paid_at = order.paid_at
        }
        if (state.inventory_reservations) {
          state.inventory_reservations
            .filter((ir) => ir.order_id === orderId && ir.status === 'HELD')
            .forEach((ir) => {
              ir.status = 'COMMITTED'
              ir.committed_at = order.paid_at
            })
        }
        return { data: true, error: null }
      }

      return { data: null, error: null }
    },
  }

  setSupabaseAdmin(client)
  return { client, state }
}
