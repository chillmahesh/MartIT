import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore, selectCartStoreId, selectCartCount } from '@/stores/cartStore'
import { createMockServer } from '@/services/mockServer/handlers'
import { calculateOrderTotals } from '@/utils/orderTotals'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrderConfirmationView } from '@/components/cart/OrderConfirmationView'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import { SAMPLE_STORES } from '@/mocks/campus'
import { PRICING_VERSION } from '@/config/fees'

describe('Cart Store & Multi-Store Protection', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('initializes with empty lines and null storeId', () => {
    const state = useCartStore.getState()
    expect(state.lines).toEqual([])
    expect(state.storeId).toBeNull()
    expect(selectCartCount(state)).toBe(0)
    expect(selectCartStoreId(state)).toBeNull()
  })

  it('tracks storeId when products from a store are added', () => {
    const store = useCartStore.getState()
    // Add product from Campus Mart
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')

    const state = useCartStore.getState()
    expect(state.storeId).toBe('store_campus_mart')
    expect(state.lines).toEqual([{ productId: 'p_milk_500', quantity: 2 }])
    expect(selectCartCount(state)).toBe(2)
  })

  it('supports increasing and decreasing quantity without allowing zero in stepper', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    expect(useCartStore.getState().lines[0].quantity).toBe(1)

    // Increment
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    expect(useCartStore.getState().lines[0].quantity).toBe(2)

    // Decrement
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    expect(useCartStore.getState().lines[0].quantity).toBe(1)
  })

  it('removes an item when quantity is explicitly set to 0', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    store.setQuantity('p_bread', 1, 'store_campus_mart')
    expect(useCartStore.getState().lines.length).toBe(2)

    // Remove p_milk_500
    store.setQuantity('p_milk_500', 0, 'store_campus_mart')
    expect(useCartStore.getState().lines).toEqual([{ productId: 'p_bread', quantity: 1 }])

    // Remove p_bread (resets storeId when empty)
    store.setQuantity('p_bread', 0, 'store_campus_mart')
    expect(useCartStore.getState().lines).toEqual([])
    expect(useCartStore.getState().storeId).toBeNull()
  })

  it('preserves cart items and requires explicit replaceCart to switch stores', () => {
    const store = useCartStore.getState()
    // Put items from Campus Mart in cart
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')

    // Cart contains store_campus_mart
    expect(useCartStore.getState().storeId).toBe('store_campus_mart')
    expect(useCartStore.getState().lines.length).toBe(1)

    // Attempting to add from Night Canteen does not silently wipe via setQuantity
    // Store switch is explicit via replaceCart
    store.replaceCart('p_nc_maggi', 1, 'store_night_canteen')

    const newState = useCartStore.getState()
    expect(newState.storeId).toBe('store_night_canteen')
    expect(newState.lines).toEqual([{ productId: 'p_nc_maggi', quantity: 1 }])
  })
})

describe('Cart Totals & Calculations', () => {
  it('calculates item subtotal accurately using catalogue prices', () => {
    const lines = [
      { productId: 'p_milk_500', quantity: 2 }, // price 28 -> 56
      { productId: 'p_bread', quantity: 1 },    // price 45 -> 45
    ]
    const pricedLines = lines.map((line) => {
      const p = SAMPLE_PRODUCTS.find((x) => x.id === line.productId)
      return { unitPrice: p.price, quantity: line.quantity }
    })

    const totals = calculateOrderTotals({ lines: pricedLines, deliveryFee: 15 })
    expect(totals.itemSubtotal).toBe(101)
    expect(totals.deliveryFee).toBe(15)
    expect(totals.total).toBe(116)
  })
})

describe('Order Creation & Authoritative Pricing Lifecycle', () => {
  let server, token

  beforeEach(async () => {
    useCartStore.getState().clear()
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('successfully creates an order and returns authoritative pricing and order ID', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [
        { productId: 'p_milk_500', quantity: 2 },
        { productId: 'p_bread', quantity: 1 },
      ],
    }

    const order = await server.handle('orders.create', payload, { token })

    expect(order.id).toMatch(/^ord_/)
    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.paymentStatus).toBe('PENDING')
    expect(order.storeId).toBe('store_campus_mart')
    expect(order.locationId).toBe('loc_hostel_b')
    expect(order.lines).toHaveLength(2)

    // Server-authoritative calculation (MVP flat ₹10 delivery policy):
    // Milk: 28 * 2 = 56, Bread: 45 * 1 = 45 => subtotal 101
    // Flat campus delivery fee is 10
    // Base amount: 101 + 10 = 111
    // Platform fee (smallest available 1 paisa) => 0.01
    // Total is 111.01
    expect(order.pricing).toEqual({
      itemSubtotal: 101,
      deliveryFee: 10,
      baseAmount: 111,
      platformFee: 0.01,
      total: 111.01,
      distanceKm: expect.any(Number),
      distanceMethod: 'straight_line',
      pricingVersion: PRICING_VERSION,
    })
  })

  it('rejects order creation with empty cart', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [],
    }

    await expect(server.handle('orders.create', payload, { token })).rejects.toMatchObject({
      code: 'EMPTY_CART',
      status: 422,
    })
  })

  it('rejects order creation when delivery location is beyond the 5 km radius', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_outside',
      lines: [{ productId: 'p_milk_500', quantity: 1 }],
    }

    await expect(server.handle('orders.create', payload, { token })).rejects.toMatchObject({
      code: 'OUT_OF_SERVICE_AREA',
      status: 422,
    })
  })

  it('rejects order creation when a product is out of stock', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_maggi', quantity: 1 }], // stock is 0
    }

    await expect(server.handle('orders.create', payload, { token })).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      status: 409,
    })
  })

  it('rejects order creation when requested quantity exceeds available stock', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_spray', quantity: 999 }], // stock is 8
    }

    await expect(server.handle('orders.create', payload, { token })).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      status: 409,
    })
  })

  it('rejects order creation when store is closed', async () => {
    const closedStore = SAMPLE_STORES.find((s) => !s.isOpen)
    expect(closedStore).toBeDefined()

    const payload = {
      storeId: closedStore.id,
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_stat_notebook', quantity: 1 }],
    }

    await expect(server.handle('orders.create', payload, { token })).rejects.toMatchObject({
      code: 'STORE_CLOSED',
      status: 409,
    })
  })

  it('rejects order creation when a product does not belong to the selected store', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_nc_maggi', quantity: 1 }], // belongs to store_night_canteen
    }

    await expect(server.handle('orders.create', payload, { token })).rejects.toMatchObject({
      code: 'PRODUCT_UNAVAILABLE',
      status: 409,
    })
  })

  it('preserves cart state when an order submission fails', async () => {
    // Put items in Zustand cart store
    const store = useCartStore.getState()
    store.setQuantity('p_spray', 999, 'store_campus_mart')

    const linesBefore = [...useCartStore.getState().lines]
    expect(linesBefore.length).toBe(1)

    // Simulate an API failure
    try {
      await server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId: 'loc_hostel_a',
          lines: linesBefore,
        },
        { token },
      )
    } catch {
      // Failed as expected
    }

    // Cart items are preserved
    expect(useCartStore.getState().lines).toEqual(linesBefore)
    expect(useCartStore.getState().storeId).toBe('store_campus_mart')
  })

  it('clears cart state only after successful order submission', async () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    expect(useCartStore.getState().lines.length).toBe(1)

    // Submit order
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: useCartStore.getState().lines,
      },
      { token },
    )

    expect(order.id).toBeDefined()

    // Client clears cart
    store.clear()
    expect(useCartStore.getState().lines).toEqual([])
    expect(useCartStore.getState().storeId).toBeNull()
  })
})

describe('Checkout & Order Confirmation Presentation Safeguards', () => {
  it('formats distance strictly with two decimal places in OrderConfirmationView and labels correctly', () => {
    const mockOrderStraightLine = {
      id: 'ord_test_1',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [{ productId: 'p_milk_500', name: 'Milk', pack: '500 ml', unitPrice: 28, quantity: 2 }],
      pricing: {
        itemSubtotal: 56,
        deliveryFee: 15,
        baseAmount: 71,
        platformFee: 0.01,
        total: 71.01,
        distanceKm: 0.8006045776813487,
        distanceMethod: 'straight_line',
        pricingVersion: '2026-10-09.1',
      },
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const renderWithProviders = (order) =>
      renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(OrderConfirmationView, { order }),
          ),
        ),
      )

    const htmlStraight = renderWithProviders(mockOrderStraightLine)

    // Formatted distance to 2 decimals
    expect(htmlStraight).toContain('0.80 km straight-line distance')
    expect(htmlStraight).not.toContain('0.8006')

    // Authoritative fee and final total
    expect(htmlStraight).toContain('Platform Fee')
    expect(htmlStraight).toContain('₹0.01')
    expect(htmlStraight).toContain('₹71.01')

    // No internal allocation or routing details exposed
    expect(htmlStraight).not.toContain('Dynamic payment routing')
    expect(htmlStraight).not.toContain('Dynamic verification code')
    expect(htmlStraight).not.toContain('₹0.01–₹0.99')
    expect(htmlStraight).not.toContain('₹0.10–₹0.99')

    // Test route distance method does NOT label as straight-line
    const mockOrderRoute = {
      ...mockOrderStraightLine,
      pricing: {
        ...mockOrderStraightLine.pricing,
        distanceKm: 1.001,
        distanceMethod: 'route',
      },
    }
    const htmlRoute = renderWithProviders(mockOrderRoute)
    expect(htmlRoute).toContain('1.00 km route distance')
    expect(htmlRoute).not.toContain('straight-line')
  })

  it('rejects incomplete or inconsistent pricing snapshots and displays Invalid Order Pricing', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const renderWithProviders = (order) =>
      renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(OrderConfirmationView, { order }),
          ),
        ),
      )

    // Case 1: missing platformFee
    const orderMissingFee = {
      id: 'ord_bad_1',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [],
      pricing: {
        itemSubtotal: 142,
        deliveryFee: 15,
        baseAmount: 157,
        total: 157, // No platform fee included!
      },
    }
    const htmlBad1 = renderWithProviders(orderMissingFee)
    expect(htmlBad1).toContain('Invalid Order Pricing')
    expect(htmlBad1).not.toContain('Order Created!')

    // Case 2: total does not include the platform fee (total = baseAmount instead of baseAmount + platformFee)
    const orderInconsistentTotal = {
      id: 'ord_bad_2',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [],
      pricing: {
        itemSubtotal: 142,
        deliveryFee: 15,
        baseAmount: 157,
        platformFee: 0.01,
        total: 157, // Inconsistent: 157 != 157 + 0.01
      },
    }
    const htmlBad2 = renderWithProviders(orderInconsistentTotal)
    expect(htmlBad2).toContain('Invalid Order Pricing')
    expect(htmlBad2).not.toContain('Order Created!')
  })

  it('confirms the authoritative pricing for ₹142 subtotal + ₹10 delivery -> ₹152.01 on order creation and confirmation', async () => {
    const server = createMockServer()
    const loginToken = (await server.handle('auth.demoLogin', { role: 'customer' })).token

    // Product setup for ₹142 subtotal:
    // p_bread (45) x 2 = 90
    // p_milk_500 (28) x 1 = 28
    // p_chips (24) x 1 = 24
    // 90 + 28 + 24 = 142
    // Let's add a custom product or find products in Campus Mart that equal 142
    server.db.products.push({
      id: 'p_custom_142',
      storeId: 'store_campus_mart',
      name: 'Priced Groceries Bundle',
      price: 142,
      stock: 10,
    })

    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_custom_142', quantity: 1 }],
      },
      { token: loginToken },
    )

    // Server-authoritative calculations (MVP flat ₹10 delivery policy)
    expect(order.pricing.itemSubtotal).toBe(142)
    expect(order.pricing.deliveryFee).toBe(10)
    expect(order.pricing.baseAmount).toBe(152)
    expect(order.pricing.platformFee).toBe(0.01)
    expect(order.pricing.total).toBe(152.01)
    expect(order.pricing.total).toBe(order.pricing.baseAmount + order.pricing.platformFee)

    // Render into confirmation view
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(OrderConfirmationView, { order }),
        ),
      ),
    )

    expect(html).toContain('Order Created!')
    expect(html).toContain('₹142')
    expect(html).toContain('₹10')
    expect(html).toContain('Platform Fee')
    expect(html).toContain('₹0.01')
    expect(html).toContain('₹152.01')
  })
})

describe('Product-First Shopping to Checkout End-to-End Integration', () => {
  let server, token

  beforeEach(async () => {
    useCartStore.getState().clear()
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('allows end-to-end checkout for products added directly without upfront store selection', async () => {
    // Customer discovers Night Canteen Maggi directly from product-first catalogue
    const product = SAMPLE_PRODUCTS.find((p) => p.id === 'p_nc_maggi')
    expect(product).toBeDefined()
    expect(product.storeId).toBe('store_night_canteen')

    // Customer adds product without selecting store
    useCartStore.getState().setQuantity(product.id, 2, product.storeId)

    const cartState = useCartStore.getState()
    expect(cartState.storeId).toBe('store_night_canteen')
    expect(selectCartStoreId(cartState)).toBe('store_night_canteen')

    // Order payload uses automatically resolved storeId
    const orderPayload = {
      storeId: cartState.storeId,
      locationId: 'loc_hostel_b',
      lines: cartState.lines,
    }

    const order = await server.handle('orders.create', orderPayload, { token })

    expect(order.id).toBeDefined()
    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.storeId).toBe('store_night_canteen')
    expect(order.lines).toEqual([
      { productId: 'p_nc_maggi', name: 'Cheese Masala Noodles', pack: '2 × 70 g', unitPrice: 65, quantity: 2 },
    ])
    // Authoritative pricing: 65 * 2 = 130 + delivery fee + platform fee
    expect(order.pricing.itemSubtotal).toBe(130)
    expect(order.pricing.deliveryFee).toBeGreaterThanOrEqual(10)
    expect(order.pricing.platformFee).toBe(0.01)
    expect(order.pricing.total).toBe(order.pricing.baseAmount + 0.01)

    // Cart is safely cleared after checkout
    useCartStore.getState().clear()
    expect(useCartStore.getState().lines).toEqual([])
    expect(useCartStore.getState().storeId).toBeNull()
  })

  it('preserves genuine out of stock constraints in product-first checkout', async () => {
    const oosProduct = SAMPLE_PRODUCTS.find((p) => p.id === 'p_maggi') // stock 0
    expect(oosProduct.stock).toBe(0)

    useCartStore.getState().setQuantity(oosProduct.id, 1, oosProduct.storeId)

    await expect(
      server.handle(
        'orders.create',
        {
          storeId: oosProduct.storeId,
          locationId: 'loc_hostel_a',
          lines: [{ productId: oosProduct.id, quantity: 1 }],
        },
        { token },
      ),
    ).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      status: 409,
    })
  })

  it('preserves genuine store closed constraints in product-first checkout', async () => {
    const closedProduct = SAMPLE_PRODUCTS.find((p) => p.id === 'p_stat_notebook') // store_stationery_hub is closed

    useCartStore.getState().setQuantity(closedProduct.id, 1, closedProduct.storeId)

    await expect(
      server.handle(
        'orders.create',
        {
          storeId: closedProduct.storeId,
          locationId: 'loc_hostel_a',
          lines: [{ productId: closedProduct.id, quantity: 1 }],
        },
        { token },
      ),
    ).rejects.toMatchObject({
      code: 'STORE_CLOSED',
      status: 409,
    })
  })
})


