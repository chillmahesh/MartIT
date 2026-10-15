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

      if (fn === 'transition_order_to_on_the_way') {
        const orderId = args?.p_order_id
        const runnerId = args?.p_runner_id
        const otpHash = args?.p_otp_hash
        const expirySeconds = args?.p_expiry_seconds || 300

        // Check runner profile status
        const runnerProfile = (state.profiles || []).find((p) => p.id === runnerId)
        if (!runnerProfile || runnerProfile.runner_status !== 'approved') {
          return {
            data: [{
              success: false,
              result_code: 'FORBIDDEN_RUNNER_NOT_APPROVED',
              order_id: orderId,
              status: null,
              challenge_initialized: false,
              expires_at: null,
            }],
            error: null,
          }
        }

        const order = state.orders.find((o) => o.id === orderId)
        if (!order) {
          return {
            data: [{
              success: false,
              result_code: 'ORDER_NOT_FOUND',
              order_id: orderId,
              status: null,
              challenge_initialized: false,
              expires_at: null,
            }],
            error: null,
          }
        }

        if (order.runner_id !== runnerId && order.assigned_runner_id !== runnerId) {
          return {
            data: [{
              success: false,
              result_code: 'ORDER_NOT_ASSIGNED_TO_RUNNER',
              order_id: orderId,
              status: order.status,
              challenge_initialized: false,
              expires_at: null,
            }],
            error: null,
          }
        }

        if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
          return {
            data: [{
              success: false,
              result_code: 'INVALID_ORDER_STATE',
              order_id: orderId,
              status: order.status,
              challenge_initialized: false,
              expires_at: null,
            }],
            error: null,
          }
        }

        const now = Date.now()
        // If already ON_THE_WAY, repeated transition must NOT overwrite unexpired OTP or reset attempts/lockout
        if (order.status === 'ON_THE_WAY') {
          if (order.handover_otp_hash && order.handover_otp_expires_at) {
            const expTime = new Date(order.handover_otp_expires_at).getTime()
            if (now < expTime) {
              return {
                data: [{
                  success: true,
                  result_code: 'ALREADY_ON_THE_WAY',
                  order_id: orderId,
                  status: 'ON_THE_WAY',
                  challenge_initialized: false,
                  expires_at: order.handover_otp_expires_at,
                }],
                error: null,
              }
            }
          }
          if (order.handover_locked_until && now < new Date(order.handover_locked_until).getTime()) {
            return {
              data: [{
                success: false,
                result_code: 'OTP_LOCKED',
                order_id: orderId,
                status: 'ON_THE_WAY',
                challenge_initialized: false,
                expires_at: order.handover_otp_expires_at,
              }],
              error: null,
            }
          }
        }

        if (order.status !== 'PICKED_UP' && order.status !== 'ON_THE_WAY') {
          return {
            data: [{
              success: false,
              result_code: 'INVALID_TRANSITION',
              order_id: orderId,
              status: order.status,
              challenge_initialized: false,
              expires_at: null,
            }],
            error: null,
          }
        }

        const nowIso = new Date().toISOString()
        const expIso = new Date(now + expirySeconds * 1000).toISOString()
        order.status = 'ON_THE_WAY'
        order.handover_otp_hash = otpHash
        order.handover_otp_expires_at = expIso
        order.handover_attempts_count = 0
        order.handover_locked_until = null
        order.handover_otp_last_resend_at = nowIso
        order.updated_at = nowIso

        return {
          data: [{
            success: true,
            result_code: 'SUCCESS',
            order_id: orderId,
            status: 'ON_THE_WAY',
            challenge_initialized: true,
            expires_at: expIso,
          }],
          error: null,
        }
      }

      if (fn === 'verify_delivery_otp') {
        const orderId = args?.p_order_id
        const otpHal = args?.p_otp_hash
        const runnerId = args?.p_runner_id

        const order = state.orders.find((o) => o.id === orderId)
        if (!order) {
          return {
            data: [{
              success: false,
              result_code: 'ORDER_NOT_FOUND',
              order_id: orderId,
              status: null,
              attempts_remaining: 0,
              locked_until: null,
              verified_at: null,
            }],
            error: null,
          }
        }
        if (order.runner_id !== runnerId && order.assigned_runner_id !== runnerId) {
          return {
            data: [{
              success: false,
              result_code: 'ORDER_NOT_ASSIGNED_TO_RUNNER',
              order_id: orderId,
              status: order.status,
              attempts_remaining: Math.max(0, 3 - (order.handover_attempts_count || 0)),
              locked_until: order.handover_locked_until || null,
              verified_at: null,
            }],
            error: null,
          }
        }
        if (order.status === 'DELIVERED' || order.handover_verified_at) {
          return {
            data: [{
              success: false,
              result_code: 'OTP_ALREADY_USED',
              order_id: orderId,
              status: order.status,
              attempts_remaining: 0,
              locked_until: order.handover_locked_until || null,
              verified_at: order.handover_verified_at,
            }],
            error: null,
          }
        }
        if (!['ON_THE_WAY', 'OUT_FOR_DELIVERY'].includes(order.status)) {
          return {
            data: [{
              success: false,
              result_code: 'INVALID_ORDER_STATE',
              order_id: orderId,
              status: order.status,
              attempts_remaining: Math.max(0, 3 - (order.handover_attempts_count || 0)),
              locked_until: order.handover_locked_until || null,
              verified_at: null,
            }],
            error: null,
          }
        }
        const now = Date.now()
        if (order.handover_locked_until) {
          const lockedUntil = new Date(order.handover_locked_until).getTime()
          if (now < lockedUntil) {
            return {
              data: [{
                success: false,
                result_code: 'OTP_LOCKED',
                order_id: orderId,
                status: order.status,
                attempts_remaining: 0,
                locked_until: order.handover_locked_until,
                verified_at: null,
              }],
              error: null,
            }
          }
        }
        if (order.handover_otp_expires_at) {
          const expiresAt = new Date(order.handover_otp_expires_at).getTime()
          if (now > expiresAt) {
            return {
              data: [{
                success: false,
                result_code: 'OTP_EXPIRED',
                order_id: orderId,
                status: order.status,
                attempts_remaining: Math.max(0, 3 - (order.handover_attempts_count || 0)),
                locked_until: order.handover_locked_until || null,
                verified_at: null,
              }],
              error: null,
            }
          }
        }
        if (order.handover_otp_hash !== otpHal) {
          order.handover_attempts_count = (order.handover_attempts_count || 0) + 1
          if (order.handover_attempts_count >= 3) {
            order.handover_locked_until = new Date(now + 300000).toISOString()
            return {
              data: [{
                success: false,
                result_code: 'OTP_LOCKED',
                order_id: orderId,
                status: order.status,
                attempts_remaining: 0,
                locked_until: order.handover_locked_until,
                verified_at: null,
              }],
              error: null,
            }
          }
          return {
            data: [{
              success: false,
              result_code: 'OTP_INVALID',
              order_id: orderId,
              status: order.status,
              attempts_remaining: Math.max(0, 3 - order.handover_attempts_count),
              locked_until: null,
              verified_at: null,
            }],
            error: null,
          }
        }

        const nowIso = new Date().toISOString()
        order.status = 'DELIVERED'
        order.handover_verified_at = nowIso
        order.delivered_at = nowIso
        order.handover_otp_hash = null
        order.handover_attempts_count = 0
        order.handover_locked_until = null
        order.updated_at = nowIso

        return {
          data: [{
            success: true,
            result_code: 'SUCCESS',
            order_id: order.id,
            status: 'DELIVERED',
            attempts_remaining: 3,
            locked_until: null,
            verified_at: nowIso,
          }],
          error: null,
        }
      }

      if (fn === 'reissue_delivery_otp') {
        const orderId = args?.p_order_id
        const newHash = args?.p_new_otp_hash
        const customerId = args?.p_customer_id
        const expirySeconds = args?.p_expiry_seconds || 300

        const order = state.orders.find((o) => o.id === orderId)
        if (!order) {
          return {
            data: [{
              success: false,
              result_code: 'ORDER_NOT_FOUND',
              order_id: orderId,
              status: null,
              expires_at: null,
              attempts_remaining: 0,
            }],
            error: null,
          }
        }
        if (order.customer_id !== customerId) {
          return {
            data: [{
              success: false,
              result_code: 'FORBIDDEN_CALLER_NOT_ORDER_OWNER',
              order_id: orderId,
              status: order.status,
              expires_at: null,
              attempts_remaining: 0,
            }],
            error: null,
          }
        }
        if (!['ON_THE_WAY', 'OUT_FOR_DELIVERY'].includes(order.status)) {
          return {
            data: [{
              success: false,
              result_code: 'INVALID_ORDER_STATE',
              order_id: orderId,
              status: order.status,
              expires_at: null,
              attempts_remaining: Math.max(0, 3 - (order.handover_attempts_count || 0)),
            }],
            error: null,
          }
        }
        const now = Date.now()
        if (order.handover_locked_until) {
          const lockedUntil = new Date(order.handover_locked_until).getTime()
          if (now < lockedUntil) {
            return {
              data: [{
                success: false,
                result_code: 'OTP_LOCKED',
                order_id: orderId,
                status: order.status,
                expires_at: null,
                attempts_remaining: 0,
              }],
              error: null,
            }
          }
        }
        if (order.handover_otp_last_resend_at) {
          const lastResend = new Date(order.handover_otp_last_resend_at).getTime()
          if (now < lastResend + 15000) {
            return {
              data: [{
                success: false,
                result_code: 'RATE_LIMITED',
                order_id: orderId,
                status: order.status,
                expires_at: null,
                attempts_remaining: Math.max(0, 3 - (order.handover_attempts_count || 0)),
              }],
              error: null,
            }
          }
        }

        const nowIso = new Date().toISOString()
        const expIso = new Date(now + expirySeconds * 1000).toISOString()
        order.handover_otp_hash = newHash
        order.handover_otp_expires_at = expIso
        order.handover_otp_last_resend_at = nowIso
        order.updated_at = nowIso

        return {
          data: [{
            success: true,
            result_code: 'SUCCESS',
            order_id: order.id,
            status: order.status,
            expires_at: expIso,
            attempts_remaining: Math.max(0, 3 - (order.handover_attempts_count || 0)),
          }],
          error: null,
        }
      }

      return { data: null, error: null }
    },
  }

  setSupabaseAdmin(client)
  return { client, state }
}
