import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import {
  CheckCircle2,
  Clock,
  MapPin,
  Store,
  ArrowRight,
  Package,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  ShoppingBag,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Price } from '@/components/ui/Price'
import { PaymentQr } from './PaymentQr'
import { formatINR } from '@/utils/currency'
import { formatDistanceKm } from '@/utils/distance'
import { SAMPLE_STORES } from '@/mocks/campus'
import { useLocations } from '@/hooks/useLocations'
import { orderService } from '@/services/orderService'
import { PAYMENT_STATUS, PAYMENT_STATUS_LABEL } from '@/utils/paymentMachine'
import { cn } from '@/utils/cn'

/**
 * Robust epoch millisecond timestamp parser.
 * Safely parses ISO-8601 strings, numeric strings, numbers, or Date instances.
 */
export function parseTimestampMs(value) {
  if (!value) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed)
      if (Number.isFinite(num)) return num
    }
    const parsed = new Date(trimmed).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isFinite(t) ? t : null
  }
  return null
}

/**
 * CustomerPaymentView Component
 *
 * Dedicated customer-facing payment screen for an order awaiting payment.
 *
 * Displays:
 * - Authoritative order reference
 * - Store and delivery location
 * - Item subtotal, delivery fee, allocated platform fee, and final authoritative total
 * - Authoritative payment countdown derived strictly from order.payment.windowExpiresAt
 * - Scannable genuine UPI QR code (with safe failure if VPA unconfigured)
 * - Distinct, robust states: PENDING, PROCESSING, VERIFIED, EXPIRED, INCONCLUSIVE
 */
export function CustomerPaymentView({ initialOrder, onOrderUpdate }) {
  const { data: locations = [] } = useLocations()
  const [order, setOrder] = useState(initialOrder)
  const [isChecking, setIsChecking] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [inconclusiveFeedback, setInconclusiveFeedback] = useState(null)
  const [actionError, setActionError] = useState(null)

  // Sync state if initialOrder changes externally
  useEffect(() => {
    if (initialOrder) setOrder(initialOrder)
  }, [initialOrder])

  // Diagnostic logging in development mode
  useEffect(() => {
    if (import.meta.env.DEV && order) {
      if (!order.pricing) {
        console.warn('[CustomerPaymentView] Diagnostic: order.pricing is missing from order payload', order)
      }
      if (!Array.isArray(order.lines)) {
        console.warn('[CustomerPaymentView] Diagnostic: order.lines is missing or not an array', order)
      }
    }
  }, [order])

  const store = SAMPLE_STORES.find((s) => s.id === order?.storeId)
  const location = locations.find((l) => l.id === order?.locationId)

  // Authoritative window expiry timestamp: derives from windowExpiresAt, or allocatedAt/createdAt + 2 min
  const windowExpiresAt = useMemo(() => {
    const directExpiry = parseTimestampMs(order?.payment?.windowExpiresAt)
    if (directExpiry) return directExpiry

    const allocatedAt = parseTimestampMs(order?.payment?.allocatedAt)
    if (allocatedAt) return allocatedAt + 2 * 60 * 1000

    const createdAt = parseTimestampMs(order?.createdAt)
    if (createdAt) return createdAt + 2 * 60 * 1000

    return null
  }, [order?.payment?.windowExpiresAt, order?.payment?.allocatedAt, order?.createdAt])

  // Calculate remaining milliseconds based strictly on authoritative expiry
  const computeRemainingMs = useCallback(() => {
    if (!windowExpiresAt) return 0
    return Math.max(0, windowExpiresAt - Date.now())
  }, [windowExpiresAt])

  const [remainingMs, setRemainingMs] = useState(computeRemainingMs)

  // Keep remainingMs in sync if windowExpiresAt changes (e.g. from props or retry)
  useEffect(() => {
    setRemainingMs(computeRemainingMs())
  }, [computeRemainingMs])

  // Countdown timer derived strictly from authoritative timestamp
  useEffect(() => {
    if (!order) return

    // If already paid or expired, stop ticking
    if (
      order.paymentStatus === PAYMENT_STATUS.PAID ||
      order.paymentStatus === PAYMENT_STATUS.EXPIRED
    ) {
      return
    }

    const interval = setInterval(() => {
      const ms = computeRemainingMs()
      setRemainingMs(ms)

      // When window reaches 0, check authoritative server status to update to EXPIRED
      if (ms <= 0 && order.paymentStatus !== PAYMENT_STATUS.EXPIRED) {
        clearInterval(interval)
        if (order.id) {
          orderService
            .get(order.id)
            .then((updated) => {
              if (updated) {
                setOrder(updated)
                onOrderUpdate?.(updated)
              }
            })
            .catch((err) => {
              if (import.meta.env.DEV) {
                console.warn('[CustomerPaymentView] Failed to refresh order on window expiry:', err)
              }
            })
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [computeRemainingMs, order?.paymentStatus, order?.id, onOrderUpdate])

  // Minutes and seconds formatting
  const formattedCountdown = useMemo(() => {
    const totalSeconds = Math.ceil(remainingMs / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [remainingMs])

  const isPaid = order?.paymentStatus === PAYMENT_STATUS.PAID
  const isExpired =
    order?.paymentStatus === PAYMENT_STATUS.EXPIRED ||
    (!isPaid && remainingMs <= 0)

  // Defensive pricing snapshot derivation
  const pricing = useMemo(() => {
    const p = order?.pricing || {}
    const itemSubtotal = Number(p.itemSubtotal ?? 0)
    const deliveryFee = Number(p.deliveryFee ?? 0)
    const platformFee = Number(
      p.platformFee ?? (order?.payment?.feePaise ? order.payment.feePaise / 100 : 0),
    )
    const total = Number(p.total ?? itemSubtotal + deliveryFee + platformFee)
    return {
      itemSubtotal,
      deliveryFee,
      baseAmount: Number(p.baseAmount ?? itemSubtotal + deliveryFee),
      platformFee,
      total,
      distanceKm: p.distanceKm != null ? Number(p.distanceKm) : null,
      distanceMethod: p.distanceMethod || 'straight_line',
      pricingVersion: p.pricingVersion,
    }
  }, [order?.pricing, order?.payment?.feePaise])

  // Defensive lines mapping fallback
  const lines = useMemo(() => {
    if (Array.isArray(order?.lines)) return order.lines
    if (Array.isArray(order?.fulfillmentGroups)) {
      return order.fulfillmentGroups.flatMap((g) =>
        (g.orderItems || g.order_items || []).map((item) => ({
          productId: item.productId || item.product_id,
          name: item.name || item.productName || item.product_name || 'Item',
          pack: item.pack || item.productPack || item.product_pack || null,
          unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
          quantity: Number(item.quantity ?? 1),
          lineSubtotal: Number(
            item.lineSubtotal ??
              item.line_subtotal ??
              (Number(item.unitPrice ?? item.unit_price ?? 0) * Number(item.quantity ?? 1)),
          ),
        })),
      )
    }
    return []
  }, [order?.lines, order?.fulfillmentGroups])

  // Check payment status with server
  const handleCheckStatus = async () => {
    if (!order?.id || isChecking) return
    setIsChecking(true)
    setActionError(null)
    setInconclusiveFeedback(null)

    try {
      const res = await orderService.checkPayment(order.id)
      if (res.order) {
        setOrder(res.order)
        onOrderUpdate?.(res.order)
      } else if (res.status === 'verified') {
        const updated = await orderService.get(order.id)
        if (updated) {
          setOrder(updated)
          onOrderUpdate?.(updated)
        }
      }

      if (res.status === 'inconclusive') {
        setInconclusiveFeedback(
          res.message ||
            'Payment not detected yet. If money was debited from your UPI app, please contact campus support.',
        )
      } else if (res.status === 'in_flight') {
        setInconclusiveFeedback(
          res.message || 'Payment verification is currently in progress. Please wait a moment.',
        )
      }
    } catch (err) {
      if (err.code === 'VERIFICATION_IN_FLIGHT') {
        setInconclusiveFeedback('Payment check is already in progress. Please wait a moment.')
      } else {
        setActionError(err.message || 'Unable to check payment status. Please try again.')
      }
    } finally {
      setIsChecking(false)
    }
  }

  // Explicit retry payment allocation for expired orders
  const handleRetryPayment = async () => {
    if (!order?.id) return
    setIsRetrying(true)
    setActionError(null)
    setInconclusiveFeedback(null)

    try {
      const updatedOrder = await orderService.retryPayment(order.id)
      setOrder(updatedOrder)
      onOrderUpdate?.(updatedOrder)
      const newExpiry = parseTimestampMs(updatedOrder?.payment?.windowExpiresAt)
      if (newExpiry) {
        setRemainingMs(Math.max(0, newExpiry - Date.now()))
      }
    } catch (err) {
      setActionError(err.message || 'Could not retry payment allocation. Please try again.')
    } finally {
      setIsRetrying(false)
    }
  }

  // Fallback recovery UI if order reference is missing or invalid
  if (!order || !order.id) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-card border border-line bg-surface p-6 text-center space-y-4 shadow-2">
          <AlertCircle className="size-10 text-amber-500 mx-auto" />
          <h2 className="font-display text-lg font-bold text-ink">Payment Details Unavailable</h2>
          <p className="text-xs text-ink-muted">
            The order details are incomplete or could not be loaded. Please return to your orders or try again.
          </p>
          <Button asChild variant="primary" size="md">
            <Link to="/app/orders">View My Orders</Link>
          </Button>
        </div>
      </div>
    )
  }

  const distanceMethodLabel =
    pricing.distanceMethod === 'straight_line'
      ? 'straight-line distance'
      : pricing.distanceMethod === 'route'
      ? 'route distance'
      : 'distance'

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:py-12 space-y-6">
      {/* Header Banner */}
      <div className="rounded-card border border-line bg-surface p-6 shadow-2 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-ink bg-surface-2 px-2.5 py-1 rounded border border-line">
                {`Order #${order.id}`}
              </span>
              {isPaid ? (
                <Badge tone="success" size="md" className="gap-1 font-semibold">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  <span>Paid & Confirmed</span>
                </Badge>
              ) : isExpired ? (
                <Badge tone="danger" size="md" className="gap-1 font-semibold">
                  <Clock className="size-3.5" aria-hidden="true" />
                  <span>Payment Window Expired</span>
                </Badge>
              ) : isChecking ? (
                <Badge tone="info" size="md" className="gap-1 font-semibold animate-pulse">
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                  <span>Checking Payment</span>
                </Badge>
              ) : (
                <Badge tone="warning" size="md" className="gap-1 font-semibold">
                  <Clock className="size-3.5" aria-hidden="true" />
                  <span>{PAYMENT_STATUS_LABEL[order.paymentStatus] || 'Awaiting Payment'}</span>
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2">
              {isPaid ? 'Payment Received!' : isExpired ? 'Payment Window Expired' : 'Complete Your UPI Payment'}
            </h1>
          </div>

          {/* Countdown Display Box */}
          {!isPaid && !isExpired && (
            <div
              data-testid="payment-countdown-container"
              className="flex items-center gap-3 rounded-tile bg-surface-2 border border-line px-4 py-2.5 shadow-1"
            >
              <Clock className="size-5 text-brand shrink-0 animate-pulse" aria-hidden="true" />
              <div>
                <p className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider">
                  Time Remaining
                </p>
                <p
                  data-testid="payment-countdown-timer"
                  className="font-mono text-lg font-bold text-ink tabular"
                >
                  {formattedCountdown}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* State Banner: PAID */}
        {isPaid && (
          <div
            data-testid="payment-status-paid"
            className="rounded-tile border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-2 text-ink"
          >
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <CheckCircle2 className="size-5" />
              <span>Payment Successfully Verified</span>
            </div>
            <p className="text-xs text-ink-muted">
              Your payment has been reconciled with the campus payment ledger. Your order is confirmed and will be assigned to a student runner shortly.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <Button asChild variant="primary" size="md">
                <Link to="/app/order-confirmation" state={{ order }}>
                  <span>View Order Confirmation</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="md">
                <Link to="/app/orders">
                  <span>My Orders</span>
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* State Banner: EXPIRED */}
        {isExpired && !isPaid && (
          <div
            data-testid="payment-status-expired"
            className="rounded-tile border border-red-500/40 bg-red-500/10 p-5 space-y-3 text-ink"
          >
            <div className="flex items-center gap-2 text-danger font-bold">
              <AlertCircle className="size-5" />
              <span>The 2-Minute Payment Verification Window Has Expired</span>
            </div>
            <p className="text-xs text-ink-muted max-w-xl">
              To guarantee that dynamic decimal fee slots remain distinct and safe, unverified payment attempts expire after 2 minutes. The previous fee reservation will remain protected during its 5-minute cooldown.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="md"
                loading={isRetrying}
                onClick={handleRetryPayment}
                className="font-semibold shadow-1"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Retry Payment Allocation</span>
              </Button>
              <Button asChild variant="secondary" size="md">
                <Link to="/app">
                  <ShoppingBag className="size-4" aria-hidden="true" />
                  <span>Return to Shopping</span>
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* State Banner: INCONCLUSIVE (Make.com 'not received') */}
        {inconclusiveFeedback && !isPaid && (
          <div
            data-testid="payment-status-inconclusive"
            className="rounded-tile border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 text-ink text-xs"
          >
            <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
              <AlertTriangle className="size-4.5 shrink-0" />
              <span>Payment Inconclusive — Verification Pending</span>
            </div>
            <p className="text-ink-muted leading-relaxed">
              {inconclusiveFeedback}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-ink-subtle pt-1">
              <HelpCircle className="size-3.5 shrink-0" />
              <span>
                Need assistance? Contact campus administrator with Order Ref:{' '}
                <strong className="font-mono text-ink">{order.id}</strong>.
              </span>
            </div>
          </div>
        )}

        {/* Action Error Banner */}
        {actionError && (
          <div className="rounded-tile border border-red-500/30 bg-red-500/10 p-3 text-danger text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Main Grid: QR & Payment on Left, Authoritative Breakdown on Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: QR Code & Verification Actions */}
        <div className="md:col-span-6 space-y-5">
          <div className="rounded-card border border-line bg-surface p-6 shadow-2 space-y-5">
            <h2 className="font-display text-base font-bold text-ink border-b border-line/60 pb-3">
              UPI Payment Code
            </h2>

            {!isExpired && !isPaid ? (
              <div className="space-y-4">
                <PaymentQr
                  amount={pricing.total}
                  orderId={order.id}
                  paymentStatus={order.paymentStatus}
                  isExpired={isExpired}
                  className="py-2"
                />

                {/* Verification Action Button */}
                <div className="pt-2 border-t border-line/60 space-y-2">
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    loading={isChecking}
                    disabled={isChecking}
                    onClick={handleCheckStatus}
                    className="font-bold shadow-2 hover:scale-[1.01] active:scale-[0.99]"
                    data-testid="check-payment-btn"
                  >
                    <RefreshCw className={cn("size-4", isChecking && "animate-spin")} aria-hidden="true" />
                    <span>{isChecking ? 'Checking payment...' : 'Confirm Payment'}</span>
                  </Button>
                  <p className="text-[11px] text-center text-ink-subtle">
                    Tapping &quot;Check Payment Status&quot; queries the campus reconciliation adapter.
                  </p>
                </div>
              </div>
            ) : isPaid ? (
              <div className="py-8 text-center space-y-3">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-fresh text-ink-inverse shadow-2">
                  <CheckCircle2 className="size-9" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-bold text-ink">Payment Complete</h3>
                <p className="text-xs text-ink-muted max-w-xs mx-auto">
                  Authoritative total of {formatINR(pricing.total)} has been verified.
                </p>
              </div>
            ) : (
              <div className="py-8 text-center space-y-3">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                  <Clock className="size-8" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-bold text-ink">QR Code Expired</h3>
                <p className="text-xs text-ink-muted max-w-xs mx-auto">
                  The payment window for this slot has closed. Click below to reallocate a fresh fee slot.
                </p>
                <Button
                  variant="primary"
                  size="md"
                  loading={isRetrying}
                  onClick={handleRetryPayment}
                  className="mx-auto"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  <span>Retry Payment</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Authoritative Pricing & Order Snapshot */}
        <div className="md:col-span-6 space-y-5">
          <div className="rounded-card border border-line bg-surface p-6 shadow-2 space-y-5">
            <h2 className="font-display text-base font-bold text-ink border-b border-line/60 pb-3">
              Authoritative Pricing Snapshot
            </h2>

            {/* Store & Destination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-2/60 rounded-card p-3 border border-line/60">
              <div className="flex items-start gap-2">
                <Store className="size-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle">Store</p>
                  <p className="font-semibold text-ink">{store ? store.name : (order.storeId || 'Campus Store')}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="size-4 text-fresh-ink shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle">Delivery Destination</p>
                  <p className="font-semibold text-ink">
                    {order.customerDetails?.deliveryLocation?.formattedAddress ||
                      order.customerDetails?.selectedDestination ||
                      (location ? location.name : (order.locationId || 'Delivery Spot'))}
                  </p>
                  {order.customerDetails?.detailedAddress && !order.customerDetails?.deliveryLocation?.formattedAddress?.includes(order.customerDetails.detailedAddress) && (
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      Landmark: {order.customerDetails.detailedAddress}
                    </p>
                  )}
                  {order.customerDetails?.fullName && (
                    <p className="text-[11px] text-ink-subtle mt-0.5">
                      {order.customerDetails.fullName}
                      {(order.customerDetails.phoneNumber || order.customerDetails.mobileNumber) &&
                        ` (${order.customerDetails.phoneNumber || order.customerDetails.mobileNumber})`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink-subtle">
                <span className="flex items-center gap-1.5">
                  <Package className="size-3.5" aria-hidden="true" />
                  <span>Items Ordered ({lines.length})</span>
                </span>
              </div>

              {lines.length === 0 ? (
                <div className="rounded-tile border border-dashed border-line/80 bg-surface-2/40 px-3 py-3 text-center text-xs text-ink-muted">
                  Item details temporarily unavailable.
                </div>
              ) : (
                <div className="divide-y divide-line/60 rounded-tile border border-line/60 bg-surface px-3 py-1">
                  {lines.map((item, idx) => (
                    <div key={item.productId || `line-${idx}`} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="font-medium text-ink truncate">{item.name || 'Item'}</p>
                        <p className="text-[11px] text-ink-subtle">
                          {item.pack && `${item.pack} • `}
                          {formatINR(item.unitPrice ?? 0)} × {item.quantity ?? 1}
                        </p>
                      </div>
                      <span className="tabular font-semibold text-ink shrink-0">
                        {formatINR(item.lineSubtotal ?? ((item.unitPrice ?? 0) * (item.quantity ?? 1)))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Exact Authoritative Calculation */}
            <div className="space-y-2 pt-2 border-t border-line/60 text-sm">
              <div className="flex justify-between text-ink-muted">
                <span>Item Subtotal</span>
                <span className="tabular font-medium text-ink">
                  {formatINR(pricing.itemSubtotal)}
                </span>
              </div>

              <div className="flex justify-between text-ink-muted">
                <div>
                  <span>Delivery Fee</span>
                  {pricing.distanceKm != null && (
                    <span className="text-xs text-ink-subtle block">
                      {`(${formatDistanceKm(pricing.distanceKm)} km ${distanceMethodLabel})`}
                    </span>
                  )}
                </div>
                <span className="tabular font-medium text-ink">
                  {formatINR(pricing.deliveryFee)}
                </span>
              </div>

              <div className="flex justify-between text-ink-muted">
                <span>Allocated Platform Fee</span>
                <span className="tabular font-medium text-ink">
                  {formatINR(pricing.platformFee)}
                </span>
              </div>

              {/* Total Row */}
              <div className="flex justify-between items-baseline pt-3 border-t border-line font-bold text-base text-ink">
                <span>Final Authoritative Total</span>
                <Price amount={pricing.total} size="lg" className="text-brand tabular" />
              </div>

              <p className="text-[11px] text-ink-subtle text-right pt-0.5">
                Exact Total = Item Subtotal + Delivery Fee + Platform Fee
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
