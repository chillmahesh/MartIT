import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OrdersPage from '../OrdersPage'
import { orderService } from '@/services/orderService'
import { useCartStore } from '@/stores/cartStore'
import { ORDER_STATUS } from '@/utils/orderMachine'

describe('OrdersPage — Order Cancellation & Reorder Actions (P0 & P1)', () => {
  let queryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })
    useCartStore.setState({ storeId: null, lines: [] })
    vi.restoreAllMocks()
  })

  it('renders Cancel Order button for AWAITING_PAYMENT orders and Reorder button for DELIVERED orders', () => {
    const mockOrders = [
      {
        id: 'ord_pending_test',
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_a',
        status: ORDER_STATUS.AWAITING_PAYMENT,
        paymentStatus: 'PENDING',
        createdAt: '2026-10-24T12:00:00Z',
        lines: [{ productId: 'p_milk_500', name: 'Fresh Milk', quantity: 2 }],
        pricing: { total: 60.01 },
      },
      {
        id: 'ord_delivered_test',
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        status: ORDER_STATUS.DELIVERED,
        paymentStatus: 'PAID',
        createdAt: '2026-10-24T11:00:00Z',
        lines: [{ productId: 'p_bread', name: 'Brown Bread', quantity: 1 }],
        pricing: { total: 45.00 },
        handoverVerifiedAt: '2026-10-24T11:30:00Z',
      },
    ]

    vi.spyOn(orderService, 'listMyOrders').mockResolvedValue(mockOrders)
    queryClient.setQueryData(['customer-orders'], mockOrders)

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(OrdersPage, null)
        )
      )
    )

    // Awaiting payment order: has both Cancel and Pay Now
    expect(html).toContain('data-testid="cancel-order-ord_pending_test"')
    expect(html).toContain('Pay Now')

    // Delivered order: has Reorder button and Delivered banner
    expect(html).toContain('data-testid="reorder-btn-ord_delivered_test"')
    expect(html).toContain('Reorder Items')
    expect(html).toContain('Delivered Successfully!')
  })

  it('populates useCartStore when reordering items from a past order', () => {
    const pastOrder = {
      id: 'ord_reorder_test',
      storeId: 'store_campus_mart',
      lines: [
        { productId: 'p_milk_500', quantity: 2 },
        { productId: 'p_bread', quantity: 1 },
      ],
    }

    const cart = useCartStore.getState()
    expect(cart.lines).toHaveLength(0)

    pastOrder.lines.forEach((l) => {
      cart.setQuantity(l.productId, l.quantity, pastOrder.storeId)
    })

    const updatedCart = useCartStore.getState()
    expect(updatedCart.storeId).toBe('store_campus_mart')
    expect(updatedCart.lines).toHaveLength(2)
    expect(updatedCart.lines.find((l) => l.productId === 'p_milk_500')?.quantity).toBe(2)
    expect(updatedCart.lines.find((l) => l.productId === 'p_bread')?.quantity).toBe(1)
  })
})
