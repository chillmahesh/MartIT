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
    order.lines.forEach((l) => (l.storeId || l.store_id) && ids.add(l.storeId || l.store_id))
  }
  if (Array.isArray(order.order_fulfillment_groups)) {
    order.order_fulfillment_groups.forEach((g) => (g.store_id || g.storeId) && ids.add(g.store_id || g.storeId))
  }
  if (Array.isArray(order.fulfillmentGroups)) {
    order.fulfillmentGroups.forEach((g) => (g.store_id || g.storeId) && ids.add(g.store_id || g.storeId))
  }
  if (order.storeId) {
    ids.add(order.storeId)
  }
  if (order.store_id) {
    ids.add(order.store_id)
  }
  return Array.from(ids)
}

/**
 * Returns formatted pickup progress for all required stores in an order.
 */
export function getOrderPickups(order) {
  const storeIds = getOrderStoreIds(order)
  const existingPickups = Array.isArray(order?.pickups) ? order.pickups : []
  const fulfillmentGroups = Array.isArray(order?.order_fulfillment_groups)
    ? order.order_fulfillment_groups
    : Array.isArray(order?.fulfillmentGroups)
      ? order.fulfillmentGroups
      : []

  const isOrderPastPickup =
    order?.status === ORDER_STATUS.PICKED_UP ||
    order?.status === ORDER_STATUS.ON_THE_WAY ||
    order?.status === ORDER_STATUS.DELIVERED

  return storeIds.map((sid) => {
    const existing = existingPickups.find((p) => p.storeId === sid)
    const matchingGroup = fulfillmentGroups.find((g) => (g.store_id || g.storeId) === sid)

    const isGroupDone = matchingGroup?.status === 'PICKED_UP' || Boolean(matchingGroup?.picked_up_at || matchingGroup?.pickedUpAt)
    const status = existing?.status || (isGroupDone || isOrderPastPickup ? 'PICKED_UP' : (matchingGroup?.status || 'PENDING'))

    const storeSnapshotName = matchingGroup?.store_snapshot?.name || matchingGroup?.storeSnapshot?.name
    const storeName = storeSnapshotName || getStoreDisplayName(sid)

    return {
      storeId: sid,
      storeName,
      status,
      pickedUpAt: existing?.pickedUpAt || matchingGroup?.picked_up_at || matchingGroup?.pickedUpAt || (isOrderPastPickup ? (order?.created_at || order?.createdAt) : null),
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
