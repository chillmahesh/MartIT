import {
  FLAT_DELIVERY_FEE,
  FLAT_DELIVERY_FEE_LABEL,
  MAX_SERVICE_KM,
  PRICING_VERSION,
  RUNNER_PAYOUT_BY_FEE,
} from '@/config/fees'

/**
 * Pure delivery-fee calculation under the MVP Flat Delivery Fee Policy.
 * Shared shape with the backend; the server's result is authoritative and the
 * browser's copy is shown as an estimate.
 *
 * For new eligible orders within the supported campus delivery area (0 < distanceKm <= 5 km),
 * delivery is a flat ₹10.
 *
 * @param {number} distanceKm
 * @returns {{ ok: true, fee: number, distanceKm: number, label: string, pricingVersion: string }
 *         | { ok: false, reason: 'INVALID_DISTANCE' | 'OUT_OF_SERVICE_AREA', distanceKm: number, maxKm: number }}
 */
export function calculateDeliveryFee(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return { ok: false, reason: 'INVALID_DISTANCE', distanceKm, maxKm: MAX_SERVICE_KM }
  }
  if (distanceKm > MAX_SERVICE_KM) {
    return { ok: false, reason: 'OUT_OF_SERVICE_AREA', distanceKm, maxKm: MAX_SERVICE_KM }
  }

  return {
    ok: true,
    fee: FLAT_DELIVERY_FEE,
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
