/**
 * Delivery pricing configuration — single source of truth for the client.
 * The backend MUST mirror these values; the server's calculation is authoritative.
 * Policy: docs/fee-policy.md (confirmed by product owner, 2026-10-09).
 *
 * Bump PRICING_VERSION whenever any value below changes. Orders store the version
 * they were priced with, so later changes never alter existing orders.
 */

export const PRICING_VERSION = '2026-10-16.1'

/**
 * MVP Flat Delivery Fee Policy.
 * Distance-tier pricing is replaced with a flat ₹10 delivery fee for new eligible orders.
 */
export const FLAT_DELIVERY_FEE = 10
export const FLAT_DELIVERY_FEE_LABEL = 'Flat campus delivery'

/**
 * Maximum delivery radius. Beyond this, checkout is blocked.
 * Supported campus delivery-area restrictions still apply.
 */
export const MAX_SERVICE_KM = 5

/**
 * Legacy distance bands and extended pricing (deferred beyond MVP).
 * Preserved for historical orders and backward compatibility.
 */
export const DELIVERY_FEE_BANDS = Object.freeze([
  Object.freeze({ maxKm: 0.5, fee: 10, label: 'Short campus delivery' }),
  Object.freeze({ maxKm: 1, fee: 15, label: 'Nearby hostel or campus location' }),
  Object.freeze({ maxKm: 2, fee: 20, label: 'Longer delivery' }),
])

/** Beyond the last flat band: base fee + per started kilometre (deferred). */
export const EXTENDED_DELIVERY = Object.freeze({
  fromKm: 2,
  baseFee: 20,
  perStartedKm: 5,
  label: 'Extended delivery',
})

/** No free delivery regardless of cart value (confirmed). */
export const FREE_DELIVERY_THRESHOLD = null

/**
 * Charges that are NOT yet defined. Taxes stay null and are excluded from totals
 * until the product owner sets real values.
 */
export const TAX_RATE = null
export const PLATFORM_FEE = null

/**
 * Dynamic platform fee configuration (Pre-Milestone 3).
 * Decimal fee assigned uniquely per payment attempt to correlate UPI transactions.
 * Ranges from ₹0.01 to ₹0.99 (1 to 99 paise).
 */
export const PLATFORM_FEE_MIN_PAISE = 1
export const PLATFORM_FEE_MAX_PAISE = 99
export const PLATFORM_FEE_WINDOW_MS = 2 * 60 * 1000 // 2-minute verification window
export const PLATFORM_FEE_COOLDOWN_MS = 5 * 60 * 1000 // 5-minute cooldown after window expiry
export const PLATFORM_FEE_HOLD_MS = PLATFORM_FEE_WINDOW_MS + PLATFORM_FEE_COOLDOWN_MS // 7 minutes total hold

/**
 * Runner compensation is a separate value from the customer delivery fee.
 * PROVISIONAL: only the short-distance example (₹8 of a ₹10 fee) has been given,
 * and it was described as illustrative. Longer bands must pay more for distance and
 * effort, but their amounts are not decided — they stay null and the UI must show
 * "payout confirmed at assignment" instead of inventing a number.
 */
export const RUNNER_PAYOUT_PROVISIONAL = true
export const RUNNER_PAYOUT_BY_FEE = Object.freeze({
  10: 8,
  15: null,
  20: null,
  25: null,
  30: null,
  35: null,
})
