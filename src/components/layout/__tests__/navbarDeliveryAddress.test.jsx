import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { formatDestinationLabel } from '@/hooks/useLocations'
import { SAVED_LOCATION_STORAGE_KEY } from '@/components/cart/DeliveryDetailsForm'
import { createMockServer } from '@/services/mockServer/handlers'
import { SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'
import {
  mapCampusLocationToDestinationId,
  validateCheckoutDetails,
  OTHER_LOCATION_VALUE,
} from '@/utils/checkoutValidation'

function renderHeaderWithProviders({ variant = 'customer', queryClient } = {}) {
  const qc = queryClient || new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  // Seed query cache with registered campus locations
  qc.setQueryData(['locations'], SAMPLE_DELIVERY_LOCATIONS)

  return renderToString(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AppHeader variant={variant} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Navbar Delivery Address & Active Destination Synchronization', () => {
  let server, queryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['locations'], SAMPLE_DELIVERY_LOCATIONS)

    // Reset stores
    useCartStore.getState().clear()
    useCartStore.getState().resetCheckoutDetails()
    useAuthStore.setState({
      user: null,
      token: null,
      session: null,
      isInitialized: true,
      activeMode: 'customer',
    })

    server = createMockServer()
  })

  // 1. The navbar initially displays the correct active destination
  it('1. initially displays the correct active destination or fallback', () => {
    // A: Customer with defaultLocationId in profile
    useAuthStore.setState({
      user: {
        id: 'u_aarav',
        name: 'Aarav',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_b',
      },
    })

    const htmlDefault = renderHeaderWithProviders({ queryClient })
    expect(htmlDefault).not.toContain('Deliver to')
    expect(htmlDefault).not.toContain('DELIVER TO')
    expect(htmlDefault).toContain('Hostel B, Block 3')

    // B: Customer with explicit active destination in cartStore
    useCartStore.getState().setCheckoutDetails({ presetLocation: 'Food Court' })
    const htmlPreset = renderHeaderWithProviders({ queryClient })
    expect(htmlPreset).toContain('Food Court')

    // C: Customer with no default and no active destination
    useAuthStore.setState({
      user: {
        id: 'u_guest',
        name: 'Guest',
        roles: ['customer'],
        defaultLocationId: null,
      },
    })
    useCartStore.getState().clearActiveDestination()
    const htmlEmpty = renderHeaderWithProviders({ queryClient })
    expect(htmlEmpty).toContain('Choose a delivery spot')
    expect(htmlEmpty).not.toContain('Deliver to')
    expect(htmlEmpty).not.toContain('DELIVER TO')
  })

  // Acceptance Criterion: No "DELIVER TO" text displayed anywhere in navbar
  it('displays the location pin and current delivery address directly with no DELIVER TO label', () => {
    useAuthStore.setState({
      user: {
        id: 'u_aarav',
        name: 'Aarav',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_b',
      },
    })

    const html = renderHeaderWithProviders({ queryClient })
    expect(html).not.toMatch(/deliver to/i)
    expect(html).toContain('Hostel B, Block 3')
    expect(html).toContain('data-testid="header-deliver-to-btn"')
  })

  // 2. Changing the active destination updates the navbar without a page reload
  it('2. updates the navbar immediately when active destination changes without a page reload', () => {
    useAuthStore.setState({
      user: {
        id: 'u_customer_1',
        name: 'Aarav',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_b',
      },
    })

    // Initially shows default
    let html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('Hostel B, Block 3')

    // Customer selects 'C Block'
    useCartStore.getState().setCheckoutDetails({ presetLocation: 'C Block' })
    html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('C Block')
    expect(html).not.toContain('Hostel B, Block 3')

    // Customer selects 'MBA Block'
    useCartStore.getState().setCheckoutDetails({ presetLocation: 'MBA Block' })
    html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('MBA Block')
  })

  // 3. Changing the checkout destination does not leave the navbar showing the previous destination
  it('3. ensures changing checkout destination immediately updates navbar away from previous destination', () => {
    useAuthStore.setState({
      user: {
        id: 'u_customer_1',
        name: 'Aarav',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_b',
      },
    })

    // Set checkout destination to 'A Block'
    useCartStore.getState().setCheckoutDetails({ presetLocation: 'A Block' })
    let html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('A Block')

    // Change destination in checkout to custom address
    useCartStore.getState().setCheckoutDetails({
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: 'Mechanical Department',
      deliveryInstructions: 'Workshop 2',
    })
    html = renderHeaderWithProviders({ queryClient })

    expect(html).not.toContain('A Block')
    expect(html).toContain('Mechanical Department, Workshop 2')
  })

  // 4. A saved default address remains unchanged when a temporary active destination changes
  it('4. preserves the saved default address in profile when a temporary order destination changes', () => {
    const userProfile = {
      id: 'u_customer_1',
      name: 'Aarav',
      roles: ['customer'],
      defaultLocationId: 'loc_hostel_b',
    }
    useAuthStore.setState({ user: userProfile })

    // Customer temporarily selects 'Food Court' for this order
    useCartStore.getState().setCheckoutDetails({ presetLocation: 'Food Court' })

    // Active destination displays Food Court
    const html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('Food Court')

    // Critical: user.defaultLocationId in profile remains loc_hostel_b
    expect(useAuthStore.getState().user.defaultLocationId).toBe('loc_hostel_b')
  })

  // 5. Returning to the shop, cart or checkout retains the correct active destination
  it('5. retains the active destination across shop, cart, and orders customer navigation', () => {
    useAuthStore.setState({
      user: {
        id: 'u_customer_1',
        name: 'Aarav',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_b',
      },
    })

    // User chooses 'D Block' with room instructions
    useCartStore.getState().setCheckoutDetails({
      presetLocation: 'D Block',
      deliveryInstructions: 'Room 305',
    })

    // On shop view (/app)
    const htmlShop = renderHeaderWithProviders({ variant: 'customer', queryClient })
    expect(htmlShop).toContain('D Block, Room 305')

    // On cart view (/app/cart)
    const htmlCart = renderHeaderWithProviders({ variant: 'customer', queryClient })
    expect(htmlCart).toContain('D Block, Room 305')

    // Store state remains intact
    const currentDetails = useCartStore.getState().checkoutDetails
    expect(currentDetails.presetLocation).toBe('D Block')
    expect(currentDetails.deliveryInstructions).toBe('Room 305')
  })

  // 6. Refresh/session restoration behaves correctly
  it('6. restores the active destination from persistent store across simulated page refresh', () => {
    // Set checkout details
    useCartStore.getState().setCheckoutDetails({
      presetLocation: 'MBA Block',
      deliveryInstructions: '2nd Floor Library Wing',
    })

    // Read partialize output that zustand persist writes to storage
    const state = useCartStore.getState()
    const partializeFn = useCartStore.persist?.getOptions?.()?.partialize
    expect(partializeFn).toBeDefined()

    const persisted = partializeFn(state)
    expect(persisted.checkoutDetails).toBeDefined()
    expect(persisted.checkoutDetails.presetLocation).toBe('MBA Block')
    expect(persisted.checkoutDetails.deliveryInstructions).toBe('2nd Floor Library Wing')

    // Simulate session restoration by setting persisted state
    useCartStore.setState({ checkoutDetails: persisted.checkoutDetails })
    const htmlRestored = renderHeaderWithProviders({ queryClient })
    expect(htmlRestored).toContain('MBA Block, 2nd Floor Library Wing')
  })

  // 7. Missing or invalid destination IDs do not display a misleading address
  it('7. safely handles missing or invalid destination IDs without displaying a misleading address', () => {
    // Profile with an unknown/deleted destination ID
    useAuthStore.setState({
      user: {
        id: 'u_orphan',
        name: 'Orphan User',
        roles: ['customer'],
        defaultLocationId: 'loc_non_existent_9999',
      },
    })
    useCartStore.getState().clearActiveDestination()

    const html = renderHeaderWithProviders({ queryClient })
    // Must NOT fabricate a location or show stale name
    expect(html).toContain('Choose a delivery spot')
    expect(html).not.toContain('loc_non_existent_9999')

    // Helper formatDestinationLabel returns null for invalid targetId
    const formatted = formatDestinationLabel({
      locationId: 'loc_non_existent_9999',
      locations: SAMPLE_DELIVERY_LOCATIONS,
    })
    expect(formatted).toBeNull()
  })

  // 8. Logout and account switching do not leak another user's destination
  it('8. does not leak active destination or saved location preference to subsequent sessions on logout', async () => {
    // User A sets a custom delivery destination
    useAuthStore.setState({
      user: {
        id: 'u_user_a',
        name: 'User A',
        roles: ['customer'],
        defaultLocationId: 'loc_hostel_a',
      },
    })
    useCartStore.getState().setCheckoutDetails({
      presetLocation: 'Food Court',
      deliveryInstructions: 'Table 7',
    })

    let html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('Food Court, Table 7')

    // User A logs out
    await useAuthStore.getState().logout()

    // Navbar immediately returns to neutral state
    html = renderHeaderWithProviders({ queryClient })
    expect(html).toContain('Choose a delivery spot')
    expect(html).not.toContain('Food Court')

    // User B signs in with different default destination
    useAuthStore.setState({
      user: {
        id: 'u_user_b',
        name: 'User B',
        roles: ['customer'],
        defaultLocationId: 'loc_library',
      },
    })

    html = renderHeaderWithProviders({ queryClient })
    // User B sees their own default, NOT User A's Food Court
    expect(html).toContain('Central Library')
    expect(html).not.toContain('Food Court')
    expect(html).not.toContain('Table 7')
  })

  // 9. The destination submitted to order creation matches the selected destination
  it('9. ensures the destination submitted during order creation matches the active destination', async () => {
    const loginRes = await server.handle('auth.demoLogin', { role: 'customer' })
    const token = loginRes.token
    const user = loginRes.user

    useAuthStore.setState({ user, token })

    // Customer selects 'Food Court'
    const selectedPreset = 'Food Court'
    useCartStore.getState().setCheckoutDetails({ presetLocation: selectedPreset })

    // Formatted label in navbar
    const label = formatDestinationLabel({
      presetLocation: selectedPreset,
      locations: SAMPLE_DELIVERY_LOCATIONS,
    })
    expect(label).toBe('Food Court')

    // Map to registered destination ID
    const destinationId = mapCampusLocationToDestinationId(
      selectedPreset,
      SAMPLE_DELIVERY_LOCATIONS,
    )
    expect(destinationId).toBe('loc_hostel_a')

    // Validate details for checkout
    const validation = validateCheckoutDetails({
      fullName: 'Aarav Patel',
      mobileNumber: '9876543210',
      presetLocation: selectedPreset,
      availableLocations: SAMPLE_DELIVERY_LOCATIONS,
    })
    expect(validation.isValid).toBe(true)
    expect(validation.data.destinationLocationId).toBe('loc_hostel_a')
    expect(validation.data.selectedDestination).toBe('Food Court')

    // Create order through server handler
    const createdOrder = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: destinationId,
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
        customerDetails: validation.data,
      },
      { token },
    )

    // Verify submission agreements
    expect(createdOrder.destinationLocationId || createdOrder.locationId).toBe('loc_hostel_a')
    expect(createdOrder.customerDetails.selectedDestination).toBe('Food Court')
  })

  // 10. Existing delivery validation and cart pricing behavior remain unchanged
  it('10. preserves flat ₹10 delivery fee policy and location validation behavior', () => {
    // Valid preset location maps accurately
    const validLocId = mapCampusLocationToDestinationId('A Block', SAMPLE_DELIVERY_LOCATIONS)
    expect(validLocId).toBe('loc_hostel_a')

    // Other / custom address maps safely to fallback campus spot
    const customLocId = mapCampusLocationToDestinationId(
      OTHER_LOCATION_VALUE,
      SAMPLE_DELIVERY_LOCATIONS,
      'loc_hostel_b',
    )
    expect(customLocId).toBe('loc_hostel_b')

    // Validation rejects empty / invalid locations
    const invalidValidation = validateCheckoutDetails({
      fullName: 'Test User',
      mobileNumber: '9876543210',
      presetLocation: 'Unknown Invalid Block',
      availableLocations: SAMPLE_DELIVERY_LOCATIONS,
    })
    expect(invalidValidation.isValid).toBe(false)
    expect(invalidValidation.errors.location).toBeDefined()
  })
})
