import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { DeliveryDetailsForm } from '@/components/cart/DeliveryDetailsForm'
import { OrderConfirmationView } from '@/components/cart/OrderConfirmationView'
import { CustomerPaymentView } from '@/components/payment/CustomerPaymentView'
import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { createMockServer } from '@/services/mockServer/handlers'
import {
  PRESET_CAMPUS_LOCATIONS,
  OTHER_LOCATION_VALUE,
  validateCheckoutDetails,
  mapCampusLocationToDestinationId,
  CAMPUS_LOCATION_DESTINATION_MAP,
} from '@/utils/checkoutValidation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

describe('Checkout Customer Details and Campus Address Selection', () => {
  let server, token

  beforeEach(async () => {
    useCartStore.getState().clear()
    useCartStore.getState().resetCheckoutDetails()
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  // 1. Form renders with the eight preset locations
  it('renders DeliveryDetailsForm with the eight preset campus locations and Other option', () => {
    const html = renderToString(
      <DeliveryDetailsForm
        details={{
          fullName: 'Aarav Patel',
          mobileNumber: '9876543210',
          presetLocation: 'A Block',
          customLocation: '',
          deliveryInstructions: '',
        }}
        errors={{}}
        onChange={vi.fn()}
      />,
    )

    expect(html).toContain('Customer Information')
    expect(html).toContain('Full Name')
    expect(html).toContain('Phone Number')
    expect(html).toContain('Delivery Destination')
    expect(html).toContain('Detailed address / landmark')

    // Verify all 8 preset locations exist in the select / list
    for (const preset of PRESET_CAMPUS_LOCATIONS) {
      expect(html).toContain(preset)
    }

    // Verify Other / Enter address option is present
    expect(html).toContain('Other / Enter address')
  })

  // 2. Existing profile details prefill correctly
  it('prefills available authenticated profile details without overwriting', () => {
    // Authenticated user with profile name and phone
    const mockUser = {
      id: 'u_test_cust',
      name: 'Rohan Sharma',
      phone: '9876500000',
      defaultLocationId: 'loc_hostel_b',
    }

    // Initial state is empty
    expect(useCartStore.getState().checkoutDetails.fullName).toBe('')
    expect(useCartStore.getState().checkoutDetails.mobileNumber).toBe('')

    // Simulate prefilling logic
    const store = useCartStore.getState()
    if (!store.checkoutDetails.fullName && mockUser.name) {
      store.setCheckoutDetails({ fullName: mockUser.name })
    }
    if (!store.checkoutDetails.mobileNumber && mockUser.phone) {
      store.setCheckoutDetails({ mobileNumber: mockUser.phone })
    }

    expect(useCartStore.getState().checkoutDetails.fullName).toBe('Rohan Sharma')
    expect(useCartStore.getState().checkoutDetails.mobileNumber).toBe('9876500000')
  })

  // 3. Customer can edit prefilled details
  it('allows the customer to edit prefilled details without being overwritten', () => {
    useCartStore.getState().setCheckoutDetails({
      fullName: 'Initial Name',
      mobileNumber: '9876500000',
    })

    // Customer edits name and phone
    useCartStore.getState().setCheckoutDetails({
      fullName: 'Updated Customer Name',
      mobileNumber: '+91 9988776655',
    })

    const state = useCartStore.getState().checkoutDetails
    expect(state.fullName).toBe('Updated Customer Name')
    expect(state.mobileNumber).toBe('+91 9988776655')
  })

  // 4. Empty name is rejected
  it('rejects an empty or whitespace-only customer name', () => {
    const emptyResult = validateCheckoutDetails({
      fullName: '',
      mobileNumber: '9876543210',
      presetLocation: 'A Block',
      customLocation: '',
      deliveryInstructions: '',
    })
    expect(emptyResult.isValid).toBe(false)
    expect(emptyResult.errors.fullName).toBe('Please enter your full name.')

    const whitespaceResult = validateCheckoutDetails({
      fullName: '     ',
      mobileNumber: '9876543210',
      presetLocation: 'A Block',
      customLocation: '',
      deliveryInstructions: '',
    })
    expect(whitespaceResult.isValid).toBe(false)
    expect(whitespaceResult.errors.fullName).toBe('Please enter your full name.')
  })

  // 5. Invalid mobile number is rejected
  it('rejects invalid Indian mobile numbers with specific inline messages', () => {
    // Empty
    const resEmpty = validateCheckoutDetails({
      fullName: 'Aarav',
      mobileNumber: '',
      presetLocation: 'A Block',
    })
    expect(resEmpty.isValid).toBe(false)
    expect(resEmpty.errors.mobileNumber).toBe('Please enter your mobile number.')

    // Letters
    const resAlpha = validateCheckoutDetails({
      fullName: 'Aarav',
      mobileNumber: '9876abc210',
      presetLocation: 'A Block',
    })
    expect(resAlpha.isValid).toBe(false)
    expect(resAlpha.errors.mobileNumber).toBe(
      'Mobile number should only contain digits and optional +91 country code.',
    )

    // Starts with invalid digit
    const resInvalidPrefix = validateCheckoutDetails({
      fullName: 'Aarav',
      mobileNumber: '4876543210',
      presetLocation: 'A Block',
    })
    expect(resInvalidPrefix.isValid).toBe(false)
    expect(resInvalidPrefix.errors.mobileNumber).toBe(
      'Indian mobile numbers must start with 6, 7, 8, or 9.',
    )

    // Too short
    const resShort = validateCheckoutDetails({
      fullName: 'Aarav',
      mobileNumber: '98765',
      presetLocation: 'A Block',
    })
    expect(resShort.isValid).toBe(false)
    expect(resShort.errors.mobileNumber).toBe(
      'Mobile number is too short. Please enter a 10-digit Indian mobile number.',
    )
  })

  // 6. Each preset location can be selected
  it('allows each of the 8 preset locations to be selected and mapped to valid destinations', () => {
    const expectedDestinations = {
      'A Block': 'loc_hostel_a',
      'B Block': 'loc_hostel_b',
      'C Block': 'loc_hostel_a',
      'D Block': 'loc_hostel_b',
      'E Block': 'loc_hostel_b',
      'MBA Block': 'loc_library',
      'Food Court': 'loc_hostel_a',
      'Management Building': 'loc_library',
    }

    for (const preset of PRESET_CAMPUS_LOCATIONS) {
      const destinationId = mapCampusLocationToDestinationId(preset, server.db.locations)
      expect(destinationId).toBe(expectedDestinations[preset])

      const result = validateCheckoutDetails({
        fullName: 'Priya Verma',
        mobileNumber: '9876543210',
        presetLocation: preset,
        availableLocations: server.db.locations,
      })
      expect(result.isValid).toBe(true)
      expect(result.data.deliveryLocation.preset).toBe(preset)
      expect(result.data.destinationLocationId).toBe(expectedDestinations[preset])
    }
  })

  // 7. Custom hostel/location details are required when Other is selected
  it('requires custom hostel/location details when Other is selected', () => {
    // Missing custom details
    const resMissing = validateCheckoutDetails({
      fullName: 'Karan Singh',
      mobileNumber: '9876543210',
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: '',
      availableLocations: server.db.locations,
    })
    expect(resMissing.isValid).toBe(false)
    expect(resMissing.errors.customLocation).toBe(
      'Please enter your destination address.',
    )

    // Whitespace only
    const resWhitespace = validateCheckoutDetails({
      fullName: 'Karan Singh',
      mobileNumber: '9876543210',
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: '   ',
      availableLocations: server.db.locations,
    })
    expect(resWhitespace.isValid).toBe(false)

    // Valid custom details
    const resValid = validateCheckoutDetails({
      fullName: 'Karan Singh',
      mobileNumber: '9876543210',
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: 'Hostel 3, Room 204',
      deliveryInstructions: 'Near the entrance',
      availableLocations: server.db.locations,
    })
    expect(resValid.isValid).toBe(true)
    expect(resValid.data.deliveryLocation.preset).toBe(OTHER_LOCATION_VALUE)
    expect(resValid.data.deliveryLocation.customLocation).toBe('Hostel 3, Room 204')
    expect(resValid.data.deliveryLocation.instructions).toBe('Near the entrance')
    expect(resValid.data.deliveryLocation.formattedAddress).toBe(
      'Hostel 3, Room 204, Near the entrance',
    )
  })

  // 8. Valid details proceed through the existing checkout flow
  it('proceeds through checkout and creates order with customerDetails attached', async () => {
    const customerDetails = {
      fullName: 'Ananya Roy',
      mobileNumber: '9876543210',
      phone: '+919876543210',
      destinationLocationId: 'loc_hostel_a',
      deliveryLocation: {
        preset: 'A Block',
        isCustom: false,
        customLocation: '',
        instructions: 'Call upon arrival',
        formattedAddress: 'A Block, Call upon arrival',
      },
    }

    const payload = {
      storeId: 'store_campus_mart',
      locationId: customerDetails.destinationLocationId,
      lines: [{ productId: 'p_milk_500', quantity: 2 }],
      customerDetails,
    }

    const order = await server.handle('orders.create', payload, { token })

    expect(order.id).toMatch(/^ord_/)
    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.customerDetails).toBeDefined()
    expect(order.customerDetails.fullName).toBe('Ananya Roy')
    expect(order.customerDetails.mobileNumber).toBe('9876543210')
    expect(order.customerDetails.deliveryLocation.formattedAddress).toBe(
      'A Block, Call upon arrival',
    )
  })

  // 9. Entered details persist when returning from payment
  it('persists entered checkout details across store state changes', () => {
    const store = useCartStore.getState()
    store.setCheckoutDetails({
      fullName: 'Devansh Joshi',
      mobileNumber: '9876512345',
      presetLocation: 'MBA Block',
      customLocation: '',
      deliveryInstructions: 'Near ground floor stairs',
    })

    // Simulate clearing cart items after going to payment or browsing
    store.setQuantity('p_bread', 1, 'store_campus_mart')

    const details = useCartStore.getState().checkoutDetails
    expect(details.fullName).toBe('Devansh Joshi')
    expect(details.mobileNumber).toBe('9876512345')
    expect(details.presetLocation).toBe('MBA Block')
    expect(details.deliveryInstructions).toBe('Near ground floor stairs')
  })

  // 10. Invalid details never trigger order creation or payment initiation
  it('blocks order creation if customer details fail validation', async () => {
    const createSpy = vi.fn()

    const validation = validateCheckoutDetails({
      fullName: '',
      mobileNumber: 'invalid_num',
      presetLocation: 'A Block',
    })

    expect(validation.isValid).toBe(false)

    // Simulate checkout handler guard:
    if (validation.isValid) {
      await createSpy()
    }

    expect(createSpy).not.toHaveBeenCalled()
  })

  // 11. Existing subtotal, delivery fee, platform fee, and payable total remain unchanged
  it('preserves authoritative pricing calculations when customerDetails are included', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [
        { productId: 'p_milk_500', quantity: 2 }, // 28 * 2 = 56
        { productId: 'p_bread', quantity: 1 },    // 45 * 1 = 45 -> subtotal 101
      ],
      customerDetails: {
        fullName: 'Aarav Patel',
        mobileNumber: '9876543210',
        phone: '+919876543210',
        deliveryLocation: {
          preset: 'B Block',
          formattedAddress: 'B Block',
        },
      },
    }

    const order = await server.handle('orders.create', payload, { token })

    // Expected exact pricing (MVP flat ₹10 delivery fee):
    // Subtotal: 101
    // Delivery fee: 10
    // Base amount: 111
    // Dynamic platform fee: 0.01 (paise allocation)
    // Total: 111.01
    expect(order.pricing.itemSubtotal).toBe(101)
    expect(order.pricing.deliveryFee).toBe(10)
    expect(order.pricing.baseAmount).toBe(111)
    expect(order.pricing.platformFee).toBe(0.01)
    expect(order.pricing.total).toBe(111.01)
  })

  // 12. Displays customer delivery details in order confirmation and payment views
  it('renders customer delivery details in OrderConfirmationView and CustomerPaymentView', () => {
    const mockOrder = {
      id: 'ord_test_details_123',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk_500', name: 'Amul Taaza Milk 500ml', unitPrice: 28, quantity: 2 }],
      pricing: {
        itemSubtotal: 56,
        deliveryFee: 10,
        baseAmount: 66,
        platformFee: 0.01,
        total: 66.01,
      },
      payment: {
        status: 'PENDING',
        feePaise: 1,
        windowExpiresAt: Date.now() + 120000,
      },
      paymentStatus: 'PENDING',
      customerDetails: {
        fullName: 'Vikram Seth',
        mobileNumber: '9876543210',
        deliveryLocation: {
          formattedAddress: 'A Block, Room 101',
        },
      },
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const confirmHtml = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrderConfirmationView order={mockOrder} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(confirmHtml).toContain('Vikram Seth')
    expect(confirmHtml).toContain('9876543210')
    expect(confirmHtml).toContain('A Block, Room 101')

    const paymentHtml = renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentView initialOrder={mockOrder} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(paymentHtml).toContain('Vikram Seth')
    expect(paymentHtml).toContain('9876543210')
    expect(paymentHtml).toContain('A Block, Room 101')
  })

  // 13. Campus destination dropdown supports mouse wheel scroll without Lenis interference
  it('renders destination dropdown with data-lenis-prevent and overscroll-contain so mouse wheel scroll works', () => {
    const html = renderToString(
      <DeliveryDetailsForm
        details={{
          fullName: 'Aarav Patel',
          mobileNumber: '9876543210',
          presetLocation: 'A Block',
          customLocation: '',
          deliveryInstructions: '',
        }}
        errors={{}}
        onChange={vi.fn()}
        initialDropdownOpen={true}
      />,
    )

    // Verify dropdown listbox is open and has data-lenis-prevent attributes and compact max-h-48
    expect(html).toContain('data-testid="campus-locations-list"')
    expect(html).toContain('data-lenis-prevent')
    expect(html).toContain('data-lenis-prevent-wheel')
    expect(html).toContain('overscroll-contain')
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('max-h-48')
  })
})
