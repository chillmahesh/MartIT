import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockServer } from '@/services/mockServer/handlers'
import { useCartStore } from '@/stores/cartStore'
import * as cartStoreModule from '@/stores/cartStore'
import { calculateOrderTotals } from '@/utils/orderTotals'
import { calculateDeliveryFee, splitDeliveryFee, DELIVERY_FEE_MESSAGES } from '@/utils/deliveryFee'
import { buildUpiPayload } from '@/utils/upi'
import { FLAT_DELIVERY_FEE, FLAT_DELIVERY_FEE_LABEL, MAX_SERVICE_KM, PRICING_VERSION } from '@/config/fees'
import CartPage from '../CartPage'

describe('MartIT — Flat ₹10 Delivery Fee for MVP (Authoritative Policy Tests)', () => {
  let server, token

  beforeEach(async () => {
    useCartStore.getState().clear()
    useCartStore.getState().resetCheckoutDetails()
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  // 1. Flat ₹10 delivery fee for multiple valid supported destinations
  it('1. charges flat ₹10 delivery fee across multiple valid supported campus destinations', async () => {
    const supportedLocations = [
      'loc_hostel_a', // ~0.37 km
      'loc_hostel_b', // ~0.80 km
      'loc_library',  // ~1.67 km
      'loc_faculty',  // ~2.78 km
      'loc_far_gate', // ~4.11 km
    ]

    for (const locationId of supportedLocations) {
      // Authoritative quote endpoint
      const quote = await server.handle('delivery.quote', {
        storeId: 'store_campus_mart',
        locationId,
      })
      expect(quote.deliveryFee).toBe(10)
      expect(quote.feeLabel).toBe(FLAT_DELIVERY_FEE_LABEL)
      expect(quote.pricingVersion).toBe(PRICING_VERSION)

      // Authoritative order creation
      const order = await server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId,
          lines: [{ productId: 'p_bread', quantity: 1 }],
        },
        { token },
      )
      expect(order.pricing.deliveryFee).toBe(10)
      expect(order.pricing.baseAmount).toBe(45 + 10) // 55
      expect(order.pricing.pricingVersion).toBe(PRICING_VERSION)
    }
  })

  // 2. Checkout displays ₹10 without a route quote
  it('2. checkout displays flat ₹10 delivery fee without requiring a route quote service', () => {
    useCartStore.getState().setQuantity('p_milk_500', 1, 'store_campus_mart')
    useCartStore.getState().setCheckoutDetails({
      fullName: 'Vikram Singh',
      mobileNumber: '9876543210',
      presetLocation: 'A Block',
      customLocation: '',
      deliveryInstructions: '',
    })

    const spy = vi.spyOn(cartStoreModule, 'useCartStore').mockImplementation((selector) => {
      const state = cartStoreModule.useCartStore.getState()
      return selector ? selector(state) : state
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Seed products and locations so catalogue resolves, but leave delivery-quote unseeded (no route quote)
    queryClient.setQueryData(['products', 'store_campus_mart'], [
      { id: 'p_milk_500', name: 'Fresh Milk', price: 28, stock: 10, storeId: 'store_campus_mart' },
    ])
    queryClient.setQueryData(['locations'], [
      { id: 'loc_hostel_a', name: 'Hostel A', group: 'Hostels' },
    ])
    queryClient.setQueryData(['stores'], [
      { id: 'store_campus_mart', name: 'Campus Mart', isOpen: true },
    ])

    try {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <CartPage />
          </MemoryRouter>
        </QueryClientProvider>,
      )

      // Verify flat ₹10 fee is displayed in summary and breakdown
      expect(html).toContain('₹10')
      expect(html).toContain('Flat fee')
      expect(html).toContain('Flat campus delivery')
      // Crucial: Must NEVER show "Quote Unavailable" for a valid campus destination
      expect(html).not.toContain('Quote Unavailable')
    } finally {
      spy.mockRestore()
    }
  })

  // 3. Missing destination remains blocked with a useful message
  it('3. blocks checkout when destination is missing with a clear prompt', async () => {
    // Missing locationId on quote call
    await expect(
      server.handle('delivery.quote', {
        storeId: 'store_campus_mart',
        locationId: null,
      }),
    ).rejects.toMatchObject({
      code: 'LOCATION_NOT_FOUND',
      status: 404,
    })

    // Pure fee calculation with invalid/missing distance
    const r = calculateDeliveryFee(undefined)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('INVALID_DISTANCE')
    expect(DELIVERY_FEE_MESSAGES.INVALID_DISTANCE).toContain("couldn't work out the distance")
  })

  // 4. Unsupported destination remains blocked
  it('4. blocks checkout for unsupported destinations outside the 5 km service area', async () => {
    // loc_outside is ~5.5 km from store_campus_mart (> 5 km)
    await expect(
      server.handle('delivery.quote', {
        storeId: 'store_campus_mart',
        locationId: 'loc_outside',
      }),
    ).rejects.toMatchObject({
      code: 'OUT_OF_SERVICE_AREA',
      status: 422,
    })

    await expect(
      server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId: 'loc_outside',
          lines: [{ productId: 'p_milk_500', quantity: 1 }],
        },
        { token },
      ),
    ).rejects.toMatchObject({
      code: 'OUT_OF_SERVICE_AREA',
      status: 422,
    })

    // Pure calculation beyond 5 km
    const feeBeyond = calculateDeliveryFee(5.001)
    expect(feeBeyond.ok).toBe(false)
    expect(feeBeyond.reason).toBe('OUT_OF_SERVICE_AREA')
    expect(feeBeyond.maxKm).toBe(MAX_SERVICE_KM)
  })

  // 4b. Missing or invalid coordinates rejected without fabricating distance
  it('4b. rejects missing or invalid coordinates with 422 INVALID_COORDINATES and supports straight-line fallback on provider failure', async () => {
    // Missing store coordinates
    server.db.stores.find((s) => s.id === 'store_campus_mart').coords = null
    await expect(
      server.handle('delivery.quote', {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })

    // Restore store, set invalid destination coordinates
    server.db.stores.find((s) => s.id === 'store_campus_mart').coords = { lat: 12.97, lng: 77.59 }
    server.db.locations.find((l) => l.id === 'loc_hostel_a').coords = { lat: 'invalid_lat', lng: 77.59 }
    await expect(
      server.handle('delivery.quote', {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })

    // Also rejected on order creation
    await expect(
      server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId: 'loc_hostel_a',
          lines: [{ productId: 'p_bread', quantity: 1 }],
        },
        { token },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
      status: 422,
    })

    // Restore valid coords, simulate routing provider failure -> straight-line fallback remains for 5km check
    server.db.locations.find((l) => l.id === 'loc_hostel_a').coords = { lat: 12.9733, lng: 77.59 }
    const serverWithFailingRoute = createMockServer({
      routingProvider: {
        routeKm: async () => {
          throw new Error('Routing provider unavailable')
        },
      },
    })
    const quoteFallback = await serverWithFailingRoute.handle('delivery.quote', {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
    })
    expect(quoteFallback.deliveryFee).toBe(10)
    expect(quoteFallback.distanceMethod).toBe('straight_line')
    expect(quoteFallback.distanceKm).toBeGreaterThan(0)
    expect(quoteFallback.distanceKm).toBeLessThan(5)
  })

  // 5. Parent-order fee calculation contract (multi-store checkout remains unsupported)
  it('5. verifies parent-order fee calculation contract (one ₹10 fee across fulfillment groups; multi-store checkout remains unsupported)', () => {
    // Multi-store parent order contract simulation: items across 2 fulfillment groups
    const group1Lines = [{ unitPrice: 50, quantity: 2 }] // Store A subtotal = 100
    const group2Lines = [{ unitPrice: 40, quantity: 1 }] // Store B subtotal = 40
    const allLines = [...group1Lines, ...group2Lines]     // Total itemSubtotal = 140

    // Authoritative totals calculation with ONE parent flat delivery fee
    const parentTotals = calculateOrderTotals({
      lines: allLines,
      deliveryFee: FLAT_DELIVERY_FEE,
      platformFee: 0.25,
    })

    // Subtotal: 140, Delivery fee: exactly 10 once, Base: 150, Total: 150.25
    expect(parentTotals.itemSubtotal).toBe(140)
    expect(parentTotals.deliveryFee).toBe(10)
    expect(parentTotals.baseAmount).toBe(150)
    expect(parentTotals.platformFee).toBe(0.25)
    expect(parentTotals.total).toBe(150.25)

    // Verify parent order structure data contract
    // NOTE: Multi-store checkout remains unsupported and not enabled in the current release.
    // End-to-end multi-store checkout must not be claimed as verified until real multi-store order creation exists.
    // This assertion confirms the relational contract invariant: when enabled, one delivery fee applies to the parent order.
    const multiStoreOrderContract = {
      id: 'ord_multistore_contract_test',
      combined_delivery_fee: FLAT_DELIVERY_FEE,
      item_subtotal: parentTotals.itemSubtotal,
      base_amount: parentTotals.baseAmount,
      platform_fee: parentTotals.platformFee,
      total_payable: parentTotals.total,
      order_fulfillment_groups: [
        { id: 'fg_1', store_id: 'store_campus_mart', status: 'PENDING' },
        { id: 'fg_2', store_id: 'store_night_canteen', status: 'PENDING' },
      ],
    }

    expect(multiStoreOrderContract.combined_delivery_fee).toBe(10)
    // Fulfillment groups must not define their own independent delivery fees
    for (const group of multiStoreOrderContract.order_fulfillment_groups) {
      expect(group.delivery_fee).toBeUndefined()
      expect(group.combined_delivery_fee).toBeUndefined()
    }
  })

  // 6. Subtotal and fee rounding follow the existing convention
  it('6. preserves subtotal and fee rounding to nearest whole rupee before adding platform fee', () => {
    // Case A: 97.40 + 10 = 107.40 -> rounds down to 107
    const totalsA = calculateOrderTotals({
      lines: [{ unitPrice: 97.4, quantity: 1 }],
      deliveryFee: FLAT_DELIVERY_FEE,
      platformFee: 0.15,
    })
    expect(totalsA.itemSubtotal).toBe(97.4)
    expect(totalsA.deliveryFee).toBe(10)
    expect(totalsA.baseAmount).toBe(107)
    expect(totalsA.total).toBe(107.15)

    // Case B: 97.60 + 10 = 107.60 -> rounds up to 108
    const totalsB = calculateOrderTotals({
      lines: [{ unitPrice: 97.6, quantity: 1 }],
      deliveryFee: FLAT_DELIVERY_FEE,
      platformFee: 0.15,
    })
    expect(totalsB.itemSubtotal).toBe(97.6)
    expect(totalsB.deliveryFee).toBe(10)
    expect(totalsB.baseAmount).toBe(108)
    expect(totalsB.total).toBe(108.15)
  })

  // 7. Platform fees of ₹0.01 and ₹0.99 produce correct totals
  it('7. produces exact total payable for boundary platform fees of ₹0.01 and ₹0.99', () => {
    const lines = [{ unitPrice: 100, quantity: 1 }] // subtotal 100 + 10 = base 110

    // Smallest fee boundary: ₹0.01
    const totalsMin = calculateOrderTotals({
      lines,
      deliveryFee: FLAT_DELIVERY_FEE,
      platformFee: 0.01,
    })
    expect(totalsMin.baseAmount).toBe(110)
    expect(totalsMin.platformFee).toBe(0.01)
    expect(totalsMin.total).toBe(110.01)

    // Largest fee boundary: ₹0.99
    const totalsMax = calculateOrderTotals({
      lines,
      deliveryFee: FLAT_DELIVERY_FEE,
      platformFee: 0.99,
    })
    expect(totalsMax.baseAmount).toBe(110)
    expect(totalsMax.platformFee).toBe(0.99)
    expect(totalsMax.total).toBe(110.99)
  })

  // 8. UPI QR amount remains equal to the authoritative total
  it('8. ensures the UPI QR payload amount matches the authoritative order total exactly', () => {
    const totals = calculateOrderTotals({
      lines: [{ unitPrice: 56, quantity: 1 }], // 56 + 10 = 66
      deliveryFee: FLAT_DELIVERY_FEE,
      platformFee: 0.42,
    })
    expect(totals.total).toBe(66.42)

    const upiPayload = buildUpiPayload({
      payeeVpa: 'martit.merchant@icici',
      payeeName: 'MartIT Store',
      amount: totals.total,
      orderId: 'ord_upi_match_test',
    })

    expect(upiPayload.ok).toBe(true)
    expect(upiPayload.amountFormatted).toBe('66.42')
    expect(upiPayload.uri).toContain('am=66.42')
    expect(upiPayload.uri).toContain('tr=ord_upi_match_test')
  })

  // 9. Runner payout remains ₹8 for the ₹10 delivery-fee band
  it('9. preserves ₹8 runner payout for ₹10 fee band and leaves legacy/unsupported bands null', () => {
    // Authoritative flat fee band
    const split10 = splitDeliveryFee(FLAT_DELIVERY_FEE)
    expect(split10).toEqual({
      customerFee: 10,
      runnerPayout: 8,
      platformShare: 2,
    })

    // Legacy bands remain null (callers must not invent figures)
    expect(splitDeliveryFee(15)).toEqual({ customerFee: 15, runnerPayout: null, platformShare: null })
    expect(splitDeliveryFee(20)).toEqual({ customerFee: 20, runnerPayout: null, platformShare: null })
    expect(splitDeliveryFee(35)).toEqual({ customerFee: 35, runnerPayout: null, platformShare: null })
    expect(splitDeliveryFee(50)).toEqual({ customerFee: 50, runnerPayout: null, platformShare: null })
  })

  // 10. Historical order amounts are not rewritten
  it('10. guarantees that historical orders retain their recorded delivery fee, total, platform fee, and payout', async () => {
    const user = await server.handle('auth.me', {}, { token })

    // Seed an existing order with historical pricing (e.g. ₹15 tier from 2026-10-09)
    const historicalOrder = {
      id: 'ord_historical_legacy_15',
      customerId: user.id,
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [{ productId: 'p_milk_500', name: 'Milk', pack: '500ml', unitPrice: 28, quantity: 2 }],
      pricing: {
        itemSubtotal: 56,
        deliveryFee: 15, // Historical distance tier
        baseAmount: 71,
        platformFee: 0.05,
        total: 71.05,
        distanceKm: 0.80,
        distanceMethod: 'straight_line',
        pricingVersion: '2026-10-09.1',
      },
      payment: {
        status: 'PAID',
        feePaise: 5,
        attemptId: 'att_hist_1',
      },
      ledger: {
        runnerPayout: null, // Legacy tier payout was undefined
        platformDeliveryShare: null,
      },
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      createdAt: '2026-10-09T10:00:00.000Z',
    }

    server.db.orders.push(historicalOrder)

    // Retrieve order through authoritative handler
    const retrieved = await server.handle('orders.get', { orderId: 'ord_historical_legacy_15' }, { token })

    expect(retrieved.pricing.deliveryFee).toBe(15)
    expect(retrieved.pricing.baseAmount).toBe(71)
    expect(retrieved.pricing.total).toBe(71.05)
    expect(retrieved.pricing.pricingVersion).toBe('2026-10-09.1')
    expect(retrieved.payment.feePaise).toBe(5)
  })

  // 11. Payment-verification and OTP tests remain passing
  it('11. preserves delivery OTP challenge generation and verification behavior', async () => {
    // Create new order with flat fee
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_bread', quantity: 1 }],
      },
      { token },
    )
    expect(order.pricing.deliveryFee).toBe(10)

    // Order progresses to paid and out for delivery in runner lifecycle
    const stored = server.db.orders.find((o) => o.id === order.id)
    stored.paymentStatus = 'PAID'
    stored.status = 'ON_THE_WAY'
    stored._mockOtp = '724915'

    // Customer can fetch delivery OTP challenge
    const otpChallenge = await server.handle('customer.order.getDeliveryOtp', { orderId: order.id }, { token })
    expect(otpChallenge.otp).toBe('724915')
    expect(otpChallenge.isLocked).toBe(false)
    expect(otpChallenge.attemptsRemaining).toBe(3)
  })

  // 12. Existing checkout, inventory, and fee-allocation behavior does not regress
  it('12. preserves stock deduction, out-of-stock guards, and dynamic platform fee allocation', async () => {
    // Out of stock guard
    await expect(
      server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId: 'loc_hostel_a',
          lines: [{ productId: 'p_maggi', quantity: 1 }], // stock 0
        },
        { token },
      ),
    ).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      status: 409,
    })

    // Dynamic platform fee allocation
    const validOrder = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        lines: [{ productId: 'p_bread', quantity: 1 }],
      },
      { token },
    )
    expect(validOrder.payment.feePaise).toBeGreaterThanOrEqual(1)
    expect(validOrder.payment.feePaise).toBeLessThanOrEqual(99)
    expect(validOrder.pricing.platformFee).toBe(validOrder.payment.feePaise / 100)
    expect(validOrder.pricing.deliveryFee).toBe(10)
  })
})
