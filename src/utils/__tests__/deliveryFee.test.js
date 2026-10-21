import { describe, expect, it } from 'vitest'
import { calculateDeliveryFee, splitDeliveryFee } from '@/utils/deliveryFee'

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

describe('splitDeliveryFee', () => {
  it('keeps runner payout separate from the customer fee', () => {
    expect(splitDeliveryFee(10)).toEqual({ customerFee: 10, runnerPayout: 8, platformShare: 2 })
  })
  it('does not invent a payout for longer bands', () => {
    expect(splitDeliveryFee(20)).toEqual({ customerFee: 20, runnerPayout: null, platformShare: null })
  })
})
