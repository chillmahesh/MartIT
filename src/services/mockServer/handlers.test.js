import { beforeEach, describe, expect, it } from 'vitest'
import { createMockServer } from './handlers'

let server, token
const call = (name, payload) => server.handle(name, payload, { token })

beforeEach(async () => {
  server = createMockServer()
  token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
})

describe('delivery.quote (server-authoritative)', () => {
  it.each([
    'loc_hostel_a',
    'loc_hostel_b',
    'loc_library',
    'loc_faculty',
    'loc_far_gate',
  ])('%s → ₹10 flat fee, straight-line disclosed', async (locationId) => {
    const q = await call('delivery.quote', { storeId: 'store_campus_mart', locationId })
    expect(q.deliveryFee).toBe(10)
    expect(q.distanceMethod).toBe('straight_line')
  })

  it('blocks locations outside the 5 km radius', async () => {
    await expect(call('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_outside' })).rejects.toMatchObject({
      code: 'OUT_OF_SERVICE_AREA',
      status: 422,
    })
  })

  it('uses route distance when a routing provider is available while charging flat ₹10', async () => {
    server = createMockServer({ routingProvider: { routeKm: async () => 1.001 } })
    const q = await server.handle('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_hostel_a' })
    expect(q).toMatchObject({ distanceMethod: 'route', distanceKm: 1.001, deliveryFee: 10 })
  })

  it('rejects quote when store coordinates are missing with 422 INVALID_COORDINATES', async () => {
    server.db.stores.find((s) => s.id === 'store_campus_mart').coords = null
    await expect(
      call('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_hostel_a' }),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })
  })

  it('rejects quote when destination coordinates are missing with 422 INVALID_COORDINATES', async () => {
    server.db.locations.find((l) => l.id === 'loc_hostel_a').coords = null
    await expect(
      call('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_hostel_a' }),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })
  })

  it('rejects quote when coordinates are non-finite or invalid with 422 INVALID_COORDINATES', async () => {
    server.db.locations.find((l) => l.id === 'loc_hostel_a').coords = { lat: 'invalid_lat', lng: 77.59 }
    await expect(
      call('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_hostel_a' }),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })

    server.db.stores.find((s) => s.id === 'store_campus_mart').coords = { lat: NaN, lng: 77.59 }
    await expect(
      call('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_hostel_b' }),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })
  })

  it('falls back to straight-line distance when routing provider fails while coordinates are valid', async () => {
    server = createMockServer({
      routingProvider: {
        routeKm: async () => {
          throw new Error('Routing service unreachable')
        },
      },
    })
    const q = await server.handle('delivery.quote', { storeId: 'store_campus_mart', locationId: 'loc_hostel_a' })
    expect(q.deliveryFee).toBe(10)
    expect(q.distanceMethod).toBe('straight_line')
    expect(q.distanceKm).toBeGreaterThan(0)
    expect(q.distanceKm).toBeLessThan(5)
  })
})

describe('orders.create', () => {
  const base = { storeId: 'store_campus_mart', locationId: 'loc_hostel_b' }

  it('ignores browser-supplied prices, fee and total', async () => {
    const order = await call('orders.create', {
      ...base,
      lines: [{ productId: 'p_milk_500', quantity: 2, unitPrice: 1 }],
      deliveryFee: 0,
      platformFee: 0,
      total: 1,
    })
    expect(order.pricing).toMatchObject({ itemSubtotal: 56, deliveryFee: 10, baseAmount: 66, platformFee: 0.01, total: 66.01 })
    expect(order.lines[0].unitPrice).toBe(28)
  })

  it('snapshots distance, method and pricing version; hides internal ledger', async () => {
    const order = await call('orders.create', { ...base, lines: [{ productId: 'p_bread', quantity: 1 }] })
    expect(order.pricing.distanceKm).toBeGreaterThan(0.5)
    expect(order.pricing.pricingVersion).toBeTruthy()
    expect(order.ledger).toBeUndefined()
    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.paymentStatus).toBe('PENDING')
  })

  it('later price changes do not alter the stored order', async () => {
    const order = await call('orders.create', { ...base, lines: [{ productId: 'p_bread', quantity: 1 }] })
    server.db.products.find((p) => p.id === 'p_bread').price = 999
    expect(server.db.orders.find((o) => o.id === order.id).pricing.total).toBe(order.pricing.total)
  })

  it('charges flat ₹10 fee regardless of campus location', async () => {
    const line = [{ productId: 'p_bread', quantity: 1 }]
    const near = await call('orders.create', { ...base, locationId: 'loc_hostel_a', lines: line })
    const far = await call('orders.create', { ...base, locationId: 'loc_faculty', lines: line })
    expect([near.pricing.deliveryFee, far.pricing.deliveryFee]).toEqual([10, 10])
  })

  it('rejects out-of-stock, out-of-area and unauthenticated requests', async () => {
    const line = [{ productId: 'p_bread', quantity: 1 }]
    await expect(call('orders.create', { ...base, lines: [{ productId: 'p_maggi', quantity: 1 }] })).rejects.toMatchObject({ code: 'OUT_OF_STOCK' })
    await expect(call('orders.create', { ...base, locationId: 'loc_outside', lines: line })).rejects.toMatchObject({ code: 'OUT_OF_SERVICE_AREA' })
    await expect(server.handle('orders.create', { ...base, lines: line }, {})).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('rejects order creation when destination coordinates are missing or invalid', async () => {
    server.db.locations.find((l) => l.id === 'loc_hostel_a').coords = null
    await expect(
      call('orders.create', {
        ...base,
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_bread', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_COORDINATES' })
  })
})
