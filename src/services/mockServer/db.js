import { SAMPLE_DELIVERY_LOCATIONS, SAMPLE_STORES } from '@/mocks/campus'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import { SAMPLE_USERS } from '@/mocks/users'
import { safeStorage } from '@/utils/storage'
import { createPlatformFeeAllocator } from './platformFeeAllocator'
import { createMockVerificationAdapter } from './verificationAdapter'

const SESSIONS_KEY = 'martit-mock-sessions'
const ORDERS_KEY = 'martit-mock-orders'

/** Mock-only: keeps demo sessions across page reloads. A real backend owns sessions. */
function persistedSessions() {
  let entries = []
  try { entries = JSON.parse(safeStorage.get(SESSIONS_KEY) ?? '[]') } catch { entries = [] }
  const map = new Map(entries)
  const save = () => safeStorage.set(SESSIONS_KEY, JSON.stringify([...map]))
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); save() },
    delete: (k) => { map.delete(k); save() },
  }
}

/** Mock-only: keeps orders across page reloads so refresh preserves created orders and payment state. */
function persistedOrders() {
  try {
    const raw = safeStorage.get(ORDERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fallback
  }
  return []
}

/** In-memory tables standing in for the backend database with session & order persistence. */
export function createDb() {
  const clone = (x) => structuredClone(x)
  const allocator = createPlatformFeeAllocator()
  const orders = persistedOrders()

  // Hydrate allocator reservations from stored orders so refresh does not reset expiry or re-assign fees
  for (const ord of orders) {
    if (ord.payment && ord.payment.feePaise) {
      allocator.restoreReservation({
        id: `fee_${ord.payment.feePaise}_${ord.payment.allocatedAt}`,
        feePaise: ord.payment.feePaise,
        feeRupees: ord.payment.feePaise / 100,
        orderId: ord.id,
        attemptId: ord.payment.attemptId || ord.id,
        allocatedAt: ord.payment.allocatedAt,
        windowExpiresAt: ord.payment.windowExpiresAt,
        cooldownExpiresAt: ord.payment.cooldownExpiresAt,
        paid: ord.paymentStatus === 'PAID' || ord.payment?.status === 'PAID',
        paidAt: ord.payment?.paidAt || null,
      })
    }
  }

  const saveOrders = () => {
    safeStorage.set(ORDERS_KEY, JSON.stringify(orders))
  }

  const clearOrders = () => {
    orders.length = 0
    safeStorage.remove(ORDERS_KEY)
    allocator.clear()
  }

  return {
    stores: clone(SAMPLE_STORES),
    locations: clone(SAMPLE_DELIVERY_LOCATIONS),
    products: clone(SAMPLE_PRODUCTS),
    users: clone(SAMPLE_USERS),
    sessions: persistedSessions(), // token -> userId
    orders,
    saveOrders,
    clearOrders,
    feeAllocator: allocator,
    verificationAdapter: createMockVerificationAdapter(),
  }
}
