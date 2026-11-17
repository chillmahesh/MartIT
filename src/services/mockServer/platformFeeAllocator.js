import {
  PLATFORM_FEE_MIN_PAISE,
  PLATFORM_FEE_MAX_PAISE,
  PLATFORM_FEE_WINDOW_MS,
  PLATFORM_FEE_COOLDOWN_MS,
} from '@/config/fees'
import { ApiError } from './errors'

export const RESERVATION_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  ACTIVE: 'ACTIVE',
  COOLDOWN: 'COOLDOWN',
  PAID: 'PAID',
})

/**
 * In-memory Dynamic Platform Fee Allocator (Mock Server).
 *
 * Confirmed Platform-Fee Rules:
 * 1. Range: ₹0.01 through ₹0.99 inclusive (1 to 99 paise).
 * 2. Order: Smallest currently available eligible fee allocated first.
 * 3. Exact representation: Integer paise (1-99) prevents JavaScript floating-point uniqueness bugs.
 * 4. Verification window: 2 minutes (120,000 ms).
 * 5. Cooldown: 5 minutes (300,000 ms), beginning AFTER the 2-minute verification window expires.
 * 6. Total hold time: 7 minutes (420,000 ms) before an unverified fee becomes reusable.
 * 7. Paid reservations: Once marked paid by verified server evidence, the fee cannot be reassigned.
 *
 * ARCHITECTURAL NOTICE (Production Backend):
 * In a production multi-worker deployment, fee allocation must be protected by database transactions
 * (e.g. PostgreSQL `SELECT fee_paise FROM platform_fee_slots WHERE ... FOR UPDATE SKIP LOCKED`
 * or a distributed atomic lock / Redis lease with TTL) to guarantee durable, atomic reservations
 * and prevent duplicate assignments across concurrent API requests.
 */
export function createPlatformFeeAllocator({
  minPaise = PLATFORM_FEE_MIN_PAISE,
  maxPaise = PLATFORM_FEE_MAX_PAISE,
  windowMs = PLATFORM_FEE_WINDOW_MS,
  cooldownMs = PLATFORM_FEE_COOLDOWN_MS,
  releasePaidAfterMs = null,
} = {}) {
  // Map of feePaise (integer) -> Reservation
  const reservations = new Map()
  // Index of orderId -> feePaise
  const orderIndex = new Map()

  function getStatus(feePaise, now = Date.now()) {
    const res = reservations.get(feePaise)
    if (!res) return RESERVATION_STATUS.AVAILABLE
    if (res.paid) {
      if (releasePaidAfterMs != null && res.paidAt != null && now >= res.paidAt + releasePaidAfterMs) {
        return RESERVATION_STATUS.AVAILABLE
      }
      return RESERVATION_STATUS.PAID
    }
    if (now < res.windowExpiresAt) return RESERVATION_STATUS.ACTIVE
    if (now < res.cooldownExpiresAt) return RESERVATION_STATUS.COOLDOWN
    return RESERVATION_STATUS.AVAILABLE
  }

  function isAvailable(feePaise, now = Date.now()) {
    return getStatus(feePaise, now) === RESERVATION_STATUS.AVAILABLE
  }

  function allocate({ orderId, attemptId, now = Date.now() }) {
    if (!orderId) {
      throw new Error('orderId is required for platform fee allocation')
    }

    // Allocate smallest currently available eligible fee
    for (let p = minPaise; p <= maxPaise; p++) {
      if (isAvailable(p, now)) {
        const allocatedAt = now
        const windowExpiresAt = allocatedAt + windowMs
        const cooldownExpiresAt = windowExpiresAt + cooldownMs

        const reservation = {
          id: `fee_${p}_${allocatedAt}`,
          feePaise: p,
          feeRupees: p / 100, // Exact decimal representation (0.01 - 0.99)
          orderId,
          attemptId: attemptId || orderId,
          allocatedAt,
          windowExpiresAt,
          cooldownExpiresAt,
          paid: false,
          paidAt: null,
        }

        reservations.set(p, reservation)
        orderIndex.set(orderId, p)

        return {
          feePaise: p,
          feeRupees: p / 100,
          reservation: { ...reservation },
        }
      }
    }

    // All slots exhausted
    throw new ApiError(
      'PLATFORM_FEE_EXHAUSTED',
      'All dynamic payment fee slots are currently active. Please retry shortly.',
      503,
    )
  }

  function release({ feePaise, orderId } = {}) {
    let targetPaise = feePaise
    if (targetPaise == null && orderId != null) {
      targetPaise = orderIndex.get(orderId)
    }
    if (targetPaise == null) return false

    const res = reservations.get(targetPaise)
    if (!res || res.paid) return false

    reservations.delete(targetPaise)
    if (orderId) {
      orderIndex.delete(orderId)
    } else {
      for (const [oid, p] of orderIndex.entries()) {
        if (p === targetPaise) orderIndex.delete(oid)
      }
    }
    return true
  }

  function markPaid({ feePaise, orderId, now = Date.now() } = {}) {
    let targetPaise = feePaise
    if (targetPaise == null && orderId != null) {
      targetPaise = orderIndex.get(orderId)
    }
    if (targetPaise == null) return false

    const res = reservations.get(targetPaise)
    if (!res) return false

    res.paid = true
    res.paidAt = now
    return true
  }

  function getReservation(feePaise) {
    const res = reservations.get(feePaise)
    return res ? { ...res } : null
  }

  function getReservationForOrder(orderId) {
    const p = orderIndex.get(orderId)
    return p != null ? getReservation(p) : null
  }

  function restoreReservation(reservation) {
    if (!reservation || !reservation.feePaise) return
    reservations.set(reservation.feePaise, { ...reservation })
    if (reservation.orderId) {
      orderIndex.set(reservation.orderId, reservation.feePaise)
    }
  }

  function clear() {
    reservations.clear()
    orderIndex.clear()
  }

  return {
    allocate,
    release,
    isAvailable,
    getStatus,
    markPaid,
    getReservation,
    getReservationForOrder,
    restoreReservation,
    clear,
    minPaise,
    maxPaise,
    windowMs,
    cooldownMs,
  }
}
