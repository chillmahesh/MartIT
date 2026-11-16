import { describe, expect, it } from 'vitest'
import {
  calculateDeliveryFee,
  calculateAdditionalStoreSurcharge,
  splitDeliveryFee,
} from '@/utils/deliveryFee'
import { FLAT_DELIVERY_FEE, MULTI_STORE_SURCHARGE } from '@/config/fees'

const fee = (km) => calculateDeliveryFee(km)

describe('calculateDeliveryFee — MVP flat ₹10 policy', () => {
  it.each([
    [0.001, 10],
    [0.25, 10],
    [0.5, 10],
    [0.5000001, 10],
    [0.501, 10],
    [1, 10],
    [1.001, 10],
    [1.5, 10],
    [2, 10],
    [2.0000001, 10],
    [2.3, 10],
    [3, 10],
    [3.0001, 10],
    [3.4, 10],
    [4, 10],
    [4.0001, 10],
    [4.99, 10],
    [5, 10], // max radius is inclusive
  ])('%s km → ₹%s (flat fee)', (km, expected) => {
    const r = fee(km)
    expect(r.ok).toBe(true)
    expect(r.fee).toBe(expected)
    expect(r.distanceKm).toBe(km) // unrounded distance is preserved
    expect(r.label).toBe('Flat campus delivery')
    expect(r.pricingVersion).toBeTruthy()
  })

  it.each([5.0000001, 5.01, 6, 120])('blocks checkout beyond 5 km (%s km)', (km) => {
    expect(fee(km)).toMatchObject({ ok: false, reason: 'OUT_OF_SERVICE_AREA', maxKm: 5 })
  })

  it.each([0, -1, NaN, Infinity, '1', null, undefined])('rejects invalid distance %s', (km) => {
    expect(fee(km)).toMatchObject({ ok: false, reason: 'INVALID_DISTANCE' })
  })

  it('has no free delivery path', () => {
    for (let km = 0.05; km <= 5; km += 0.05) expect(fee(km).fee).toBeGreaterThan(0)
  })
})

describe('calculateAdditionalStoreSurcharge', () => {
  it('returns 0 surcharge for 1 store (single store cart)', () => {
    expect(calculateAdditionalStoreSurcharge(1, 15)).toBe(0)
    expect(calculateAdditionalStoreSurcharge(1, 0)).toBe(0)
  })

  it('returns 0 surcharge for 0 or negative stores', () => {
    expect(calculateAdditionalStoreSurcharge(0, 15)).toBe(0)
    expect(calculateAdditionalStoreSurcharge(-1, 15)).toBe(0)
  })

  it('calculates A = max(0, N - 1) * S for multiple stores', () => {
    // 2 stores => 1 additional store * ₹15 = ₹15
    expect(calculateAdditionalStoreSurcharge(2, 15)).toBe(15)
    // 3 stores => 2 additional stores * ₹15 = ₹30
    expect(calculateAdditionalStoreSurcharge(3, 15)).toBe(30)
    // 4 stores => 3 additional stores * ₹20 = ₹60
    expect(calculateAdditionalStoreSurcharge(4, 20)).toBe(60)
  })

  it('uses MULTI_STORE_SURCHARGE when surcharge is not passed', () => {
    const expected = Math.max(0, 2 - 1) * MULTI_STORE_SURCHARGE
    expect(calculateAdditionalStoreSurcharge(2)).toBe(expected)
  })

  it('safely handles non-integer or invalid surcharge rates', () => {
    expect(calculateAdditionalStoreSurcharge(3, -5)).toBe(0)
    expect(calculateAdditionalStoreSurcharge(3, 'invalid')).toBe(0)
    expect(calculateAdditionalStoreSurcharge(3, null)).toBe(0)
  })
})

describe('calculateDeliveryFee — Multi-Store Surcharge Support', () => {
  it('returns base delivery fee and 0 surcharge for single store order (N = 1)', () => {
    const result = calculateDeliveryFee(1.5, 1, { surcharge: 15 })
    expect(result.ok).toBe(true)
    expect(result.fee).toBe(FLAT_DELIVERY_FEE)
    expect(result.baseDeliveryFee).toBe(FLAT_DELIVERY_FEE)
    expect(result.additionalStoreSurcharge).toBe(0)
    expect(result.storeCount).toBe(1)
  })

  it('adds additional store surcharge for 2 stores (N = 2, D = B + S)', () => {
    const result = calculateDeliveryFee(1.5, 2, { surcharge: 15 })
    expect(result.ok).toBe(true)
    expect(result.baseDeliveryFee).toBe(FLAT_DELIVERY_FEE)
    expect(result.additionalStoreSurcharge).toBe(15)
    expect(result.fee).toBe(FLAT_DELIVERY_FEE + 15)
    expect(result.storeCount).toBe(2)
  })

  it('adds additional store surcharge for 3 stores (N = 3, D = B + 2S)', () => {
    const result = calculateDeliveryFee(2.0, 3, { surcharge: 15 })
    expect(result.ok).toBe(true)
    expect(result.baseDeliveryFee).toBe(FLAT_DELIVERY_FEE)
    expect(result.additionalStoreSurcharge).toBe(30)
    expect(result.fee).toBe(FLAT_DELIVERY_FEE + 30)
    expect(result.storeCount).toBe(3)
  })

  it('defaults surcharge to ₹0 when no surcharge is configured (safe default)', () => {
    const result = calculateDeliveryFee(1.0, 3, { surcharge: 0 })
    expect(result.ok).toBe(true)
    expect(result.baseDeliveryFee).toBe(FLAT_DELIVERY_FEE)
    expect(result.additionalStoreSurcharge).toBe(0)
    expect(result.fee).toBe(FLAT_DELIVERY_FEE)
  })

  it('recalculates surcharge downwards when items from a store are removed', () => {
    const threeStores = calculateDeliveryFee(1.0, 3, { surcharge: 15 })
    expect(threeStores.fee).toBe(FLAT_DELIVERY_FEE + 30)

    const twoStores = calculateDeliveryFee(1.0, 2, { surcharge: 15 })
    expect(twoStores.fee).toBe(FLAT_DELIVERY_FEE + 15)

    const singleStore = calculateDeliveryFee(1.0, 1, { surcharge: 15 })
    expect(singleStore.fee).toBe(FLAT_DELIVERY_FEE)
  })
})

describe('splitDeliveryFee', () => {
  it('keeps runner payout separate from the customer fee', () => {
    expect(splitDeliveryFee(10)).toEqual({ customerFee: 10, runnerPayout: 8, platformShare: 2 })
  })
  it('does not invent a payout for longer bands', () => {
    expect(splitDeliveryFee(20)).toEqual({ customerFee: 20, runnerPayout: null, platformShare: null })
  })
})
