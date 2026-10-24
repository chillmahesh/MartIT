import { setSupabaseAdmin } from '../config/supabase.js'
import { ROLES } from '../utils/permissions.js'

function matchesFilter(rowVal, filterVal) {
  if (filterVal === null) {
    return rowVal === null || rowVal === undefined
  }
  return rowVal === filterVal
}

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
  inventory_reservations = [],
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
    inventory_reservations: structuredClone(inventory_reservations),
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
          insert() {
            return {
              select() { return this },
              single() { return Promise.resolve({ data: null, error: queryError }) },
              maybeSingle() { return Promise.resolve({ data: null, error: queryError }) },
              catch(onRejected) { return Promise.resolve({ data: null, error: queryError }).catch(onRejected) },
              then(resolve) { return resolve({ data: null, error: queryError }) },
            }
          },
          update() {
            return {
              select() { return this },
              eq() { return this },
              is() { return this },
              catch(onRejected) { return Promise.resolve({ data: null, error: queryError }).catch(onRejected) },
              then(resolve) { return resolve({ data: null, error: queryError }) },
            }
          },
          delete() {
            return {
              eq() { return this },
              catch(onRejected) { return Promise.resolve({ data: null, error: queryError }).catch(onRejected) },
              then(resolve) { return resolve({ data: null, error: queryError }) },
            }
          },
          eq() { return this },
          is() { return this },
          order() { return this },
          limit() { return this },
          async maybeSingle() { return { data: null, error: queryError } },
          async single() { return { data: null, error: queryError } },
          catch(onRejected) { return Promise.resolve({ data: null, error: queryError }).catch(onRejected) },
          then(resolve) { return resolve({ data: null, error: queryError }) },
        }
      }

      if (!state[table]) {
        state[table] = []
      }
      let currentTableData = state[table]
      let filters = []
      let inFilters = []
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
        is(column, value) {
          filters.push({ column, value })
          return query
        },
        in(column, values) {
          inFilters.push({ column, values: Array.isArray(values) ? values : [values] })
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
            filters.every((f) => matchesFilter(row[f.column], f.value)) &&
            inFilters.every((inf) => inf.values.includes(row[inf.column]))
          )
          let row = results[0] || null
          if (row && table === 'profiles') {
            row = { ...row, user_roles: (state.user_roles || []).filter((r) => r.user_id === row.id) }
          }
          return { data: row, error: null }
        },
        async single() {
          let results = currentTableData.filter((row) =>
            filters.every((f) => matchesFilter(row[f.column], f.value)) &&
            inFilters.every((inf) => inf.values.includes(row[inf.column]))
          )
          if (results.length === 0) {
            return { data: null, error: { message: 'No rows found', code: 'PGRST116' } }
          }
          let row = results[0]
          if (row && table === 'profiles') {
            row = { ...row, user_roles: (state.user_roles || []).filter((r) => r.user_id === row.id) }
          }
          return { data: row, error: null }
        },
        insert(values) {
          const arr = Array.isArray(values) ? values : [values]
          for (const item of arr) {
            currentTableData.push({ ...item })
          }
          const insertResult = {
            data: arr,
            error: null,
            select() {
              return {
                async single() {
                  return { data: arr[0] || null, error: null }
                },
                async maybeSingle() {
                  return { data: arr[0] || null, error: null }
                },
                then(resolve) {
                  return resolve({ data: arr, error: null })
                },
              }
            },
            then(resolve) {
              return resolve({ data: arr, error: null })
            },
          }
          return insertResult
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
        catch(onRejected) {
          return Promise.resolve(this).catch(onRejected)
        },
        then(resolve, reject) {
          if (pendingUpdate) {
            if (state.updateErrors?.[table]) {
              return resolve({ data: null, error: { message: state.updateErrors[table] } })
            }
            const updatedRows = []
            for (let i = 0; i < currentTableData.length; i++) {
              if (filters.every((f) => matchesFilter(currentTableData[i][f.column], f.value))) {
                currentTableData[i] = { ...currentTableData[i], ...pendingUpdate }
                updatedRows.push(currentTableData[i])
              }
            }
            return resolve({ data: updatedRows, error: null })
          }

          if (isDelete) {
            const kept = currentTableData.filter(
              (row) => !filters.every((f) => matchesFilter(row[f.column], f.value)),
            )
            currentTableData.length = 0
            currentTableData.push(...kept)
            state[table] = currentTableData
            return resolve({ data: null, error: null })
          }

          let results = currentTableData.filter((row) =>
            filters.every((f) => matchesFilter(row[f.column], f.value)) &&
            inFilters.every((inf) => inf.values.includes(row[inf.column]))
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
      if (state.rpcErrors && state.rpcErrors[fn]) {
        const errVal = state.rpcErrors[fn]
        return { data: null, error: typeof errVal === 'string' ? { message: errVal } : errVal }
      }

      if (fn === 'create_order_atomic') {
        if (state.rpcErrors?.create_order_atomic || state.rpcErrors?.allocate_platform_fee || state.rpcErrors?.reserve_order_inventory) {
          const errVal = state.rpcErrors.create_order_atomic || state.rpcErrors.allocate_platform_fee || state.rpcErrors.reserve_order_inventory
          return { data: null, error: typeof errVal === 'string' ? { message: errVal } : errVal }
        }
        if (state.tableErrors?.orders || state.tableErrors?.order_fulfillment_groups || state.tableErrors?.order_items) {
          return { data: null, error: { message: 'synthetic table error' } }
        }

        const orderId = args?.p_order_id
        const customerId = args?.p_customer_id
        const idempotencyKey = args?.p_idempotency_key
        const now = Date.now()
        const nowIso = new Date(now).toISOString()
        const windowExp = new Date(now + 120000).toISOString()
        const cooldownExp = new Date(now + 420000).toISOString()
        const deliveryFee = Number(args?.p_delivery_fee ?? 10)

        // Idempotency Check
        const existingOrder = (state.orders || []).find(
          (o) => (idempotencyKey && o.idempotency_key === idempotencyKey) || o.id === orderId
        )
        if (existingOrder) {
          if (existingOrder.customer_id && existingOrder.customer_id !== customerId) {
            return { data: null, error: { message: 'IDEMPOTENCY_CONFLICT' } }
          }
          return {
            data: {
              orderId: existingOrder.id,
              id: existingOrder.id,
              customerId: existingOrder.customer_id,
              status: existingOrder.status,
              paymentStatus: existingOrder.payment_status,
              feePaise: existingOrder.fee_paise,
              itemSubtotal: Number(existingOrder.item_subtotal),
              deliveryFee: Number(existingOrder.combined_delivery_fee),
              baseAmount: Number(existingOrder.base_amount),
              platformFee: Number(existingOrder.platform_fee),
              totalPayable: Number(existingOrder.total_payable),
              isIdempotentHit: true,
            },
            error: null,
          }
        }

        // Validate products, aggregate duplicate items, and deduct stock deterministically
        let subtotal = 0
        const items = args?.p_items || []

        // Pre-validate individual items
        for (const item of items) {
          const pid = item.product_id || item.productId
          const qty = item.quantity
          if (!pid || typeof pid !== 'string' || !pid.trim()) {
            return { data: null, error: { message: 'INVALID_LINE_ITEM' } }
          }
          if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > 2147483647) {
            return { data: null, error: { message: 'INVALID_QUANTITY' } }
          }
        }

        // Aggregate duplicates and sort deterministically by product ID
        const aggregatedMap = new Map()
        for (const item of items) {
          const pid = item.product_id || item.productId
          const current = aggregatedMap.get(pid) || 0
          const next = current + item.quantity
          if (next > 2147483647) {
            return { data: null, error: { message: 'INVALID_QUANTITY' } }
          }
          aggregatedMap.set(pid, next)
        }

        const sortedProductIds = Array.from(aggregatedMap.keys()).sort((a, b) => a.localeCompare(b))
        for (const pid of sortedProductIds) {
          const qty = aggregatedMap.get(pid)
          const prod = (state.products || []).find((p) => p.id === pid)
          if (!prod || !prod.is_available) {
            return { data: null, error: { message: 'PRODUCT_UNAVAILABLE' } }
          }
          if (prod.stock < qty) {
            return { data: null, error: { message: 'OUT_OF_STOCK' } }
          }
          const lineCost = Math.round(Number(prod.price) * qty * 100) / 100
          if (lineCost > 99999999.99 || (subtotal + lineCost) > 99999999.99) {
            return { data: null, error: { message: 'ORDER_TOTAL_EXCEEDED' } }
          }
          prod.stock -= qty
          subtotal += lineCost
        }
        subtotal = Math.round(subtotal * 100) / 100
        const baseAmount = Math.round(subtotal + deliveryFee)

        // Find available platform fee slot
        let slot = (state.platform_fee_reservations || []).find(
          (r) => !r.is_paid && (!r.active_order_id || (r.cooldown_expires_at && now >= new Date(r.cooldown_expires_at).getTime()))
        )
        if (!slot) {
          if (!state.platform_fee_reservations || state.platform_fee_reservations.length === 0) {
            slot = { fee_paise: 12, is_paid: false }
            state.platform_fee_reservations = [slot]
          } else {
            return { data: null, error: { message: 'ALL_PLATFORM_FEE_SLOTS_BUSY' } }
          }
        }
        const feePaise = slot.fee_paise
        const attemptId = `att_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
        slot.active_order_id = orderId
        slot.attempt_id = attemptId
        slot.allocated_at = nowIso
        slot.window_expires_at = windowExp
        slot.cooldown_expires_at = cooldownExp
        slot.is_paid = false
        slot.paid_at = null

        const platformFee = Math.round(feePaise) / 100
        const totalPayable = baseAmount + platformFee

        // Insert order record into mock state.orders
        const orderRecord = {
          id: orderId,
          customer_id: customerId,
          delivery_location_id: args?.p_location_id,
          delivery_location_snapshot: args?.p_customer_details,
          status: 'AWAITING_PAYMENT',
          payment_status: 'PENDING',
          item_subtotal: subtotal.toFixed(2),
          combined_delivery_fee: deliveryFee.toFixed(2),
          base_amount: baseAmount.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          total_payable: totalPayable.toFixed(2),
          route_distance_km: args?.p_route_distance_km,
          fee_policy_version: args?.p_fee_policy_version,
          payment_attempt_id: attemptId,
          fee_paise: feePaise,
          payment_allocated_at: nowIso,
          payment_window_expires_at: windowExp,
          payment_cooldown_expires_at: cooldownExp,
          paid_at: null,
          runner_id: null,
          idempotency_key: idempotencyKey,
          created_at: nowIso,
          updated_at: nowIso,
        }
        if (!state.orders) state.orders = []
        state.orders.push(orderRecord)

        if (!state.inventory_reservations) state.inventory_reservations = []
        for (const pid of sortedProductIds) {
          const qty = aggregatedMap.get(pid)
          state.inventory_reservations.push({
            id: `res_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            order_id: orderId,
            store_id: args?.p_store_id,
            product_id: pid,
            quantity: qty,
            status: 'HELD',
            expires_at: windowExp,
            created_at: nowIso,
          })
        }

        return {
          data: {
            orderId,
            id: orderId,
            feePaise,
            attemptId,
            allocatedAt: nowIso,
            windowExpiresAt: windowExp,
            cooldownExpiresAt: cooldownExp,
            itemSubtotal: subtotal,
            deliveryFee,
            baseAmount,
            platformFee,
            totalPayable,
            isIdempotentHit: false,
          },
          error: null,
        }
      }

      if (fn === 'allocate_platform_fee') {
        const orderId = args?.p_order_id
        const attemptId = args?.p_attempt_id
        const now = Date.now()
        const nowIso = new Date(now).toISOString()
        const windowExp = new Date(now + 120000).toISOString()
        const cooldownExp = new Date(now + 420000).toISOString()

        let slot = (state.platform_fee_reservations || []).find(
          (r) => !r.is_paid && (!r.active_order_id || (r.cooldown_expires_at && now >= new Date(r.cooldown_expires_at).getTime()))
        )
        if (!slot) {
          if (!state.platform_fee_reservations || state.platform_fee_reservations.length === 0) {
            slot = { fee_paise: 12 }
            state.platform_fee_reservations = [slot]
          } else {
            return { data: null, error: { message: 'ALL_PLATFORM_FEE_SLOTS_BUSY' } }
          }
        }
        slot.active_order_id = orderId
        slot.attempt_id = attemptId
        slot.allocated_at = nowIso
        slot.window_expires_at = windowExp
        slot.cooldown_expires_at = cooldownExp
        slot.is_paid = false
        slot.paid_at = null

        return {
          data: [{
            allocated_fee_paise: slot.fee_paise,
            allocated_at: nowIso,
            window_expires_at: windowExp,
            cooldown_expires_at: cooldownExp,
          }],
          error: null,
        }
      }

      if (fn === 'release_platform_fee') {
        const orderId = args?.p_order_id
        const slot = (state.platform_fee_reservations || []).find(
          (r) => r.active_order_id === orderId && !r.is_paid
        )
        if (slot) {
          slot.active_order_id = null
          slot.attempt_id = null
          slot.allocated_at = null
          slot.window_expires_at = null
          slot.cooldown_expires_at = null
        }
        return { data: true, error: null }
      }

      if (fn === 'reserve_order_inventory') {
        return { data: true, error: null }
      }

      if (fn === 'release_order_inventory') {
        const orderId = args?.p_order_id
        const order = (state.orders || []).find((o) => o.id === orderId)
        if (!order) {
          return { data: null, error: { message: 'ORDER_NOT_FOUND' } }
        }
        if (order.payment_status === 'PAID') {
          return { data: null, error: { message: 'CANNOT_RELEASE_PAID_ORDER' } }
        }
        const reservations = (state.inventory_reservations || []).filter(
          (ir) => ir.order_id === orderId && ir.status === 'HELD',
        )
        if (reservations.length === 0) {
          return { data: true, error: null }
        }
        const aggregated = new Map()
        for (const res of reservations) {
          aggregated.set(res.product_id, (aggregated.get(res.product_id) || 0) + res.quantity)
        }
        const sortedPids = Array.from(aggregated.keys()).sort((a, b) => a.localeCompare(b))
        for (const pid of sortedPids) {
          const prod = (state.products || []).find((p) => p.id === pid)
          if (!prod) {
            return { data: null, error: { message: 'PRODUCT_NOT_FOUND' } }
          }
          if (prod.stock + aggregated.get(pid) > 2147483647) {
            return { data: null, error: { message: 'STOCK_OVERFLOW' } }
          }
          prod.stock += aggregated.get(pid)
        }
        reservations.forEach((ir) => {
          ir.status = 'RELEASED'
          ir.released_at = new Date().toISOString()
        })
        return { data: true, error: null }
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
            const held = state.inventory_reservations.filter((ir) => ir.order_id === orderId && ir.status === 'HELD')
            const aggregated = new Map()
            for (const res of held) {
              aggregated.set(res.product_id, (aggregated.get(res.product_id) || 0) + res.quantity)
            }
            const sortedPids = Array.from(aggregated.keys()).sort((a, b) => a.localeCompare(b))
            for (const pid of sortedPids) {
              const prod = (state.products || []).find((p) => p.id === pid)
              if (!prod) {
                return { data: null, error: { message: 'PRODUCT_NOT_FOUND' } }
              }
              if (prod.stock + aggregated.get(pid) > 2147483647) {
                return { data: null, error: { message: 'STOCK_OVERFLOW' } }
              }
              prod.stock += aggregated.get(pid)
            }
            held.forEach((ir) => {
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
          (pr) =>
            pr.order_id === orderId &&
            Number(pr.amount) === Number(order.total_payable) &&
            (pr.status === 'PAID' || (pr.evidence !== null && pr.evidence !== undefined)),
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

      if (fn === 'admin_set_runner_status') {
        const { p_user_id, p_status } = args || {}
        if (!['approved', 'suspended'].includes(p_status)) {
          return { data: null, error: { message: 'INVALID_STATUS: Runner status must be either approved or suspended.' } }
        }
        const profile = state.profiles.find((p) => p.id === p_user_id)
        if (!profile) {
          return { data: null, error: { message: 'USER_NOT_FOUND: Target user profile does not exist.' } }
        }
        if (profile.runner_status == null) {
          return { data: null, error: { message: 'NOT_AN_APPLICANT: This user has not applied to be a runner.' } }
        }

        profile.runner_status = p_status
        const roles = state.user_roles || state.userRoles || []
        if (p_status === 'approved') {
          if (!roles.some((r) => r.user_id === p_user_id && r.role === ROLES.RUNNER)) {
            roles.push({ user_id: p_user_id, role: ROLES.RUNNER })
          }
        } else if (p_status === 'suspended') {
          if (state.user_roles) {
            state.user_roles = state.user_roles.filter((r) => !(r.user_id === p_user_id && r.role === ROLES.RUNNER))
          }
          if (state.userRoles) {
            state.userRoles = state.userRoles.filter((r) => !(r.user_id === p_user_id && r.role === ROLES.RUNNER))
          }
        }

        return {
          data: {
            success: true,
            userId: p_user_id,
            runnerStatus: p_status,
            name: profile.name,
            email: profile.email,
            message: `Runner status updated to ${p_status}.`,
          },
          error: null,
        }
      }

      return { data: null, error: null }
    },
  }

  setSupabaseAdmin(client)
  return { client, state }
}
