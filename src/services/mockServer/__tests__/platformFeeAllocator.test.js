import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPlatformFeeAllocator,
  RESERVATION_STATUS,
} from '../platformFeeAllocator'
import { createMockServer } from '../handlers'
import { calculateOrderTotals } from '@/utils/orderTotals'
import { splitDeliveryFee } from '@/utils/deliveryFee'
import { formatINR } from '@/utils/currency'
import { formatDistanceKm } from '@/utils/distance'

describe('Dynamic Platform Fee Allocator Unit Tests', () => {
  let allocator

  beforeEach(() => {
    allocator = createPlatformFeeAllocator()
  })

  it('allocates the smallest currently available eligible fee first (1 paisa = ₹0.01)', () => {
    const now = 1000000
    const first = allocator.allocate({ orderId: 'ord_1', now })
    expect(first.feePaise).toBe(1)
    expect(first.feeRupees).toBe(0.01)

    const second = allocator.allocate({ orderId: 'ord_2', now })
    expect(second.feePaise).toBe(2)
    expect(second.feeRupees).toBe(0.02)

    const third = allocator.allocate({ orderId: 'ord_3', now })
    expect(third.feePaise).toBe(3)
    expect(third.feeRupees).toBe(0.03)
  })

  it('ensures simultaneous active reservations never receive the same fee', () => {
    const now = 2000000
    const allocations = []
    for (let i = 0; i < 15; i++) {
      allocations.push(allocator.allocate({ orderId: `ord_${i}`, now }))
    }

    const paiseValues = allocations.map((a) => a.feePaise)
    const uniqueValues = new Set(paiseValues)
    expect(uniqueValues.size).toBe(15)
    // Starts at 1 and increases sequentially
    expect(paiseValues[0]).toBe(1)
    expect(paiseValues[14]).toBe(15)
  })

  it('allows all 99 eligible fees (1-99 paise) to be allocated and exhausts safely', () => {
    const now = 3000000
    // Allocate all 99 slots (1 to 99 paise)
    for (let i = 1; i <= 99; i++) {
      const res = allocator.allocate({ orderId: `ord_${i}`, now })
      expect(res.feePaise).toBe(i)
      expect(res.feeRupees).toBe(Number((i / 100).toFixed(2)))
    }

    // The 100th allocation must fail safely
    expect(() => allocator.allocate({ orderId: 'ord_overflow', now })).toThrowError(
      /All dynamic payment fee slots are currently active/i,
    )
  })

  it('does not release a reservation before the 2-minute verification window expires', () => {
    const startTime = 1000000
    allocator.allocate({ orderId: 'ord_1', now: startTime })

    // 1 minute 59 seconds later (119,000 ms)
    const withinWindow = startTime + 119 * 1000
    expect(allocator.getStatus(1, withinWindow)).toBe(RESERVATION_STATUS.ACTIVE)
    expect(allocator.isAvailable(1, withinWindow)).toBe(false)

    // Next allocation must NOT reuse 1 paisa
    const second = allocator.allocate({ orderId: 'ord_2', now: withinWindow })
    expect(second.feePaise).toBe(2)
  })

  it('begins 5-minute cooldown after the 2-minute verification window expires', () => {
    const startTime = 1000000
    allocator.allocate({ orderId: 'ord_1', now: startTime })

    // Exactly after 2 minutes (120,001 ms)
    const justExpired = startTime + 120 * 1000 + 1
    expect(allocator.getStatus(1, justExpired)).toBe(RESERVATION_STATUS.COOLDOWN)
    expect(allocator.isAvailable(1, justExpired)).toBe(false)

    // At 4 minutes from start (2 min window + 2 min into cooldown)
    const midCooldown = startTime + 240 * 1000
    expect(allocator.getStatus(1, midCooldown)).toBe(RESERVATION_STATUS.COOLDOWN)
    expect(allocator.isAvailable(1, midCooldown)).toBe(false)

    // At 6 minutes 59 seconds (just before 5-minute cooldown completes)
    const almostDone = startTime + (2 * 60 + 5 * 60) * 1000 - 1000
    expect(allocator.getStatus(1, almostDone)).toBe(RESERVATION_STATUS.COOLDOWN)
    expect(allocator.isAvailable(1, almostDone)).toBe(false)

    // Next allocation during cooldown must skip 1 paisa
    const next = allocator.allocate({ orderId: 'ord_2', now: midCooldown })
    expect(next.feePaise).toBe(2)
  })

  it('re-enables the fee for reuse only after the full cooldown (7 minutes total)', () => {
    const startTime = 1000000
    allocator.allocate({ orderId: 'ord_1', now: startTime })

    // At exactly 7 minutes (420,000 ms)
    const cooldownComplete = startTime + 7 * 60 * 1000
    expect(allocator.getStatus(1, cooldownComplete)).toBe(RESERVATION_STATUS.AVAILABLE)
    expect(allocator.isAvailable(1, cooldownComplete)).toBe(true)

    // Next allocation now reuses the smallest available slot (1 paisa)
    const reused = allocator.allocate({ orderId: 'ord_reused', now: cooldownComplete })
    expect(reused.feePaise).toBe(1)
    expect(reused.reservation.orderId).toBe('ord_reused')
  })

  it('ensures successful payment reservations cannot be reassigned as unverified', () => {
    const startTime = 1000000
    allocator.allocate({ orderId: 'ord_1', now: startTime })

    // Server marks payment as verified/paid
    const marked = allocator.markPaid({ orderId: 'ord_1', now: startTime + 30 * 1000 })
    expect(marked).toBe(true)

    // Fast forward to 10 minutes later (past 7-minute hold)
    const longAfter = startTime + 10 * 60 * 1000
    expect(allocator.getStatus(1, longAfter)).toBe(RESERVATION_STATUS.PAID)
    expect(allocator.isAvailable(1, longAfter)).toBe(false)

    // Next allocation must NOT reuse the paid fee
    const next = allocator.allocate({ orderId: 'ord_2', now: longAfter })
    expect(next.feePaise).toBe(2)
  })

  it('safely releases an active reservation when release() is called', () => {
    const startTime = 1000000
    allocator.allocate({ orderId: 'ord_fail', now: startTime })

    // Slot 1 is active
    expect(allocator.getStatus(1, startTime)).toBe(RESERVATION_STATUS.ACTIVE)

    // Release slot for ord_fail
    const released = allocator.release({ orderId: 'ord_fail' })
    expect(released).toBe(true)

    // Slot 1 is immediately available again
    expect(allocator.getStatus(1, startTime)).toBe(RESERVATION_STATUS.AVAILABLE)
    expect(allocator.isAvailable(1, startTime)).toBe(true)

    // Next allocation re-allocates slot 1
    const next = allocator.allocate({ orderId: 'ord_recovered', now: startTime })
    expect(next.feePaise).toBe(1)
  })

  it('refuses to release paid reservations', () => {
    const startTime = 1000000
    allocator.allocate({ orderId: 'ord_paid', now: startTime })
    allocator.markPaid({ orderId: 'ord_paid', now: startTime })

    const released = allocator.release({ orderId: 'ord_paid' })
    expect(released).toBe(false)
    expect(allocator.getStatus(1, startTime)).toBe(RESERVATION_STATUS.PAID)
  })

  it('implements approved suffix release timing: successful confirmation + 2 minutes releases slot for reuse', () => {
    const allocatorWithPaidRelease = createPlatformFeeAllocator({
      releasePaidAfterMs: 2 * 60 * 1000, // 2 minutes post-confirmation
    })
    const startTime = 1000000
    allocatorWithPaidRelease.allocate({ orderId: 'ord_paid_1', now: startTime })

    // Mark paid at start + 30s
    const confirmTime = startTime + 30 * 1000
    allocatorWithPaidRelease.markPaid({ orderId: 'ord_paid_1', now: confirmTime })

    // 1 minute after confirmation: still protected (PAID)
    const oneMinAfter = confirmTime + 60 * 1000
    expect(allocatorWithPaidRelease.getStatus(1, oneMinAfter)).toBe(RESERVATION_STATUS.PAID)
    expect(allocatorWithPaidRelease.isAvailable(1, oneMinAfter)).toBe(false)

    // 2 minutes after confirmation: released back to AVAILABLE
    const twoMinAfter = confirmTime + 2 * 60 * 1000
    expect(allocatorWithPaidRelease.getStatus(1, twoMinAfter)).toBe(RESERVATION_STATUS.AVAILABLE)
    expect(allocatorWithPaidRelease.isAvailable(1, twoMinAfter)).toBe(true)

    // Re-allocating slot 1 for new order succeeds cleanly
    const reallocated = allocatorWithPaidRelease.allocate({ orderId: 'ord_new_after_release', now: twoMinAfter })
    expect(reallocated.feePaise).toBe(1)
    expect(reallocated.reservation.orderId).toBe('ord_new_after_release')
  })
})

describe('Server Authoritative Orders Integration with Platform Fee', () => {
  let server, token

  beforeEach(async () => {
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('ignores any browser-supplied platform fee or total and uses server allocation', async () => {
    const payload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [{ productId: 'p_milk_500', quantity: 2 }],
      platformFee: 0.99, // Browser tries to claim 0.99
      total: 50,         // Browser tries to claim bogus total
    }

    const order = await server.handle('orders.create', payload, { token })

    // Authoritative calculation (MVP flat ₹10 delivery policy):
    // Milk: 28 * 2 = 56
    // Delivery: flat campus delivery = 10
    // Base amount: 56 + 10 = 66
    // Smallest platform fee: 0.01 (1 paisa)
    // Authoritative total: 66 + 0.01 = 66.01
    expect(order.pricing.itemSubtotal).toBe(56)
    expect(order.pricing.deliveryFee).toBe(10)
    expect(order.pricing.baseAmount).toBe(66)
    expect(order.pricing.platformFee).toBe(0.01)
    expect(order.pricing.total).toBe(66.01)
  })

  it('computes exact order totals with fractional base rounded before adding platform fee (₹97.40 + ₹15 -> ₹112 + ₹0.01 = ₹112.01)', () => {
    // Test case from user requirements:
    // Item subtotal: ₹97.40
    // Delivery fee: ₹15.00
    // Rounded base amount: ₹112.00
    // Assigned platform fee: ₹0.01
    // Final total: ₹112.01
    const totals = calculateOrderTotals({
      lines: [
        { unitPrice: 97.40, quantity: 1 },
      ],
      deliveryFee: 15,
      platformFee: 0.01,
    })

    expect(totals.itemSubtotal).toBe(97.40)
    expect(totals.deliveryFee).toBe(15)
    expect(totals.baseAmount).toBe(112)
    expect(totals.platformFee).toBe(0.01)
    expect(totals.total).toBe(112.01)

    // Currency formatting checks
    expect(formatINR(totals.itemSubtotal)).toBe('₹97.40')
    expect(formatINR(totals.deliveryFee)).toBe('₹15')
    expect(formatINR(totals.baseAmount)).toBe('₹112')
    expect(formatINR(totals.platformFee)).toBe('₹0.01')
    expect(formatINR(totals.total)).toBe('₹112.01')
  })

  it('preserves existing whole-rupee base amounts accurately', () => {
    const totals = calculateOrderTotals({
      lines: [
        { unitPrice: 28, quantity: 2 },
      ],
      deliveryFee: 15,
      platformFee: 0.01,
    })

    expect(totals.itemSubtotal).toBe(56)
    expect(totals.deliveryFee).toBe(15)
    expect(totals.baseAmount).toBe(71)
    expect(totals.platformFee).toBe(0.01)
    expect(totals.total).toBe(71.01)
  })

  it('computes exact order totals for subtotal ₹142 + delivery ₹15 -> base ₹157 + platform fee ₹0.01 = ₹157.01', () => {
    const totals = calculateOrderTotals({
      lines: [{ unitPrice: 142, quantity: 1 }],
      deliveryFee: 15,
      platformFee: 0.01,
    })

    expect(totals.itemSubtotal).toBe(142)
    expect(totals.deliveryFee).toBe(15)
    expect(totals.baseAmount).toBe(157)
    expect(totals.platformFee).toBe(0.01)
    expect(totals.total).toBe(157.01)
    expect(totals.total).toBe(totals.baseAmount + totals.platformFee)

    expect(formatINR(totals.itemSubtotal)).toBe('₹142')
    expect(formatINR(totals.deliveryFee)).toBe('₹15')
    expect(formatINR(totals.baseAmount)).toBe('₹157')
    expect(formatINR(totals.platformFee)).toBe('₹0.01')
    expect(formatINR(totals.total)).toBe('₹157.01')
  })

  it('preserves existing payment state safeguards: order creation alone never marks payment as paid', async () => {
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.paymentStatus).toBe('PENDING')

    // Allocator reservation remains active, NOT paid
    const reservation = server.feeAllocator.getReservationForOrder(order.id)
    expect(reservation).toBeDefined()
    expect(reservation.paid).toBe(false)
  })

  it('fails safely and creates no order when platform fee allocation is exhausted', async () => {
    // Fill all 99 slots directly in server's allocator
    for (let p = 1; p <= 99; p++) {
      server.feeAllocator.allocate({ orderId: `dummy_${p}` })
    }

    const initialOrdersCount = server.db.orders.length

    // Attempt to create an order
    await expect(
      server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId: 'loc_hostel_b',
          lines: [{ productId: 'p_milk_500', quantity: 1 }],
        },
        { token },
      ),
    ).rejects.toMatchObject({
      code: 'PLATFORM_FEE_EXHAUSTED',
      status: 503,
    })

    // No order was added
    expect(server.db.orders.length).toBe(initialOrdersCount)
  })

  it('keeps delivery-fee split and runner payouts strictly independent of platform fee', () => {
    const deliveryFee = 15
    const split = splitDeliveryFee(deliveryFee)
    // Runner payout policy remains intact
    expect(split.customerFee).toBe(15)
    expect(split.runnerPayout).toBeNull() // Undecided in config for 15 band
    expect(split.platformShare).toBeNull()

    const split10 = splitDeliveryFee(10)
    expect(split10.runnerPayout).toBe(8)
    expect(split10.platformShare).toBe(2)
  })
})

describe('Display Formatting Regression Tests', () => {
  it('formats distance strictly to two decimal places without altering unrounded distance value', () => {
    const rawDistance = 0.8006045776813487
    const formatted = formatDistanceKm(rawDistance)
    expect(formatted).toBe('0.80')

    expect(formatDistanceKm(1.5)).toBe('1.50')
    expect(formatDistanceKm(0)).toBe('0.00')
    expect(formatDistanceKm(null)).toBe('0.00')
    expect(formatDistanceKm(undefined)).toBe('0.00')
  })
})
