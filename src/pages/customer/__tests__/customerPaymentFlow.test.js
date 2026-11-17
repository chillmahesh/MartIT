import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockServer } from '@/services/mockServer/handlers'
import { buildUpiPayload } from '@/utils/upi'
import { env } from '@/config/env'
import { PaymentQr } from '@/components/payment/PaymentQr'
import { CustomerPaymentView } from '@/components/payment/CustomerPaymentView'
import PaymentPage from '@/pages/customer/PaymentPage'
import { PAYMENT_STATUS } from '@/utils/paymentMachine'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { RESERVATION_STATUS } from '@/services/mockServer/platformFeeAllocator'
import { isMobilePhone, isTablet } from '@/utils/deviceDetection'

describe('UPI QR Payload & Payee Configuration Rules (Scope B)', () => {
  it('generates the exact UPI URI with authoritative total including platform fee (e.g. ₹157 base + ₹0.01 fee = ₹157.01)', () => {
    const baseAmount = 157
    const platformFee = 0.01
    const total = baseAmount + platformFee // 157.01

    const upiResult = buildUpiPayload({
      payeeVpa: 'martit.merchant@icici',
      payeeName: 'MartIT Campus Store',
      amount: total,
      orderId: 'ord_test_upi_1',
    })

    expect(upiResult.ok).toBe(true)
    expect(upiResult.amountFormatted).toBe('157.01')
    expect(upiResult.uri).toContain('pa=martit.merchant%40icici')
    expect(upiResult.uri).toContain('am=157.01')
    expect(upiResult.uri).toContain('cu=INR')
    expect(upiResult.uri).toContain('tr=ord_test_upi_1')
    expect(upiResult.uri).toContain('pn=MartIT+Campus+Store')
  })

  it('encodes exactly ₹60.01 with the configured temporary merchant UPI VPA (omkarrakhonde485@oksbi)', () => {
    // Authoritative calculation: ₹50 base amount + ₹10 delivery fee = ₹60 base amount + ₹0.01 platform fee = ₹60.01
    const total = 60.01
    const upiResult = buildUpiPayload({
      payeeVpa: 'omkarrakhonde485@oksbi',
      payeeName: 'MartIT',
      amount: total,
      orderId: 'ord_test_60_01',
    })

    expect(upiResult.ok).toBe(true)
    expect(upiResult.amountFormatted).toBe('60.01')
    expect(upiResult.uri).toContain('pa=omkarrakhonde485%40oksbi')
    expect(upiResult.uri).toContain('am=60.01')
    expect(upiResult.uri).toContain('cu=INR')
    expect(upiResult.uri).toContain('tr=ord_test_60_01')
  })

  it('reads the configured UPI payee VPA from env configuration by default', () => {
    const html = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_env_test',
      }),
    )

    const configuredVpa = env.upiPayeeVpa || 'omkarrakhonde485@oksbi'
    expect(html).toContain(configuredVpa)
    expect(html).toContain('₹60.01')
    expect(html).not.toContain('UPI Payee VPA Not Configured')
  })

  it('PaymentQr only generates QR when payment is pending and active', () => {
    // 1. Pending and active: genuine QR rendered
    const htmlActive = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_active',
        payeeVpa: 'merchant@oksbi',
        paymentStatus: PAYMENT_STATUS.PENDING,
        isExpired: false,
      }),
    )
    expect(htmlActive).toContain('data-testid="genuine-upi-qr"')

    // 2. Already PAID: QR suppressed with inactive notice
    const htmlPaid = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_paid',
        payeeVpa: 'merchant@oksbi',
        paymentStatus: PAYMENT_STATUS.PAID,
        isExpired: false,
      }),
    )
    expect(htmlPaid).not.toContain('data-testid="genuine-upi-qr"')
    expect(htmlPaid).toContain('Payment QR Inactive')

    // 3. Expired window: QR suppressed with expired notice
    const htmlExpired = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_expired',
        payeeVpa: 'merchant@oksbi',
        paymentStatus: PAYMENT_STATUS.PENDING,
        isExpired: true,
      }),
    )
    expect(htmlExpired).not.toContain('data-testid="genuine-upi-qr"')
    expect(htmlExpired).toContain('Payment Window Expired')

    // 4. Non-positive or invalid amount: QR suppressed with error notice
    const htmlBadAmount = renderToString(
      React.createElement(PaymentQr, {
        amount: 0,
        orderId: 'ord_bad_amt',
        payeeVpa: 'merchant@oksbi',
        paymentStatus: PAYMENT_STATUS.PENDING,
        isExpired: false,
      }),
    )
    expect(htmlBadAmount).not.toContain('data-testid="genuine-upi-qr"')
    expect(htmlBadAmount).toContain('Authoritative payable amount must be a positive number.')
  })

  it('fails safely when UPI payee configuration is missing and does NOT invent fake credentials', () => {
    // Empty VPA
    const missingVpaResult = buildUpiPayload({
      payeeVpa: '',
      payeeName: 'MartIT',
      amount: 157.01,
      orderId: 'ord_test_upi_2',
    })

    expect(missingVpaResult.ok).toBe(false)
    expect(missingVpaResult.error).toBe('MISSING_PAYEE_VPA')
    expect(missingVpaResult.message).toContain('VITE_UPI_PAYEE_VPA')
    expect(missingVpaResult.uri).toBeUndefined()

    // Render PaymentQr without configured VPA
    const html = renderToString(
      React.createElement(PaymentQr, {
        amount: 157.01,
        orderId: 'ord_test_upi_2',
        payeeVpa: '',
      }),
    )

    // Clear configuration notice is displayed
    expect(html).toContain('UPI Payee VPA Not Configured')
    expect(html).toContain('VITE_UPI_PAYEE_VPA')
    expect(html).toContain('Failing safely: MartIT will never hardcode fake UPI IDs')
    // No working or fake QR rendered
    expect(html).not.toContain('data-testid="genuine-upi-qr"')
  })

  it('rejects invalid or non-positive payment amounts', () => {
    const zeroResult = buildUpiPayload({
      payeeVpa: 'merchant@upi',
      amount: 0,
      orderId: 'ord_test_3',
    })
    expect(zeroResult.ok).toBe(false)
    expect(zeroResult.error).toBe('INVALID_AMOUNT')

    const negativeResult = buildUpiPayload({
      payeeVpa: 'merchant@upi',
      amount: -10,
      orderId: 'ord_test_3',
    })
    expect(negativeResult.ok).toBe(false)
    expect(negativeResult.error).toBe('INVALID_AMOUNT')
  })
})

describe('Mobile-Friendly UPI Checkout & URI Parity Rules', () => {
  it('guarantees 100% parameter and URI parity between QR code and "Pay with UPI" button', () => {
    const amount = 85.03
    const orderId = 'ord_mobile_parity_99'
    const payeeVpa = 'merchant.martit@oksbi'
    const payeeName = 'MartIT Store'

    const expectedPayload = buildUpiPayload({
      payeeVpa,
      payeeName,
      amount,
      orderId,
    })

    expect(expectedPayload.ok).toBe(true)

    const htmlMobile = renderToString(
      React.createElement(PaymentQr, {
        amount,
        orderId,
        payeeVpa,
        payeeName,
        paymentStatus: PAYMENT_STATUS.PENDING,
        isExpired: false,
        isMobile: true,
      }),
    )

    // Verify prominent "Pay with UPI" button is rendered
    expect(htmlMobile).toContain('data-testid="pay-with-upi-btn"')
    expect(htmlMobile).toContain('Pay with UPI')

    // Extract href from the button
    const hrefMatch =
      htmlMobile.match(/data-testid="pay-with-upi-btn"[^>]*href="([^"]+)"/) ||
      htmlMobile.match(/href="([^"]+)"[^>]*data-testid="pay-with-upi-btn"/)
    expect(hrefMatch).toBeTruthy()
    const buttonHref = hrefMatch[1].replace(/&amp;/g, '&')

    // Must be character-for-character identical to the QR's authoritative URI
    expect(buttonHref).toBe(expectedPayload.uri)

    // Check specific parameter parity
    expect(buttonHref).toContain(`pa=${encodeURIComponent(payeeVpa)}`)
    expect(buttonHref).toContain('am=85.03')
    expect(buttonHref).toContain('cu=INR')
    expect(buttonHref).toContain(`tr=${orderId}`)
    expect(buttonHref).toContain('tn=MartIT+Order+ord_mobile_parity_99')

    // Verify that QR code is also simultaneously rendered as fallback
    expect(htmlMobile).toContain('data-testid="genuine-upi-qr"')
    expect(htmlMobile).toContain('Or scan QR code')
  })

  it('mobile phones show prominent "Pay with UPI" button alongside the QR code', () => {
    const phoneNav = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    }
    const isPhone = isMobilePhone(phoneNav)
    expect(isPhone).toBe(true)

    const html = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_phone_123',
        isMobile: isPhone,
      }),
    )

    expect(html).toContain('data-testid="pay-with-upi-btn"')
    expect(html).toContain('data-testid="genuine-upi-qr"')
    expect(html).toContain('Or scan QR code')
  })

  it('desktops and laptops keep the existing QR-code payment experience unchanged (no mobile button)', () => {
    const desktopNav = {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      userAgentData: { mobile: false },
    }
    const isPhone = isMobilePhone(desktopNav)
    expect(isPhone).toBe(false)

    const html = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_desktop_123',
        isMobile: isPhone,
      }),
    )

    expect(html).not.toContain('data-testid="pay-with-upi-btn"')
    expect(html).not.toContain('data-testid="mobile-upi-section"')
    expect(html).not.toContain('Or scan QR code')
    expect(html).toContain('data-testid="genuine-upi-qr"')
  })

  it('tablets preserve the QR-first experience by default (no mobile button)', () => {
    const iPadNav = {
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15',
    }
    const isPhoneIpad = isMobilePhone(iPadNav)
    expect(isTablet(iPadNav)).toBe(true)
    expect(isPhoneIpad).toBe(false)

    const htmlIpad = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_ipad_123',
        isMobile: isPhoneIpad,
      }),
    )
    expect(htmlIpad).not.toContain('data-testid="pay-with-upi-btn"')
    expect(htmlIpad).toContain('data-testid="genuine-upi-qr"')

    const androidTabletNav = {
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    }
    const isPhoneAndroidTab = isMobilePhone(androidTabletNav)
    expect(isTablet(androidTabletNav)).toBe(true)
    expect(isPhoneAndroidTab).toBe(false)

    const htmlAndroidTab = renderToString(
      React.createElement(PaymentQr, {
        amount: 60.01,
        orderId: 'ord_and_tab_123',
        isMobile: isPhoneAndroidTab,
      }),
    )
    expect(htmlAndroidTab).not.toContain('data-testid="pay-with-upi-btn"')
    expect(htmlAndroidTab).toContain('data-testid="genuine-upi-qr"')
  })

  it('tapping or navigating UPI link never automatically marks order as paid (fail-closed Make.com verification intact)', async () => {
    const mockServer = createMockServer()
    const { token } = await mockServer.handle('auth.demoLogin', { role: 'customer' })
    const createdOrder = await mockServer.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    // Initially order is created, payment status is pending
    expect(createdOrder.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
    expect(createdOrder.status).toBe(ORDER_STATUS.AWAITING_PAYMENT)

    // User receives UPI URI and opens it in their UPI app
    const upiResult = buildUpiPayload({
      payeeVpa: 'omkarrakhonde485@oksbi',
      amount: createdOrder.pricing.total,
      orderId: createdOrder.id,
    })
    expect(upiResult.ok).toBe(true)

    // Returning from UPI app without server verification leaves order in pending status
    const fetched = await mockServer.handle('orders.get', { orderId: createdOrder.id }, { token })
    expect(fetched.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
    expect(fetched.status).toBe(ORDER_STATUS.AWAITING_PAYMENT)

    // Verification must strictly go through check-payment with Make.com webhook
    const checkResult = await mockServer.handle('orders.checkPayment', { orderId: createdOrder.id }, { token })
    expect(checkResult.status).toBe('inconclusive') // Unverified payment fails closed
    expect(fetched.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
  })

  it('suppresses mobile UPI button when payee VPA configuration is missing', () => {
    const html = renderToString(
      React.createElement(PaymentQr, {
        amount: 50.01,
        orderId: 'ord_missing_vpa',
        payeeVpa: '',
        isMobile: true,
      }),
    )

    expect(html).not.toContain('data-testid="pay-with-upi-btn"')
    expect(html).not.toContain('data-testid="genuine-upi-qr"')
    expect(html).toContain('UPI Payee VPA Not Configured')
  })
})

describe('Platform Fee Expiry & Cooldown Rules (Scope C)', () => {
  let server, token

  beforeEach(async () => {
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('enforces 2-minute verification window and 5-minute cooldown (7 minutes total hold)', async () => {
    const startTime = 1000000

    // 1. Order 1 created at startTime
    const order1 = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )
    expect(order1.pricing.platformFee).toBe(0.01)
    expect(order1.payment.feePaise).toBe(1)

    const reservation1 = server.feeAllocator.getReservation(1)
    expect(reservation1.allocatedAt).toBeDefined()
    expect(reservation1.windowExpiresAt).toBe(reservation1.allocatedAt + 2 * 60 * 1000)
    expect(reservation1.cooldownExpiresAt).toBe(reservation1.windowExpiresAt + 5 * 60 * 1000)

    // 2. Active during 2-minute verification window
    const insideWindow = reservation1.allocatedAt + 90 * 1000 // 1.5 mins
    expect(server.feeAllocator.getStatus(1, insideWindow)).toBe(RESERVATION_STATUS.ACTIVE)
    expect(server.feeAllocator.isAvailable(1, insideWindow)).toBe(false)

    // 3. Exactly at/after 2 minutes -> enters COOLDOWN (not reusable yet!)
    const justExpired = reservation1.windowExpiresAt + 1
    expect(server.feeAllocator.getStatus(1, justExpired)).toBe(RESERVATION_STATUS.COOLDOWN)
    expect(server.feeAllocator.isAvailable(1, justExpired)).toBe(false)

    // 4. During 5-minute cooldown (e.g. 4 minutes in), slot 1 is NOT reusable
    const midCooldown = reservation1.allocatedAt + 4 * 60 * 1000
    expect(server.feeAllocator.getStatus(1, midCooldown)).toBe(RESERVATION_STATUS.COOLDOWN)
    expect(server.feeAllocator.isAvailable(1, midCooldown)).toBe(false)

    // Next order during this time receives slot 2 (2 paise), NOT slot 1
    const order2 = server.feeAllocator.allocate({ orderId: 'ord_during_cooldown', now: midCooldown })
    expect(order2.feePaise).toBe(2)

    // 5. At 7 minutes (420,000 ms), cooldown completes and slot 1 becomes reusable
    const afterCooldown = reservation1.cooldownExpiresAt
    expect(server.feeAllocator.getStatus(1, afterCooldown)).toBe(RESERVATION_STATUS.AVAILABLE)
    expect(server.feeAllocator.isAvailable(1, afterCooldown)).toBe(true)

    // Slot 1 is reusable now as the smallest available fee
    const order3 = server.feeAllocator.allocate({ orderId: 'ord_after_cooldown', now: afterCooldown })
    expect(order3.feePaise).toBe(1)
  })

  it('guarantees that a verified/paid fee is NEVER reassigned even after the hold period', async () => {
    const startTime = 1000000

    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )
    expect(order.payment.feePaise).toBe(1)

    // Provide verified Make.com evidence and check payment
    server.recordPaymentEvidence(order.id, 'Payment received')
    const verifyRes = await server.handle('orders.checkPayment', { orderId: order.id }, { token })
    expect(verifyRes.status).toBe('verified')
    expect(verifyRes.paymentStatus).toBe('PAID')

    // Fast-forward to 1 hour later (well past 7-minute hold)
    const longAfter = startTime + 60 * 60 * 1000
    expect(server.feeAllocator.getStatus(1, longAfter)).toBe(RESERVATION_STATUS.PAID)
    expect(server.feeAllocator.isAvailable(1, longAfter)).toBe(false)

    // Next allocation skips paid slot 1 and allocates slot 2
    const nextAlloc = server.feeAllocator.allocate({ orderId: 'ord_new_user', now: longAfter })
    expect(nextAlloc.feePaise).toBe(2)
  })
})

describe('Payment Verification Safety (Scope D)', () => {
  let server, token

  beforeEach(async () => {
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('QR display or client interaction alone cannot mark payment verified', async () => {
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    // Order initially awaiting payment
    expect(order.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
    expect(order.status).toBe(ORDER_STATUS.AWAITING_PAYMENT)

    // Client queries checkPayment without backend evidence
    const checkRes = await server.handle('orders.checkPayment', { orderId: order.id }, { token })

    // Must NOT be verified
    expect(checkRes.status).not.toBe('verified')
    expect(checkRes.paymentStatus).not.toBe(PAYMENT_STATUS.PAID)
    expect(checkRes.order.status).toBe(ORDER_STATUS.AWAITING_PAYMENT)
  })

  it('inconclusive "not received" response does not mark payment successful or definitively failed', async () => {
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    // No evidence registered -> verification adapter returns 'not received'
    const result = await server.handle('orders.checkPayment', { orderId: order.id }, { token })

    expect(result.status).toBe('inconclusive')
    expect(result.rawResponse).toBe('not received')
    expect(result.message).toContain('Payment not detected yet')
    expect(result.paymentStatus).not.toBe(PAYMENT_STATUS.PAID)
    expect(result.paymentStatus).not.toBe(PAYMENT_STATUS.FAILED)

    // Order remains awaiting payment, not failed or cancelled
    const retrieved = await server.handle('orders.get', { orderId: order.id }, { token })
    expect(retrieved.status).toBe(ORDER_STATUS.AWAITING_PAYMENT)
    expect(retrieved.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
  })

  it('only trusted server-side "Payment received" evidence transitions payment to PAID and order to CONFIRMED', async () => {
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    // Inject trusted Make.com evidence
    server.recordPaymentEvidence(order.id, 'Payment received')

    const result = await server.handle('orders.checkPayment', { orderId: order.id }, { token })

    expect(result.status).toBe('verified')
    expect(result.rawResponse).toBe('Payment received')
    expect(result.paymentStatus).toBe(PAYMENT_STATUS.PAID)
    expect(result.order.status).toBe(ORDER_STATUS.CONFIRMED)

    // Allocator reservation is locked as paid
    const reservation = server.feeAllocator.getReservation(order.payment.feePaise)
    expect(reservation.paid).toBe(true)
  })

  it('treats malformed responses, errors, and unknown bodies strictly as inconclusive', async () => {
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    // Malformed HTML response (e.g. gateway error)
    server.recordPaymentEvidence(order.id, '<html>502 Bad Gateway</html>')
    let result = await server.handle('orders.checkPayment', { orderId: order.id }, { token })
    expect(result.status).toBe('inconclusive')
    expect(result.paymentStatus).toBe(PAYMENT_STATUS.PENDING)

    // Arbitrary unknown string
    server.recordPaymentEvidence(order.id, 'UNRECOGNIZED_STATUS')
    result = await server.handle('orders.checkPayment', { orderId: order.id }, { token })
    expect(result.status).toBe('inconclusive')
    expect(result.paymentStatus).toBe(PAYMENT_STATUS.PENDING)

    // Order remains AWAITING_PAYMENT
    const retrieved = await server.handle('orders.get', { orderId: order.id }, { token })
    expect(retrieved.status).toBe(ORDER_STATUS.AWAITING_PAYMENT)
    expect(retrieved.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
  })

  it('prevents browser requests from overriding authoritative totals or faking payment verification', async () => {
    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )

    // Browser cannot inject paymentStatus: 'PAID' or total: 1
    const checkRes = await server.handle(
      'orders.checkPayment',
      { orderId: order.id, paymentStatus: 'PAID', total: 1 },
      { token },
    )
    expect(checkRes.paymentStatus).not.toBe(PAYMENT_STATUS.PAID)
    expect(checkRes.order.pricing.total).toBe(order.pricing.total)

    // Replayed check on an unverified order never marks it paid
    const secondCheck = await server.handle('orders.checkPayment', { orderId: order.id }, { token })
    expect(secondCheck.paymentStatus).not.toBe(PAYMENT_STATUS.PAID)
  })
})

describe('Customer Payment Screen UI & Countdown (Scope A & F)', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const renderWithProviders = (component) =>
    renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, component),
      ),
    )

  it('derives countdown strictly from authoritative order expiry and renders total breakdown accurately', () => {
    const now = Date.now()
    const mockOrder = {
      id: 'ord_screen_test',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [{ productId: 'p_milk_500', name: 'Milk 500ml', unitPrice: 28, quantity: 2 }],
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
      payment: {
        status: PAYMENT_STATUS.PENDING,
        feePaise: 1,
        allocatedAt: now,
        windowExpiresAt: now + 90 * 1000, // 1m 30s remaining
        cooldownExpiresAt: now + 420 * 1000,
      },
      status: ORDER_STATUS.AWAITING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.PENDING,
      createdAt: new Date(now).toISOString(),
    }

    const html = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: mockOrder }))

    // Order and breakdown checks
    expect(html).toContain('Order #ord_screen_test')
    expect(html).toContain('₹56')
    expect(html).toContain('₹15')
    expect(html).toContain('Allocated Platform Fee')
    expect(html).toContain('₹0.01')
    expect(html).toContain('₹71.01')

    // Countdown matches ~1:30 remaining
    expect(html).toContain('1:30')
    expect(html).toContain('Time Remaining')
  })

  it('ensures countdown is derived strictly from authoritative expiry and does not reset on rerender', () => {
    const fixedNow = 1000000
    const windowExpiresAt = fixedNow + 75 * 1000 // Exactly 75 seconds left (1:15)

    const order = {
      id: 'ord_rerender_test',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [],
      pricing: { itemSubtotal: 50, deliveryFee: 15, baseAmount: 65, platformFee: 0.01, total: 65.01 },
      payment: {
        status: PAYMENT_STATUS.PENDING,
        feePaise: 1,
        allocatedAt: fixedNow - 45 * 1000,
        windowExpiresAt,
      },
      status: ORDER_STATUS.AWAITING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.PENDING,
      createdAt: new Date(fixedNow - 45 * 1000).toISOString(),
    }

    // Mock Date.now to fixedNow
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

    try {
      // First render: 75 seconds left -> 1:15
      const html1 = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: order }))
      expect(html1).toContain('1:15')
      expect(html1).not.toContain('2:00')

      // Advance Date.now by 15 seconds (60 seconds left -> 1:00)
      dateSpy.mockReturnValue(fixedNow + 15 * 1000)

      // Re-render: timer continues from authoritative expiry (1:00), DOES NOT reset to 2:00 or 1:15
      const html2 = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: { ...order } }))
      expect(html2).toContain('1:00')
      expect(html2).not.toContain('2:00')
      expect(html2).not.toContain('1:15')
    } finally {
      dateSpy.mockRestore()
    }
  })

  it('renders clear states for EXPIRED and PAID orders', () => {
    const now = Date.now()
    const expiredOrder = {
      id: 'ord_exp_test',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [],
      pricing: { itemSubtotal: 56, deliveryFee: 15, baseAmount: 71, platformFee: 0.01, total: 71.01 },
      payment: { status: PAYMENT_STATUS.EXPIRED, windowExpiresAt: now - 1000 },
      status: ORDER_STATUS.AWAITING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.EXPIRED,
      createdAt: new Date(now - 150000).toISOString(),
    }

    const htmlExpired = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: expiredOrder }))
    expect(htmlExpired).toContain('Payment Window Expired')
    expect(htmlExpired).toContain('Retry Payment Allocation')

    const paidOrder = {
      ...expiredOrder,
      paymentStatus: PAYMENT_STATUS.PAID,
      payment: { status: PAYMENT_STATUS.PAID },
      status: ORDER_STATUS.CONFIRMED,
    }

    const htmlPaid = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: paidOrder }))
    expect(htmlPaid).toContain('Payment Successfully Verified')
    expect(htmlPaid).toContain('Paid &amp; Confirmed')
  })

  it('displays a useful error when order reference is missing on PaymentPage', () => {
    const htmlMissing = renderWithProviders(React.createElement(PaymentPage))
    expect(htmlMissing).toContain('Missing Order Reference')
    expect(htmlMissing).toContain('Back to Shopping')
  })

  it('correctly parses ISO-8601 string windowExpiresAt without immediately expiring', () => {
    const fixedNow = 1000000000000
    const futureIso = new Date(fixedNow + 110 * 1000).toISOString() // 1 min 50s left

    const isoOrder = {
      id: 'ord_iso_test',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      lines: [{ productId: 'p_milk_500', name: 'Milk 500ml', unitPrice: 28, quantity: 1 }],
      pricing: { itemSubtotal: 28, deliveryFee: 10, baseAmount: 38, platformFee: 0.01, total: 38.01 },
      payment: {
        status: PAYMENT_STATUS.PENDING,
        feePaise: 1,
        allocatedAt: new Date(fixedNow - 10000).toISOString(),
        windowExpiresAt: futureIso,
      },
      status: ORDER_STATUS.AWAITING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.PENDING,
      createdAt: new Date(fixedNow - 10000).toISOString(),
    }

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    try {
      const html = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: isoOrder }))
      expect(html).toContain('1:50')
      expect(html).not.toContain('Payment Window Expired')
      expect(html).toContain('Complete Your UPI Payment')
    } finally {
      dateSpy.mockRestore()
    }
  })

  it('renders defensibly without crashing when refreshed order omits lines or pricing', () => {
    // Malformed/incomplete order returned from server refresh: lines and pricing missing
    const incompleteOrder = {
      id: 'ord_malformed',
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_b',
      // lines: missing entirely!
      // pricing: missing entirely!
      payment: {
        status: PAYMENT_STATUS.PENDING,
        windowExpiresAt: Date.now() + 60000,
      },
      status: ORDER_STATUS.AWAITING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.PENDING,
    }

    expect(() => {
      const html = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: incompleteOrder }))
      expect(html).toContain('Order #ord_malformed')
      expect(html).toContain('Items Ordered')
      expect(html).toContain('Item details temporarily unavailable.')
    }).not.toThrow()
  })

  it('safely recovers and renders empty order view if order is null or has no id', () => {
    const htmlNull = renderWithProviders(React.createElement(CustomerPaymentView, { initialOrder: null }))
    expect(htmlNull).toContain('Payment Details Unavailable')
    expect(htmlNull).toContain('View My Orders')
  })
})

describe('Server Authoritative orders.get Boundary Tests', () => {
  let server, token

  beforeEach(async () => {
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('orders.get is strictly read-only and does NOT mutate payment state; expiration occurs via dedicated orders.expire or checkPayment', async () => {
    const now = 1000000
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now)

    try {
      const order = await server.handle(
        'orders.create',
        {
          storeId: 'store_campus_mart',
          locationId: 'loc_hostel_b',
          lines: [{ productId: 'p_milk_500', quantity: 1 }],
        },
        { token },
      )
      expect(order.paymentStatus).toBe(PAYMENT_STATUS.PENDING)

      // Query within window (1 minute later) -> still PENDING
      dateSpy.mockReturnValue(now + 60 * 1000)
      const duringWindow = await server.handle('orders.get', { orderId: order.id }, { token })
      expect(duringWindow.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
      expect(duringWindow.isWindowExpired).toBe(false)

      // Query after 2-minute window (120,001 ms) -> strictly read-only, does NOT mutate DB state
      dateSpy.mockReturnValue(now + 120 * 1000 + 1)
      const afterWindow = await server.handle('orders.get', { orderId: order.id }, { token })
      expect(afterWindow.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
      expect(afterWindow.isWindowExpired).toBe(true)

      // Dedicated atomic expiration endpoint transitions to EXPIRED
      const expiredRes = await server.handle('orders.expire', { orderId: order.id }, { token })
      expect(expiredRes.paymentStatus).toBe(PAYMENT_STATUS.EXPIRED)

      // Now orders.get reflects the terminal EXPIRED state
      const refreshed = await server.handle('orders.get', { orderId: order.id }, { token })
      expect(refreshed.paymentStatus).toBe(PAYMENT_STATUS.EXPIRED)
    } finally {
      dateSpy.mockRestore()
    }
  })

  it('fails safely with 404 error when querying a non-existent order ID', async () => {
    await expect(
      server.handle('orders.get', { orderId: 'ord_non_existent' }, { token }),
    ).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      status: 404,
    })
  })
})

describe('Explicit Payment Retry Flow', () => {
  let server, token

  beforeEach(async () => {
    server = createMockServer()
    token = (await server.handle('auth.demoLogin', { role: 'customer' })).token
  })

  it('allows explicit retry only after order expiry and preserves previous attempt in history', async () => {
    const now = Date.now()

    const order = await server.handle(
      'orders.create',
      {
        storeId: 'store_campus_mart',
        locationId: 'loc_hostel_b',
        lines: [{ productId: 'p_milk_500', quantity: 1 }],
      },
      { token },
    )
    expect(order.payment.feePaise).toBe(1)

    // Attempting retry while window is active should be rejected
    await expect(
      server.handle('orders.retryPayment', { orderId: order.id }, { token }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_ACTIVE',
      status: 409,
    })

    // Advance order to expired
    const storedOrder = server.db.orders.find((o) => o.id === order.id)
    storedOrder.paymentStatus = PAYMENT_STATUS.EXPIRED
    storedOrder.payment.windowExpiresAt = now - 5000

    // Now explicit retry succeeds
    const retried = await server.handle('orders.retryPayment', { orderId: order.id }, { token })

    expect(retried.paymentStatus).toBe(PAYMENT_STATUS.PENDING)
    // Slot 1 is still in cooldown, so retry gets slot 2 (2 paise)
    expect(retried.payment.feePaise).toBe(2)
    expect(retried.pricing.platformFee).toBe(0.02)
    // Previous attempt is audited in history
    expect(retried.payment.history).toBeDefined()
    expect(retried.payment.history.length).toBe(1)
    expect(retried.payment.history[0].feePaise).toBe(1)
  })
})

describe('Secret Protection and Build Integrity', () => {
  it('guarantees that the secret Make.com webhook URL is never exposed in frontend build bundles or source', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const secretWebhookToken = '7bp61vsz2koilncet6m60gjapr2y3mh3'
    const distPath = path.resolve(process.cwd(), 'dist')

    // Read all files in dist/ to ensure secret is not present in client assets
    const fileEntries = await fs.readdir(distPath, { recursive: true, withFileTypes: true })
    const distFiles = fileEntries.filter((f) => f.isFile()).map((f) => path.join(f.parentPath || f.path, f.name))

    for (const filePath of distFiles) {
      if (
        filePath.endsWith('.js') ||
        filePath.endsWith('.html') ||
        filePath.endsWith('.css') ||
        filePath.endsWith('.json')
      ) {
        const content = await fs.readFile(filePath, 'utf8')
        expect(content).not.toContain(secretWebhookToken)
        expect(content).not.toContain('MAKE_VERIFICATION_WEBHOOK_URL')
      }
    }
  })
})
