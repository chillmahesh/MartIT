import { SAMPLE_STORES } from '@/mocks/campus'
import { ORDER_STATUS } from './orderMachine'

/**
 * Returns clean display name for a campus store.
 */
export function getStoreDisplayName(storeId) {
  const store = SAMPLE_STORES.find((s) => s.id === storeId)
  if (!store) return storeId || 'Campus Store'
  return store.name.replace(' (sample store)', '')
}

/**
 * Extracts unique store IDs required for this order.
 */
export function getOrderStoreIds(order) {
  if (!order) return []
  const ids = new Set()
  if (Array.isArray(order.storeIds)) {
    order.storeIds.forEach((id) => id && ids.add(id))
  }
  if (Array.isArray(order.pickups)) {
    order.pickups.forEach((p) => p.storeId && ids.add(p.storeId))
  }
  if (Array.isArray(order.lines)) {
    order.lines.forEach((l) => l.storeId && ids.add(l.storeId))
  }
  if (order.storeId) {
    ids.add(order.storeId)
  }
  return Array.from(ids)
}

/**
 * Returns formatted pickup progress for all required stores in an order.
 */
export function getOrderPickups(order) {
  const storeIds = getOrderStoreIds(order)
  const existingPickups = Array.isArray(order?.pickups) ? order.pickups : []

  return storeIds.map((sid) => {
    const existing = existingPickups.find((p) => p.storeId === sid)
    const isOrderPastPickup =
      order?.status === ORDER_STATUS.PICKED_UP ||
      order?.status === ORDER_STATUS.ON_THE_WAY ||
      order?.status === ORDER_STATUS.DELIVERED

    const status = existing?.status || (isOrderPastPickup ? 'PICKED_UP' : 'PENDING')

    return {
      storeId: sid,
      storeName: getStoreDisplayName(sid),
      status,
      pickedUpAt: existing?.pickedUpAt || (isOrderPastPickup ? order?.createdAt : null),
    }
  })
}

/**
 * Checks whether all required store pickups have been completed.
 */
export function areAllPickupsComplete(order) {
  if (!order) return false
  if (
    order.status === ORDER_STATUS.PICKED_UP ||
    order.status === ORDER_STATUS.ON_THE_WAY ||
    order.status === ORDER_STATUS.DELIVERED
  ) {
    return true
  }
  const pickups = getOrderPickups(order)
  if (pickups.length === 0) return true
  return pickups.every((p) => p.status === 'PICKED_UP')
}
