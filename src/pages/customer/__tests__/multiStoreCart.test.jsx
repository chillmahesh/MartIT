import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as cartStoreModule from '@/stores/cartStore'
import {
  useCartStore,
  selectDistinctStoreIds,
  selectIsMultiStore,
  selectMultiStoreCount,
} from '@/stores/cartStore'
import CartPage from '@/pages/customer/CartPage'
import { FLAT_DELIVERY_FEE, MULTI_STORE_SURCHARGE } from '@/config/fees'
import { calculateAdditionalStoreSurcharge, calculateDeliveryFee } from '@/utils/deliveryFee'
import { CustomerPaymentView } from '@/components/payment/CustomerPaymentView'
import { OrderConfirmationView } from '@/components/cart/OrderConfirmationView'

describe('Multi-Store Cart Store & Warning System (Milestone 12.2)', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('identifies single-store vs multi-store cart correctly', () => {
    const store = useCartStore.getState()
    expect(selectIsMultiStore(store)).toBe(false)
    expect(selectMultiStoreCount(store)).toBe(0)

    // Add first store product
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    const state1 = useCartStore.getState()
    expect(selectIsMultiStore(state1)).toBe(false)
    expect(selectMultiStoreCount(state1)).toBe(1)
    expect(selectDistinctStoreIds(state1)).toEqual(['store_campus_mart'])

    // Add second store product
    store.setQuantity('p_nc_maggi', 2, 'store_night_canteen')
    const state2 = useCartStore.getState()
    expect(selectIsMultiStore(state2)).toBe(true)
    expect(selectMultiStoreCount(state2)).toBe(2)
    expect(selectDistinctStoreIds(state2)).toEqual(['store_campus_mart', 'store_night_canteen'])
  })

  it('triggers customer warning modal when cart first transitions from 1 store to 2 stores', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    expect(useCartStore.getState().showMultiStoreWarning).toBe(false)

    // Second store addition
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')
    expect(useCartStore.getState().showMultiStoreWarning).toBe(true)
    expect(useCartStore.getState().warningDismissed).toBe(false)

    // Dismissal
    store.dismissMultiStoreWarning()
    expect(useCartStore.getState().showMultiStoreWarning).toBe(false)
    expect(useCartStore.getState().warningDismissed).toBe(true)
    // Contents preserved
    expect(useCartStore.getState().lines).toHaveLength(2)
  })

  it('resets warning dismissed state when store count returns to 1', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')
    store.dismissMultiStoreWarning()
    expect(useCartStore.getState().warningDismissed).toBe(true)

    // Remove night canteen item
    store.setQuantity('p_nc_maggi', 0, 'store_night_canteen')
    expect(useCartStore.getState().lines).toHaveLength(1)
    expect(useCartStore.getState().warningDismissed).toBe(false)

    // Add night canteen item again -> warning re-triggers
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')
    expect(useCartStore.getState().showMultiStoreWarning).toBe(true)
  })

  it('calculates additional store surcharge accurately in pricing helpers', () => {
    // 1 store: 0 surcharge
    expect(calculateAdditionalStoreSurcharge(1, 10)).toBe(0)
    // 2 stores: 1 * 10 = 10
    expect(calculateAdditionalStoreSurcharge(2, 10)).toBe(10)
    // 3 stores: 2 * 10 = 20
    expect(calculateAdditionalStoreSurcharge(3, 10)).toBe(20)

    const deliveryResult = calculateDeliveryFee(2.5, 3, { surcharge: 15 })
    expect(deliveryResult.ok).toBe(true)
    expect(deliveryResult.baseDeliveryFee).toBe(FLAT_DELIVERY_FEE)
    expect(deliveryResult.additionalStoreSurcharge).toBe(30)
    expect(deliveryResult.fee).toBe(FLAT_DELIVERY_FEE + 30)
  })

  it('renders CartPage with grouped store items and persistent indicator when multi-store', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')

    const spy = vi.spyOn(cartStoreModule, 'useCartStore').mockImplementation((selector) => {
      const state = cartStoreModule.useCartStore.getState()
      return selector ? selector(state) : state
    })

    try {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(CartPage, null))
        )
      )

      // Persistent multi-store indicator
      expect(html).toContain('Multi-Store Order (2 Stores)')
      expect(html).toContain('Combined Delivery')
      // Both stores rendered
      expect(html).toContain('Campus Mart')
      expect(html).toContain('Night Canteen')
      // Delivery fee breakdown
      expect(html).toContain('Base Delivery Fee:')
      expect(html).toContain('Total Delivery Fee:')
      expect(html).toContain('Additional Store Surcharge')
      expect(html).toContain('An additional surcharge of ₹10 is included.')
      expect(html).toContain('Base ₹10 + Surcharge ₹10')
      expect(html).toContain('Total Delivery Fee:')
    } finally {
      spy.mockRestore()
    }
  })

  it('renders CustomerPaymentView with multi-store details and granular surcharge breakdown', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const multiStoreOrder = {
      id: 'ord_multi_123',
      customerId: 'usr_alice',
      storeIds: ['store_campus_mart', 'store_night_canteen'],
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      status: 'AWAITING_PAYMENT',
      paymentStatus: 'PENDING',
      lines: [
        { productId: 'p_milk', name: 'Toned Milk', unitPrice: 28, quantity: 1, lineSubtotal: 28 },
        { productId: 'p_maggi', name: 'Cheese Maggi', unitPrice: 65, quantity: 1, lineSubtotal: 65 },
      ],
      fulfillmentGroups: [
        { id: 'grp_1', storeId: 'store_campus_mart', storeSnapshot: { name: 'Campus Mart' }, status: 'PENDING' },
        { id: 'grp_2', storeId: 'store_night_canteen', storeSnapshot: { name: 'Night Canteen' }, status: 'PENDING' },
      ],
      pricing: {
        itemSubtotal: 93,
        deliveryFee: 20,
        baseDeliveryFee: 10,
        additionalStoreSurcharge: 10,
        baseAmount: 113,
        platformFee: 0.15,
        total: 113.15,
        distanceKm: 1.2,
      },
      payment: {
        status: 'PENDING',
        feePaise: 15,
        windowExpiresAt: new Date(Date.now() + 100000).toISOString(),
      },
    }

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, React.createElement(CustomerPaymentView, { initialOrder: multiStoreOrder }))
      )
    )

    // Displays multi-store label and store names
    expect(html).toContain('Stores (Multi-Store)')
    expect(html).toContain('Campus Mart, Night Canteen')
    // Displays delivery fee and breakdown
    expect(html).toContain('Multi-Store')
    expect(html).toContain('Base')
    // Combined total
    expect(html).toContain('Final Authoritative Total')
    expect(html).toContain('₹113.15')
  })

  it('renders OrderConfirmationView with multi-store pickup progress checklist and breakdown', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const confirmedMultiStoreOrder = {
      id: 'ord_confirmed_multi',
      customerId: 'usr_alice',
      storeIds: ['store_campus_mart', 'store_night_canteen'],
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      status: 'PREPARING',
      paymentStatus: 'PAID',
      runnerName: 'Runner Rob',
      runnerId: 'usr_runner_1',
      lines: [
        { productId: 'p_milk', name: 'Toned Milk', unitPrice: 28, quantity: 1 },
        { productId: 'p_maggi', name: 'Cheese Maggi', unitPrice: 65, quantity: 1 },
      ],
      fulfillmentGroups: [
        { id: 'grp_1', storeId: 'store_campus_mart', storeSnapshot: { name: 'Campus Mart' }, status: 'PICKED_UP' },
        { id: 'grp_2', storeId: 'store_night_canteen', storeSnapshot: { name: 'Night Canteen' }, status: 'PENDING' },
      ],
      pricing: {
        itemSubtotal: 93,
        deliveryFee: 20,
        baseDeliveryFee: 10,
        additionalStoreSurcharge: 10,
        baseAmount: 113,
        platformFee: 0.15,
        total: 113.15,
        distanceKm: 1.2,
      },
      payment: {
        status: 'PAID',
        feePaise: 15,
      },
      createdAt: new Date().toISOString(),
    }

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, React.createElement(OrderConfirmationView, { order: confirmedMultiStoreOrder }))
      )
    )

    // Multi-store store name
    expect(html).toContain('Stores (Multi-Store Order)')
    expect(html).toContain('Campus Mart, Night Canteen')
    // Multi-store pickup status
    expect(html).toContain('Multi-Store Pickup Status')
    expect(html).toContain('1 of 2 Picked Up')
    expect(html).toContain('Collected')
    expect(html).toContain('Pending Pickup')
    // Fee breakdown
    expect(html).toContain('Multi-Store')
  })
})
