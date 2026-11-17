import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { OrderConfirmationView } from '@/components/cart/OrderConfirmationView'
import { ORDER_STATUS } from '@/utils/orderMachine'

function renderOrderConfirmation(order) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return renderToString(
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
}

const baseOrder = {
  id: 'ord_track_test_1',
  storeId: 'store_campus_mart',
  locationId: 'loc_hostel_b',
  lines: [
    {
      productId: 'p_milk_500',
      name: 'Milk',
      pack: '500 ml',
      unitPrice: 28,
      quantity: 2,
    },
  ],
  pricing: {
    itemSubtotal: 56,
    deliveryFee: 15,
    baseAmount: 71,
    platformFee: 0.01,
    total: 71.01,
    distanceKm: 0.8,
    distanceMethod: 'straight_line',
    pricingVersion: '2026-10-09.1',
  },
  customerDetails: {
    fullName: 'Aarav Patel',
    phoneNumber: '9876543210',
    selectedDestination: 'Hostel B',
  },
}

describe('Customer Order Tracking UI & Contradiction Elimination (Milestone 2)', () => {
  it('eliminates contradictory badges when payment is confirmed (displays Payment: Paid without Awaiting Payment)', () => {
    const paidConfirmedOrder = {
      ...baseOrder,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: 'PAID',
    }

    const html = renderOrderConfirmation(paidConfirmedOrder)

    // Must show paid and confirmed status
    expect(html).toContain('Payment Verified &amp; Confirmed!')
    expect(html).toContain('Payment: Paid')
    expect(html).toContain('Confirmed')

    // Must strictly NOT show contradictory "Awaiting Payment" or "Payment: Pending"
    expect(html).not.toContain('Awaiting Payment')
    expect(html).not.toContain('Payment: Pending')
    expect(html).not.toContain('Proceed to Payment')

    // Must show 6-stage lifecycle progress tracker
    expect(html).toContain('data-testid="order-lifecycle-tracker"')
    expect(html).toContain('Delivery Progress')
    expect(html).toContain('Stage 2 of 6')
    expect(html).toContain('Waiting for Runner')
  })

  it('displays Awaiting Payment badges and Proceed to Payment link when order payment is pending', () => {
    const pendingOrder = {
      ...baseOrder,
      status: ORDER_STATUS.AWAITING_PAYMENT,
      paymentStatus: 'PENDING',
    }

    const html = renderOrderConfirmation(pendingOrder)

    // Must show pending indicators
    expect(html).toContain('Order Created!')
    expect(html).toContain('Awaiting Payment')
    expect(html).toContain('Payment: Pending')
    expect(html).toContain('Proceed to Payment')

    // Must NOT show paid success messages or tracker
    expect(html).not.toContain('Payment: Paid')
    expect(html).not.toContain('data-testid="order-lifecycle-tracker"')
    expect(html).not.toContain('data-testid="assigned-runner-card"')
  })

  it('renders runner assigned card and active preparing progress when order is in PREPARING status', () => {
    const preparingOrder = {
      ...baseOrder,
      status: ORDER_STATUS.PREPARING,
      paymentStatus: 'PAID',
      runnerId: 'usr_runner_1',
      runnerName: 'Rohan Sharma',
    }

    const html = renderOrderConfirmation(preparingOrder)

    expect(html).toContain('Runner Preparing Order')
    expect(html).toContain('Payment: Paid')
    expect(html).toContain('Preparing')
    expect(html).toContain('data-testid="order-lifecycle-tracker"')
    expect(html).toContain('Stage 4 of 6')

    // Assigned runner card
    expect(html).toContain('data-testid="assigned-runner-card"')
    expect(html).toContain('Campus Runner Assigned')
    expect(html).toContain('Rohan Sharma')
  })

  it('renders out for delivery progress and delivery OTP challenge when order is ON_THE_WAY', () => {
    const onTheWayOrder = {
      ...baseOrder,
      status: ORDER_STATUS.ON_THE_WAY,
      paymentStatus: 'PAID',
      runnerId: 'usr_runner_1',
      runnerName: 'Rohan Sharma',
    }

    const html = renderOrderConfirmation(onTheWayOrder)

    expect(html).toContain('Out for Delivery!')
    expect(html).toContain('Payment: Paid')
    expect(html).toContain('On the way')
    expect(html).toContain('Stage 5 of 6')
    expect(html).toContain('data-testid="customer-delivery-otp-card"')
  })

  it('renders completed delivery state and all tracker stages as completed when DELIVERED', () => {
    const deliveredOrder = {
      ...baseOrder,
      status: ORDER_STATUS.DELIVERED,
      paymentStatus: 'PAID',
      runnerId: 'usr_runner_1',
      runnerName: 'Rohan Sharma',
    }

    const html = renderOrderConfirmation(deliveredOrder)

    expect(html).toContain('Order Delivered!')
    expect(html).toContain('Payment: Paid')
    expect(html).toContain('Delivered')
    expect(html).toContain('Stage 6 of 6')
    expect(html).toContain('Order Completed:')
    expect(html).not.toContain('data-testid="assigned-runner-card"')
  })

  it('renders non-blaming cancellation banner with support details when order is CANCELLED', () => {
    const cancelledOrder = {
      ...baseOrder,
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: 'FAILED',
    }

    const html = renderOrderConfirmation(cancelledOrder)

    expect(html).toContain('Order Cancelled')
    expect(html).toContain('Cancelled')
    expect(html).toContain('+91 98765 43210')
    expect(html).not.toContain('Awaiting Payment')
    expect(html).not.toContain('data-testid="order-lifecycle-tracker"')
  })

  it('renders non-blaming expired banner with support details when order is EXPIRED', () => {
    const expiredOrder = {
      ...baseOrder,
      status: 'EXPIRED',
      paymentStatus: 'EXPIRED',
    }

    const html = renderOrderConfirmation(expiredOrder)

    expect(html).toContain('Payment Window Expired')
    expect(html).toContain('Expired')
    expect(html).toContain('+91 98765 43210')
    expect(html).not.toContain('Awaiting Payment')
    expect(html).not.toContain('data-testid="order-lifecycle-tracker"')
  })
})
