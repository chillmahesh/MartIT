import { TAX_RATE } from '@/config/fees'
import { sumRupees } from './currency'

/**
 * Customer total = item subtotal + delivery fee + platform fee.
 * Taxes and discounts are excluded until explicitly defined in config/fees.js.
 * Supports multi-store fee breakdown (baseDeliveryFee + additionalStoreSurcharge).
 *
 * @param {{
 *   lines: Array<{ unitPrice: number, quantity: number }>,
 *   deliveryFee: number,
 *   platformFee?: number,
 *   baseDeliveryFee?: number,
 *   additionalStoreSurcharge?: number
 * }} input
 */
export function calculateOrderTotals({ lines, deliveryFee, platformFee, baseDeliveryFee, additionalStoreSurcharge }) {
  if (TAX_RATE != null) {
    // Guard so that defining a value in config can't silently skip the totals logic.
    throw new Error('Tax defined in config but not implemented in calculateOrderTotals')
  }
  const hasPlatformFee = typeof platformFee === 'number'
  if (hasPlatformFee && (platformFee < 0 || !Number.isFinite(platformFee))) {
    throw new Error('Invalid platform fee')
  }
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('Invalid quantity')
    if (typeof line.unitPrice !== 'number' || !(line.unitPrice >= 0)) throw new Error('Invalid unit price')
  }
  const itemSubtotal = sumRupees(lines.map((l) => l.unitPrice * l.quantity))
  const baseAmount = Math.round(itemSubtotal + deliveryFee)

  const result = {
    itemSubtotal,
    deliveryFee,
    total: sumRupees([itemSubtotal, deliveryFee]),
  }

  if (hasPlatformFee) {
    const basePaise = Math.round(baseAmount * 100)
    const feePaise = Math.round(platformFee * 100)
    result.baseAmount = baseAmount
    result.platformFee = platformFee
    result.total = (basePaise + feePaise) / 100
  }

  if (typeof baseDeliveryFee === 'number') {
    result.baseDeliveryFee = baseDeliveryFee
  }
  if (typeof additionalStoreSurcharge === 'number') {
    result.additionalStoreSurcharge = additionalStoreSurcharge
  }

  return result
}

