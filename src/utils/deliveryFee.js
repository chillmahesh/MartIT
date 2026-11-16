import {
  FLAT_DELIVERY_FEE,
  FLAT_DELIVERY_FEE_LABEL,
  MAX_SERVICE_KM,
  MULTI_STORE_SURCHARGE,
  MULTI_STORE_SURCHARGE_LABEL,
  PRICING_VERSION,
  RUNNER_PAYOUT_BY_FEE,
} from '@/config/fees'

/**
 * Calculates the additional delivery surcharge for orders containing items from multiple stores:
 * A = max(0, N - 1) * S
 * where N is the distinct store count and S is the fixed surcharge per additional store.
 *
 * @param {number} storeCount - Number of distinct stores N
 * @param {number} [surcharge=MULTI_STORE_SURCHARGE] - Fixed surcharge S
 * @returns {number} Additional surcharge in Rupees
 */
export function calculateAdditionalStoreSurcharge(storeCount = 1, surcharge = MULTI_STORE_SURCHARGE) {
  const count = Math.max(0, Number.isInteger(storeCount) ? storeCount : 1)
  const rate = typeof surcharge === 'number' && Number.isFinite(surcharge) && surcharge >= 0 ? surcharge : 0
  return Math.max(0, count - 1) * rate
}

/**
 * Pure delivery-fee calculation under the MVP Flat Delivery Fee Policy.
 * Shared shape with the backend; the server's result is authoritative and the
 * browser's copy is shown as an estimate.
 *
 * For new eligible orders within the supported campus delivery area (0 < distanceKm <= 5 km),
 * base delivery is a flat ₹10, plus any applicable additional store surcharge:
 * D = B + A = B + max(0, N - 1) * S
 *
 * @param {number} distanceKm
 * @param {number} [storeCount=1]
 * @param {{ surcharge?: number }} [options={}]
 * @returns {{ ok: true, fee: number, baseDeliveryFee: number, additionalStoreSurcharge: number, storeCount: number, surchargePerAdditionalStore: number, distanceKm: number, label: string, pricingVersion: string }
 *         | { ok: false, reason: 'INVALID_DISTANCE' | 'OUT_OF_SERVICE_AREA', distanceKm: number, maxKm: number }}
 */
export function calculateDeliveryFee(distanceKm, storeCount = 1, options = {}) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, reason: 'INVALID_DISTANCE', distanceKm, maxKm: MAX_SERVICE_KM }
  }
  if (distanceKm > MAX_SERVICE_KM) {
    return { ok: false, reason: 'OUT_OF_SERVICE_AREA', distanceKm, maxKm: MAX_SERVICE_KM }
  }

  const validStoreCount = Math.max(0, Number.isInteger(storeCount) ? storeCount : 1)
  const surchargePerAdditionalStore =
    typeof options?.surcharge === 'number' && Number.isFinite(options.surcharge) && options.surcharge >= 0
      ? options.surcharge
      : MULTI_STORE_SURCHARGE
  const additionalStoreSurcharge = calculateAdditionalStoreSurcharge(validStoreCount, surchargePerAdditionalStore)
  const baseDeliveryFee = FLAT_DELIVERY_FEE
  const fee = validStoreCount === 0 ? 0 : baseDeliveryFee + additionalStoreSurcharge

  return {
    ok: true,
    fee,
    baseDeliveryFee,
    additionalStoreSurcharge,
    storeCount: validStoreCount,
    surchargePerAdditionalStore,
    distanceKm,
    label: FLAT_DELIVERY_FEE_LABEL,
    pricingVersion: PRICING_VERSION,
  }
}

/**
 * Splits a customer delivery fee into runner payout and platform share.
 * Returns nulls where the payout is not yet decided — callers must not invent one.
 * Store commission is a separate ledger and is deliberately not part of this split.
 */
export function splitDeliveryFee(fee) {
  const runnerPayout = RUNNER_PAYOUT_BY_FEE[fee] ?? null
  return {
    customerFee: fee,
    runnerPayout,
    platformShare: runnerPayout == null ? null : fee - runnerPayout,
  }
}

export const DELIVERY_FEE_MESSAGES = {
  OUT_OF_SERVICE_AREA: `This location is outside our ${MAX_SERVICE_KM} km delivery area, so we can't deliver here yet. Choose a closer delivery spot.`,
  INVALID_DISTANCE: "We couldn't work out the distance to this location. Check the delivery spot and try again.",
}
