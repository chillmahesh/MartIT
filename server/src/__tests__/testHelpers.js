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
      if (fn === 'expire_order_payment') {
        const orderId = args?.p_order_id
        const order = state.orders.find((o) => o.id === orderId)
        if (order) {
          order.payment_status = 'EXPIRED'
          order.status = 'CANCELLED'
          order.updated_at = new Date().toISOString()
        }
        const fee = state.platform_fee_reservations.find((r) => r.active_order_id === orderId)
        if (fee) fee.active_order_id = null
        return { data: { expired: true }, error: null }
      }

      if (fn === 'mark_platform_fee_paid') {
        const orderId = args?.p_order_id
        const order = state.orders.find((o) => o.id === orderId)
        if (order) {
          order.payment_status = 'PAID'
          order.status = 'CONFIRMED'
          order.paid_at = new Date().toISOString()
        }
        const fee = state.platform_fee_reservations.find(
          (r) => r.active_order_id === orderId || r.fee_paise === order?.fee_paise,
        )
        if (fee) fee.is_paid = true
        return { data: true, error: null }
      }

      return { data: null, error: null }
    },
  }

  setSupabaseAdmin(client)
  return { client, state }
}
