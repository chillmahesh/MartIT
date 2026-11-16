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
    } finally {
      spy.mockRestore()
    }
  })
})
