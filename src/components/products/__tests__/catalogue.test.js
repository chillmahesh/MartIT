import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockServer } from '@/services/mockServer/handlers'
import { useCartStore, selectCartStoreId } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import { SAMPLE_CATEGORIES } from '@/mocks/categories'
import { SAMPLE_STORES } from '@/mocks/campus'
import { ProductCard } from '@/components/products/ProductCard'
import { ProductGrid } from '@/components/products/ProductGrid'
import { CategoryPills } from '@/components/products/CategoryPills'
import * as authStoreModule from '@/stores/authStore'
import { StoreHeader } from '@/components/products/StoreHeader'
import * as deliveryQuoteModule from '@/hooks/useDeliveryQuote'
import HomePage from '@/pages/customer/HomePage'

describe('Catalogue & Store Selection Mock Handlers', () => {
  let server

  beforeEach(() => {
    server = createMockServer()
  })

  it('returns all products across all campus stores when no storeId is specified', async () => {
    const products = await server.handle('catalogue.products', {})
    expect(products.length).toBe(SAMPLE_PRODUCTS.length)
    // Products from different stores are all present
    const storeIds = new Set(products.map((p) => p.storeId))
    expect(storeIds.has('store_campus_mart')).toBe(true)
    expect(storeIds.has('store_night_canteen')).toBe(true)
    expect(storeIds.has('store_stationery_hub')).toBe(true)
  })

  it('filters products by storeId when specifically queried for internal store needs', async () => {
    const campusMartProducts = await server.handle('catalogue.products', { storeId: 'store_campus_mart' })
    expect(campusMartProducts.every((p) => p.storeId === 'store_campus_mart')).toBe(true)
    expect(campusMartProducts.some((p) => p.id === 'p_milk_500')).toBe(true)

    const nightCanteenProducts = await server.handle('catalogue.products', { storeId: 'store_night_canteen' })
    expect(nightCanteenProducts.every((p) => p.storeId === 'store_night_canteen')).toBe(true)
    expect(nightCanteenProducts.some((p) => p.id === 'p_nc_maggi')).toBe(true)
  })

  it('returns categories list', async () => {
    const categories = await server.handle('catalogue.categories', {})
    expect(categories).toEqual(SAMPLE_CATEGORIES)
    expect(categories.length).toBe(SAMPLE_CATEGORIES.length)
  })

  it('returns stores with open/closed status', async () => {
    const stores = await server.handle('stores.list', {})
    expect(stores.length).toBeGreaterThanOrEqual(2)
    const openStore = stores.find((s) => s.id === 'store_campus_mart')
    expect(openStore?.isOpen).toBe(true)
    const closedStore = stores.find((s) => s.id === 'store_stationery_hub')
    expect(closedStore?.isOpen).toBe(false)
  })
})

describe('Product-First Catalogue Discovery & Search', () => {
  it('searches products across multiple stores simultaneously without selecting a store', () => {
    // Both Campus Mart and Night Canteen sell noodles
    const query = 'noodles'
    const results = SAMPLE_PRODUCTS.filter((p) => {
      const q = query.toLowerCase()
      const nameMatch = p.name.toLowerCase().includes(q)
      const packMatch = p.pack?.toLowerCase().includes(q)
      return nameMatch || packMatch
    })

    expect(results.length).toBeGreaterThanOrEqual(2)
    const stores = results.map((p) => p.storeId)
    expect(stores).toContain('store_campus_mart')
    expect(stores).toContain('store_night_canteen')
  })

  it('allows category browsing across all stores without requiring prior store selection', () => {
    // Instant food category has items in Campus Mart and Night Canteen
    const instantProducts = SAMPLE_PRODUCTS.filter((p) => p.categoryId === 'instant')
    expect(instantProducts.length).toBeGreaterThanOrEqual(2)
    expect(instantProducts.some((p) => p.storeId === 'store_campus_mart')).toBe(true)
    expect(instantProducts.some((p) => p.storeId === 'store_night_canteen')).toBe(true)
  })

  it('computes category counts across all campus products in CategoryPills', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(CategoryPills, {
          selectedCategory: 'all',
          onSelectCategory: () => {},
          products: SAMPLE_PRODUCTS,
        }),
      ),
    )

    // All Products pill has total count
    expect(html).toContain('All Products')
    expect(html).toContain(String(SAMPLE_PRODUCTS.length))
    // Category pill present
    expect(html).toContain('Milk, eggs &amp; bread')
  })

  it('handles empty search results cleanly with a reset action', () => {
    const query = 'unobtainium_widget_999'
    const results = SAMPLE_PRODUCTS.filter((p) => p.name.toLowerCase().includes(query))
    expect(results).toEqual([])

    const html = renderToString(
      React.createElement(ProductGrid, {
        products: [],
        isLoading: false,
        searchQuery: query,
        selectedCategory: 'all',
        onResetFilters: () => {},
      }),
    )

    expect(html).toContain('No items found')
    expect(html).toContain('Reset filters')
    expect(html).not.toContain('for the selected store')
  })

  it('renders loading skeleton when products are fetching', () => {
    const html = renderToString(
      React.createElement(ProductGrid, {
        products: [],
        isLoading: true,
      }),
    )

    expect(html).toContain('Loading product')
    expect(html).toContain('animate-shimmer')
  })
})

describe('Product-First Cart Operations & Store Identity', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('adds an item to cart without selecting a store and automatically adopts the product storeId', () => {
    const store = useCartStore.getState()
    expect(store.lines).toEqual([])
    expect(selectCartStoreId(store)).toBeNull()

    // Customer directly adds Night Canteen product without selecting store
    store.setQuantity('p_nc_maggi', 1, 'store_night_canteen')

    const state = useCartStore.getState()
    expect(state.lines).toEqual([{ productId: 'p_nc_maggi', quantity: 1 }])
    expect(state.storeId).toBe('store_night_canteen')
    expect(selectCartStoreId(state)).toBe('store_night_canteen')
  })

  it('clears cart and storeId when all items are removed', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 2, 'store_campus_mart')
    expect(useCartStore.getState().storeId).toBe('store_campus_mart')

    store.setQuantity('p_milk_500', 0, 'store_campus_mart')
    expect(useCartStore.getState().lines).toEqual([])
    expect(useCartStore.getState().storeId).toBeNull()
  })

  it('protects single-store cart integrity by requiring explicit replaceCart to switch stores', () => {
    const store = useCartStore.getState()
    store.setQuantity('p_milk_500', 1, 'store_campus_mart')
    expect(useCartStore.getState().storeId).toBe('store_campus_mart')

    // Switching to Night Canteen via replaceCart
    store.replaceCart('p_nc_soda', 2, 'store_night_canteen')

    const updated = useCartStore.getState()
    expect(updated.storeId).toBe('store_night_canteen')
    expect(updated.lines).toEqual([{ productId: 'p_nc_soda', quantity: 2 }])
  })
})

describe('Product Card Store Metadata & Stock Safeguards', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const renderCard = (product) =>
    renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, React.createElement(ProductCard, { product })),
      ),
    )

  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('renders store fulfillment metadata on the product card', () => {
    const product = SAMPLE_PRODUCTS.find((p) => p.id === 'p_milk_500')
    const html = renderCard(product)

    expect(html).toContain('Toned Milk')
    expect(html).toContain('500 ml')
    expect(html).toContain('Campus Mart')
  })

  it('displays Store closed badge and disables adding when store is closed', () => {
    const closedProduct = SAMPLE_PRODUCTS.find((p) => p.id === 'p_stat_notebook') // store_stationery_hub is closed
    const html = renderCard(closedProduct)

    expect(html).toContain('Store closed')
    expect(html).toContain('disabled')
  })

  it('displays Out of stock badge and disables adding when stock is 0', () => {
    const oosProduct = SAMPLE_PRODUCTS.find((p) => p.id === 'p_maggi') // stock: 0
    const html = renderCard(oosProduct)

    expect(html).toContain('Out of stock')
    expect(html).toContain('Unavailable')
    expect(html).toContain('disabled')
  })

  it('displays Low Stock badge when stock is 5 or fewer', () => {
    const lowStockProduct = {
      ...SAMPLE_PRODUCTS[0],
      id: 'p_test_low',
      stock: 3,
    }
    const html = renderCard(lowStockProduct)
    expect(html).toContain('Only')
    expect(html).toContain('3')
    expect(html).toContain('left')
  })

  it('renders real product image when imageUrl is present', () => {
    const product = SAMPLE_PRODUCTS.find((p) => p.id === 'p_milk_500')
    const html = renderCard(product)
    expect(html).toContain('src="/products/p_milk_500.png"')
    expect(html).toContain('alt="Toned Milk"')
  })

  it('gracefully falls back to static product image when imageUrl is null from remote database', () => {
    const remoteProduct = {
      ...SAMPLE_PRODUCTS.find((p) => p.id === 'p_bread'),
      imageUrl: null, // As returned by production Supabase currently
    }
    const html = renderCard(remoteProduct)
    expect(html).toContain('src="/products/p_bread.jpg"')
    expect(html).toContain('alt="Whole Wheat Bread"')
  })

  it('falls back to category vector illustration if neither imageUrl nor static asset exists', () => {
    const unknownProduct = {
      id: 'p_unknown_custom',
      storeId: 'store_campus_mart',
      categoryId: 'dairy',
      name: 'Custom Unmapped Item',
      pack: '1 pc',
      price: 10,
      mrp: 10,
      stock: 5,
      imageUrl: null,
    }
    const html = renderCard(unknownProduct)
    expect(html).not.toContain('<img')
    expect(html).toContain('<svg')
  })
})

describe('HomePage Product-First Shopping Experience', () => {
  it('renders customer catalogue without mandatory store selection dropdown or store header', () => {
    useAuthStore.setState({
      user: { id: 'usr_test_1', name: 'Devendra Patel', roles: ['customer'], defaultLocationId: 'loc_hostel_b' },
      token: 'tok_test',
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Seed query cache with sample data
    queryClient.setQueryData(['products', 'all'], SAMPLE_PRODUCTS)
    queryClient.setQueryData(['categories'], SAMPLE_CATEGORIES)
    queryClient.setQueryData(['stores'], SAMPLE_STORES)

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, React.createElement(HomePage)),
      ),
    )

    // Customer greeting is present
    expect(html).toContain('what do you need?')
    expect(html).toContain('Campus Delivery')

    // Search and categories are immediately available
    expect(html).toContain('Search milk, bread')
    expect(html).toContain('All Products')

    // Products from different stores are displayed
    expect(html).toContain('Toned Milk')
    expect(html).toContain('Cheese Masala Noodles')

    // MANDATORY STORE SELECTOR IS GONE
    expect(html).not.toContain('Select store')
    expect(html).not.toContain('Campus Stores')
    expect(html).not.toContain('Select a store to view its local inventory')
  })
})

describe('StoreHeader Delivery Radius Error Handling', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  it('renders "Outside 5 km delivery radius" for OUT_OF_SERVICE_AREA', () => {
    const authSpy = vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation((selector) => {
      const state = {
        user: { id: 'usr_test_1', name: 'Devendra Patel', roles: ['customer'], defaultLocationId: 'loc_hostel_b' },
        token: 'tok_test',
      }
      return selector ? selector(state) : state
    })
    const quoteSpy = vi.spyOn(deliveryQuoteModule, 'useDeliveryQuote').mockReturnValue({
      data: null,
      isError: true,
      error: { code: 'OUT_OF_SERVICE_AREA', message: 'Delivery location exceeds 5 km' },
    })

    try {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(StoreHeader, {
            stores: SAMPLE_STORES,
            selectedStoreId: 'store_campus_mart',
          })),
        ),
      )
      expect(html).toContain('Outside 5 km delivery radius')
      expect(html).not.toContain('Cannot deliver here')
    } finally {
      quoteSpy.mockRestore()
      authSpy.mockRestore()
    }
  })

  it('renders "Outside 5 km delivery radius" for MAX_DISTANCE_EXCEEDED', () => {
    const authSpy = vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation((selector) => {
      const state = {
        user: { id: 'usr_test_1', name: 'Devendra Patel', roles: ['customer'], defaultLocationId: 'loc_hostel_b' },
        token: 'tok_test',
      }
      return selector ? selector(state) : state
    })
    const quoteSpy = vi.spyOn(deliveryQuoteModule, 'useDeliveryQuote').mockReturnValue({
      data: null,
      isError: true,
      error: { code: 'MAX_DISTANCE_EXCEEDED', message: 'Distance exceeds 5 km limit' },
    })

    try {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(StoreHeader, {
            stores: SAMPLE_STORES,
            selectedStoreId: 'store_campus_mart',
          })),
        ),
      )
      expect(html).toContain('Outside 5 km delivery radius')
      expect(html).not.toContain('Cannot deliver here')
    } finally {
      quoteSpy.mockRestore()
      authSpy.mockRestore()
    }
  })

  it('renders "Cannot deliver here" for other quote errors', () => {
    const authSpy = vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation((selector) => {
      const state = {
        user: { id: 'usr_test_1', name: 'Devendra Patel', roles: ['customer'], defaultLocationId: 'loc_hostel_b' },
        token: 'tok_test',
      }
      return selector ? selector(state) : state
    })
    const quoteSpy = vi.spyOn(deliveryQuoteModule, 'useDeliveryQuote').mockReturnValue({
      data: null,
      isError: true,
      error: { code: 'INVALID_COORDINATES', message: 'Invalid coordinates' },
    })

    try {
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(StoreHeader, {
            stores: SAMPLE_STORES,
            selectedStoreId: 'store_campus_mart',
          })),
        ),
      )
      expect(html).toContain('Cannot deliver here')
      expect(html).not.toContain('Outside 5 km delivery radius')
    } finally {
      quoteSpy.mockRestore()
      authSpy.mockRestore()
    }
  })
})

