import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as cartStoreModule from '@/stores/cartStore'
import {
  useCartStore,
  selectDistinctStoreIds,
  selectCartLinesByStore,
  selectMultiStoreCount,
  selectIsMultiStore,
  selectCartStoreId,
} from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import CartPage from '@/pages/customer/CartPage'
import { MULTI_STORE_SURCHARGE, FLAT_DELIVERY_FEE } from '@/config/fees'

describe('Cart Selector Referential Stability & Error #185 Prevention', () => {
  let queryClient

  beforeEach(() => {
    useCartStore.getState().clear()
    useCartStore.getState().resetCheckoutDetails()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selectDistinctStoreIds retains referential equality across consecutive reads', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    const state1 = useCartStore.getState()
    const result1 = selectDistinctStoreIds(state1)
    const result2 = selectDistinctStoreIds(state1)

    // Strict referential equality (crucial for useSyncExternalStore / React 19)
    expect(result1).toBe(result2)
    expect(result1).toEqual(['store_campus_mart'])
  })

  it('selectDistinctStoreIds retains referential equality when unrelated store state updates', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    const stateBefore = useCartStore.getState()
    const resultBefore = selectDistinctStoreIds(stateBefore)

    // Update checkoutDetails (this triggered Error #185 before selector stabilization)
    store.setCheckoutDetails({ fullName: 'Aarav Sharma', mobileNumber: '9876543210' })
    const stateAfter = useCartStore.getState()
    const resultAfter = selectDistinctStoreIds(stateAfter)

    expect(resultBefore).toBe(resultAfter)
    expect(resultAfter).toEqual(['store_campus_mart'])

    // Update warning modal state
    store.dismissMultiStoreWarning()
    const stateAfterDismiss = useCartStore.getState()
    const resultAfterDismiss = selectDistinctStoreIds(stateAfterDismiss)

    expect(resultBefore).toBe(resultAfterDismiss)
  })

  it('selectDistinctStoreIds retains referential equality when item quantity changes within same store', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    const result1 = selectDistinctStoreIds(useCartStore.getState())

    // Increase quantity of same product
    store.setQuantity('p_milk_500', 3, 'store_campus_mart')
    const result2 = selectDistinctStoreIds(useCartStore.getState())

    expect(result1).toBe(result2)

    // Add another product from the SAME store
    store.setQuantity('p_bread_white', 1, 'store_campus_mart')
    const result3 = selectDistinctStoreIds(useCartStore.getState())

    expect(result1).toBe(result3)
  })

  it('selectDistinctStoreIds updates reference only when store set changes', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    const resultSingle = selectDistinctStoreIds(useCartStore.getState())
    expect(resultSingle).toEqual(['store_campus_mart'])

    // Add item from different store
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')
    const resultMulti = selectDistinctStoreIds(useCartStore.getState())

    expect(resultSingle).not.toBe(resultMulti)
    expect(resultMulti).toEqual(['store_campus_mart', 'store_night_canteen'])

    // Remove second store item
    store.setQuantity('p_nc_maggi', 0, 'store_night_canteen')
    const resultBackToSingle = selectDistinctStoreIds(useCartStore.getState())

    expect(resultMulti).not.toBe(resultBackToSingle)
    expect(resultBackToSingle).toEqual(['store_campus_mart'])
  })

  it('selectCartLinesByStore retains referential stability when lines do not change', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')

    const state1 = useCartStore.getState()
    const groups1 = selectCartLinesByStore(state1)
    const groups2 = selectCartLinesByStore(state1)

    expect(groups1).toBe(groups2)
    expect(groups1).toHaveLength(2)

    // Unrelated update
    store.setCheckoutDetails({ deliveryInstructions: 'Call upon arrival' })
    const state2 = useCartStore.getState()
    const groups3 = selectCartLinesByStore(state2)

    expect(groups1).toBe(groups3)
  })

  it('simulates client useSyncExternalStore snapshot checks preventing infinite loop', () => {
    // In React 19, useSyncExternalStore calls getSnapshot and verifies Object.is(prev, next)
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    // 1. Initial snapshot
    const snapshot1 = selectDistinctStoreIds(useCartStore.getState())

    // 2. Component renders and triggers profile prefill (state update to checkoutDetails)
    store.setCheckoutDetails({ fullName: 'Priya Patel' })

    // 3. React useSyncExternalStore verifies snapshot stability
    const snapshot2 = selectDistinctStoreIds(useCartStore.getState())
    expect(Object.is(snapshot1, snapshot2)).toBe(true)

    // 4. Another unrelated update (e.g. phone number)
    store.setCheckoutDetails({ mobileNumber: '9876543210' })
    const snapshot3 = selectDistinctStoreIds(useCartStore.getState())
    expect(Object.is(snapshot1, snapshot3)).toBe(true)

    // 5. Warning dismissed
    store.dismissMultiStoreWarning()
    const snapshot4 = selectDistinctStoreIds(useCartStore.getState())
    expect(Object.is(snapshot1, snapshot4)).toBe(true)
  })

  it('renders CartPage with empty cart without maximum-update-depth error', () => {
    useCartStore.getState().clear()

    expect(() => {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(CartPage, null))
        )
      )
      expect(html).toContain('Your Cart is Empty')
      expect(html).toContain('Explore Campus Catalogue')
    }).not.toThrow()
  })

  it('renders CartPage with single-store cart without maximum-update-depth error', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')

    vi.spyOn(cartStoreModule, 'useCartStore').mockImplementation((selector) => {
      const state = cartStoreModule.useCartStore.getState()
      return selector ? selector(state) : state
    })

    expect(() => {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(CartPage, null))
        )
      )
      expect(html).toContain('Your Cart')
      expect(html).toContain('Delivery Destination')
      expect(html).toContain('Toned Milk')
    }).not.toThrow()
  })

  it('renders CartPage with persisted multi-store cart without maximum-update-depth error', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')

    vi.spyOn(cartStoreModule, 'useCartStore').mockImplementation((selector) => {
      const state = cartStoreModule.useCartStore.getState()
      return selector ? selector(state) : state
    })

    expect(() => {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(CartPage, null))
        )
      )
      expect(html).toContain('Multi-Store Order (2 Stores)')
      expect(html).toContain('Combined Delivery')
      expect(html).toContain('Campus Mart')
      expect(html).toContain('Night Canteen')
      expect(html).toContain('Additional Store Surcharge')
    }).not.toThrow()
  })

  it('renders CartPage with authenticated user prefill without re-render loop', () => {
    // Set authenticated user in auth store
    useAuthStore.setState({
      user: {
        id: 'usr_test_student',
        name: 'Omkar R',
        phone: '9876543210',
        email: 'omkar@campus.edu',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_a',
      },
      token: 'jwt_mock_test_token',
    })

    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    vi.spyOn(cartStoreModule, 'useCartStore').mockImplementation((selector) => {
      const state = cartStoreModule.useCartStore.getState()
      return selector ? selector(state) : state
    })

    expect(() => {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(CartPage, null))
        )
      )
      expect(html).toContain('Your Cart')
      expect(html).toContain('Delivery Destination')
    }).not.toThrow()

    // Clean up auth store
    useAuthStore.setState({ user: null, token: null })
  })

  it('updates store count, grouped products, surcharge and estimated total when cart changes', () => {
    const store = useCartStore.getState()

    // 1. Initial single-store state
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    expect(selectDistinctStoreIds(useCartStore.getState())).toEqual(['store_campus_mart'])
    expect(selectMultiStoreCount(useCartStore.getState())).toBe(1)
    expect(selectIsMultiStore(useCartStore.getState())).toBe(false)

    // 2. Add second store
    store.setQuantity('p_nc_maggi', 3, 'store_night_canteen')
    const multiState = useCartStore.getState()
    expect(selectDistinctStoreIds(multiState)).toEqual(['store_campus_mart', 'store_night_canteen'])
    expect(selectMultiStoreCount(multiState)).toBe(2)
    expect(selectIsMultiStore(multiState)).toBe(true)

    // 3. Add third store
    store.setQuantity('p_stationery_notebook', 1, 'store_stationery')
    const threeStoreState = useCartStore.getState()
    expect(selectMultiStoreCount(threeStoreState)).toBe(3)
    expect(selectIsMultiStore(threeStoreState)).toBe(true)
    expect(selectDistinctStoreIds(threeStoreState)).toHaveLength(3)

    // 4. Remove third store
    store.setQuantity('p_stationery_notebook', 0, 'store_stationery')
    const backToTwoState = useCartStore.getState()
    expect(selectMultiStoreCount(backToTwoState)).toBe(2)
    expect(selectDistinctStoreIds(backToTwoState)).toEqual(['store_campus_mart', 'store_night_canteen'])

    // 5. Remove second store
    store.setQuantity('p_nc_maggi', 0, 'store_night_canteen')
    const backToOneState = useCartStore.getState()
    expect(selectMultiStoreCount(backToOneState)).toBe(1)
    expect(selectDistinctStoreIds(backToOneState)).toEqual(['store_campus_mart'])
    expect(selectIsMultiStore(backToOneState)).toBe(false)
  })

  it('handles multi-store warning opening on transition and dismissal without losing cart contents', () => {
    const store = useCartStore.getState()

    // 1. Initial single-store item
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    expect(useCartStore.getState().showMultiStoreWarning).toBe(false)
    expect(useCartStore.getState().warningDismissed).toBe(false)

    // 2. Add product from second store: modal triggers
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')
    expect(useCartStore.getState().showMultiStoreWarning).toBe(true)
    expect(useCartStore.getState().warningDismissed).toBe(false)

    // 3. Dismiss warning: modal closes, cart contents and quantities preserved
    store.dismissMultiStoreWarning()
    expect(useCartStore.getState().showMultiStoreWarning).toBe(false)
    expect(useCartStore.getState().warningDismissed).toBe(true)
    expect(useCartStore.getState().lines).toHaveLength(2)

    // 4. Update quantity of existing item: warning does not re-trigger
    store.setQuantity('p_nc_maggi', 2, 'store_night_canteen')
    expect(useCartStore.getState().showMultiStoreWarning).toBe(false)
    expect(useCartStore.getState().warningDismissed).toBe(true)
  })

  it('persists and rehydrates multi-store cart across session refresh', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 3, 'store_campus_mart')
    store.setQuantity('p_nc_maggi', 2, 'store_night_canteen')
    store.dismissMultiStoreWarning()

    const activeState = useCartStore.getState()
    const serialized = JSON.stringify({
      state: {
        storeId: 'store_campus_mart',
        lines: activeState.lines,
        warningDismissed: activeState.warningDismissed,
      },
      version: 0,
    })

    // Simulate clearing memory state and rehydrating from serialized session
    useCartStore.getState().clear()
    expect(useCartStore.getState().lines).toHaveLength(0)

    const parsed = JSON.parse(serialized)
    useCartStore.setState(parsed.state)

    const rehydrated = useCartStore.getState()
    expect(rehydrated.lines).toHaveLength(2)
    expect(selectMultiStoreCount(rehydrated)).toBe(2)
    expect(selectDistinctStoreIds(rehydrated)).toEqual(['store_campus_mart', 'store_night_canteen'])
    expect(rehydrated.warningDismissed).toBe(true)
  })

  it('renders navigation links into /app and back from /app/cart without navigation loop', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')

    vi.spyOn(cartStoreModule, 'useCartStore').mockImplementation((selector) => {
      const state = cartStoreModule.useCartStore.getState()
      return selector ? selector(state) : state
    })

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/app/cart'] },
          React.createElement(CartPage, null)
        )
      )
    )

    // Back to catalogue link
    expect(html).toContain('href="/app"')
    expect(html).toContain('Your Cart')
  })
})
