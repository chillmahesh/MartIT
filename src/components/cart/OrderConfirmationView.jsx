import { Link } from 'react-router'
import {
  CheckCircle2,
  Clock,
  MapPin,
  Store,
  ArrowRight,
  Package,
  AlertCircle,
  UserCheck,
  Check,
} from 'lucide-react'
import { Badge, OrderStatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Price } from '@/components/ui/Price'
import { formatINR } from '@/utils/currency'
import { formatDistanceKm } from '@/utils/distance'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { SAMPLE_STORES } from '@/mocks/campus'
import { useLocations } from '@/hooks/useLocations'
import { CustomerDeliveryOtpCard } from '@/components/customer/CustomerDeliveryOtpCard'
import { cn } from '@/utils/cn'

const TRACKER_STAGES = [
  { id: 'payment', title: 'Payment Confirmed', desc: 'UPI payment verified' },
  { id: 'waiting', title: 'Waiting for Runner', desc: 'Finding campus student runner' },
  { id: 'assigned', title: 'Runner Assigned', desc: 'Student runner accepted request' },
  { id: 'preparing', title: 'Preparing / Pickup', desc: 'Collecting items from store' },
  { id: 'on_the_way', title: 'Out for Delivery', desc: 'En route to your location' },
  { id: 'delivered', title: 'Delivered', desc: 'Handover complete' },
]

/**
 * OrderConfirmationView displays the authoritative order confirmation
 * and live delivery lifecycle tracking for customer orders.
 */
export function OrderConfirmationView({ order, onStartNew }) {
  const { data: locations = [] } = useLocations()

  const store = SAMPLE_STORES.find((s) => s.id === order.storeId)
  const location = locations.find((l) => l.id === order.locationId)

  // Validation guard: authoritative pricing must contain complete snapshot with platform fee included
  const isInvalidPricing =
    !order?.pricing ||
    typeof order.pricing.platformFee !== 'number' ||
    typeof order.pricing.baseAmount !== 'number' ||
    typeof order.pricing.total !== 'number' ||
    order.pricing.platformFee <= 0 ||
    Math.abs(order.pricing.total - (order.pricing.baseAmount + order.pricing.platformFee)) > 0.001

  if (isInvalidPricing) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-red-500/10 text-danger border border-red-500/20">
          <AlertCircle className="size-8" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">Invalid Order Pricing</h1>
        <p className="text-sm text-ink-muted">
          The order response is missing authoritative pricing details (platform fee, base amount, or total).
          Please check your orders or contact campus support.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
          <Button asChild variant="primary">
            <Link to="/app" onClick={onStartNew}>
              <span>Back to Shopping</span>
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/app/orders">
              <span>View Orders</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const distanceMethodLabel =
    order.pricing?.distanceMethod === 'straight_line'
      ? 'straight-line distance'
      : order.pricing?.distanceMethod === 'route'
      ? 'route distance'
      : 'distance'

  const isPaid = order.paymentStatus === 'PAID' || order.payment?.status === 'PAID'
  const isCancelled = order.status === ORDER_STATUS.CANCELLED
  const isExpired =
    order.status === 'EXPIRED' ||
    order.paymentStatus === 'EXPIRED' ||
    order.payment?.status === 'EXPIRED'
  const isPending = !isPaid && !isCancelled && !isExpired

  const hasRunner = Boolean(order.runnerId || order.runner_id || order.runner)

  let currentStageIndex = 0
  if (order.status === ORDER_STATUS.DELIVERED) {
    currentStageIndex = 5
  } else if (order.status === ORDER_STATUS.ON_THE_WAY) {
    currentStageIndex = 4
  } else if (order.status === ORDER_STATUS.PICKED_UP || order.status === ORDER_STATUS.PREPARING) {
    currentStageIndex = 3
  } else if (hasRunner) {
    currentStageIndex = 2
  } else if (order.status === ORDER_STATUS.CONFIRMED || isPaid) {
    currentStageIndex = 1
  }

  // Header Title & Subtitle derived dynamically from authoritative status
  let headerTitle = 'Order Created!'
  let headerSubtitle = 'Your order has been recorded and is currently awaiting payment.'

  if (isPaid) {
    switch (order.status) {
      case ORDER_STATUS.DELIVERED:
        headerTitle = 'Order Delivered!'
        headerSubtitle = 'Your delivery has been completed successfully. Thank you for using MartIT!'
        break
      case ORDER_STATUS.ON_THE_WAY:
        headerTitle = 'Out for Delivery!'
        headerSubtitle = 'Your runner is on the way. Share your delivery OTP upon arrival.'
        break
      case ORDER_STATUS.PICKED_UP:
        headerTitle = 'Items Picked Up!'
        headerSubtitle = 'Your runner has collected your items and is heading to your destination.'
        break
      case ORDER_STATUS.PREPARING:
        headerTitle = 'Runner Preparing Order'
        headerSubtitle = 'A campus student runner has accepted your delivery request and is collecting your items.'
        break
      case ORDER_STATUS.CONFIRMED:
      default:
        headerTitle = 'Payment Verified & Confirmed!'
        headerSubtitle = 'Your payment was received. Finding an available student runner on campus...'
        break
    }
  } else if (isCancelled) {
    headerTitle = 'Order Cancelled'
    headerSubtitle = 'This order has been cancelled.'
  } else if (isExpired) {
    headerTitle = 'Payment Window Expired'
    headerSubtitle = 'The payment reservation window for this order has expired. Please place a new order.'
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12 space-y-6">
      {/* Dynamic Status Banner */}
      <div
        className={cn(
          'rounded-card border p-6 text-center space-y-3',
          isCancelled
            ? 'border-red-500/30 bg-red-500/10'
            : isExpired
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-emerald-500/30 bg-emerald-500/10'
        )}
      >
        <div
          className={cn(
            'mx-auto grid size-14 place-items-center rounded-full text-ink-inverse shadow-2',
            isCancelled ? 'bg-danger' : isExpired ? 'bg-amber-600' : 'bg-fresh'
          )}
        >
          {isCancelled ? (
            <AlertCircle className="size-8" aria-hidden="true" />
          ) : isExpired ? (
            <Clock className="size-8" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-8" aria-hidden="true" />
          )}
        </div>

        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            {headerTitle}
          </h1>
          <p className="text-sm text-ink-muted">
            {headerSubtitle}
          </p>
        </div>

        {/* Order ID & Authoritative Status Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <span className="rounded-full bg-surface border border-line px-3 py-1 font-mono text-xs font-bold text-ink shadow-1">
            Order #{order.id}
          </span>

          {isPaid && (
            <>
              <Badge tone="brand" size="md" className="gap-1 font-semibold">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                <span>Payment: Paid</span>
              </Badge>
              <OrderStatusPill status={order.status} />
            </>
          )}

          {isPending && (
            <>
              <Badge tone="warning" size="md" className="gap-1 font-semibold">
                <Clock className="size-3.5" aria-hidden="true" />
                <span>Awaiting Payment</span>
              </Badge>
              <Badge tone="info" size="md" className="font-semibold">
                Payment: Pending
              </Badge>
            </>
          )}

          {isCancelled && (
            <Badge tone="danger" size="md" className="font-semibold">
              Cancelled
            </Badge>
          )}

          {isExpired && (
            <Badge tone="neutral" size="md" className="font-semibold">
              Expired
            </Badge>
          )}
        </div>
      </div>

      {/* Payment Action or Status Announcement */}
      {isPending ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-tile border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-ink">
          <div className="flex items-start gap-2.5">
            <Clock className="size-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="font-semibold text-ink">Payment Pending:</strong>{' '}
              <span className="text-ink-muted">
                Scan the UPI QR code to complete your payment and confirm runner assignment.
              </span>
            </div>
          </div>
          <Button asChild variant="primary" size="sm" className="shrink-0 w-full sm:w-auto font-semibold">
            <Link to={`/app/payment?orderId=${order.id}`} state={{ order }}>
              <span>Proceed to Payment</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : isCancelled ? (
        <div className="flex items-center gap-2.5 rounded-tile border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-ink">
          <AlertCircle className="size-4 shrink-0 text-red-600" aria-hidden="true" />
          <strong className="font-semibold text-ink">Order Cancelled:</strong>
          <span className="text-ink-muted">For assistance or payment inquiries, contact campus support at +91 98765 43210.</span>
        </div>
      ) : isExpired ? (
        <div className="flex items-center gap-2.5 rounded-tile border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-ink">
          <Clock className="size-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
          <strong className="font-semibold text-ink">Payment Window Expired:</strong>
          <span className="text-ink-muted">If funds were debited, reach out to campus support at +91 98765 43210 with your UPI transaction ID.</span>
        </div>
      ) : order.status === ORDER_STATUS.ON_THE_WAY ? (
        <div data-testid="customer-delivery-otp-card">
          <CustomerDeliveryOtpCard orderId={order.id} />
        </div>
      ) : order.status === ORDER_STATUS.CONFIRMED ? (
        <div className="flex items-center gap-2.5 rounded-tile border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-ink">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <strong className="font-semibold text-ink">Payment Verified & Confirmed:</strong>
          <span className="text-ink-muted">Finding an available campus runner. Your order will update automatically.</span>
        </div>
      ) : order.status === ORDER_STATUS.DELIVERED ? (
        <div className="flex items-center gap-2.5 rounded-tile border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-ink">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <strong className="font-semibold text-ink">Order Completed:</strong>
          <span className="text-ink-muted">Delivery verified and handed over successfully.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-tile border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-ink">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <strong className="font-semibold text-ink">Payment Verified & Confirmed:</strong>
          <span className="text-ink-muted">A student runner will pick up your items shortly.</span>
        </div>
      )}

      {/* 6-Stage Progress Tracker for Paid Orders */}
      {isPaid && (
        <div className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-1 space-y-4" data-testid="order-lifecycle-tracker">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <h2 className="font-display text-sm sm:text-base font-bold text-ink flex items-center gap-2">
              <Package className="size-4 text-brand" aria-hidden="true" />
              <span>Delivery Progress</span>
            </h2>
            <span className="text-xs font-medium text-ink-subtle">
              {`Stage ${Math.min(currentStageIndex + 1, TRACKER_STAGES.length)} of ${TRACKER_STAGES.length}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {TRACKER_STAGES.map((stage, idx) => {
              const isCompleted = idx < currentStageIndex || (idx === TRACKER_STAGES.length - 1 && order.status === ORDER_STATUS.DELIVERED)
              const isCurrent = idx === currentStageIndex && order.status !== ORDER_STATUS.DELIVERED
              const isUpcoming = idx > currentStageIndex && order.status !== ORDER_STATUS.DELIVERED

              return (
                <div
                  key={stage.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-tile p-2.5 border transition-all text-xs',
                    isCompleted && 'border-emerald-500/30 bg-emerald-500/5 text-ink',
                    isCurrent && 'border-brand/40 bg-brand-soft/20 text-ink shadow-1 ring-1 ring-brand/20',
                    isUpcoming && 'border-line/60 bg-surface-2/40 text-ink-subtle'
                  )}
                  data-testid={`tracker-stage-${stage.id}`}
                  data-stage-state={isCompleted ? 'completed' : isCurrent ? 'active' : 'upcoming'}
                >
                  <div
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold mt-0.5',
                      isCompleted && 'bg-fresh text-ink-inverse',
                      isCurrent && 'bg-brand text-ink-inverse animate-pulse',
                      isUpcoming && 'bg-surface-2 text-ink-subtle border border-line'
                    )}
                  >
                    {isCompleted ? <Check className="size-3 stroke-[3]" aria-hidden="true" /> : idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className={cn('font-semibold truncate', isCurrent ? 'text-brand-ink font-bold' : isCompleted ? 'text-ink' : 'text-ink-muted')}>
                      {stage.title}
                    </p>
                    <p className="text-[10px] text-ink-subtle leading-tight mt-0.5 truncate">
                      {stage.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Assigned Runner Card (safely disclosed when runner assigned) */}
      {isPaid && (hasRunner || currentStageIndex >= 2) && order.status !== ORDER_STATUS.DELIVERED && (
        <div className="rounded-card border border-brand/20 bg-brand-soft/10 p-4 sm:p-5 flex items-center justify-between gap-3 shadow-1" data-testid="assigned-runner-card">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
              <UserCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Campus Runner Assigned</p>
              <p className="text-sm font-bold text-ink truncate">
                {order.runnerName || order.runner?.name || 'Student Runner on Duty'}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                Assigned to fulfill your campus order. Present your delivery OTP upon handover.
              </p>
            </div>
          </div>
          <Badge tone="brand" size="sm" className="shrink-0 font-medium">
            Assigned
          </Badge>
        </div>
      )}


      {/* Order Details & Authoritative Pricing */}
      <div className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-2 space-y-6">
        <div className="flex items-center justify-between border-b border-line/60 pb-4">
          <h2 className="font-display text-lg font-bold text-ink">Order Summary</h2>
          <span className="text-xs text-ink-subtle">
            Created: {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Store & Destination */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-surface-2/60 rounded-card p-3.5 border border-line/60">
          <div className="flex items-start gap-2.5">
            <Store className="size-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-ink-subtle">Store</p>
              <p className="font-semibold text-ink">{store ? store.name : order.storeId}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="size-4 text-fresh-ink shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-ink-subtle">Delivery Destination</p>
              <p className="font-semibold text-ink">
                {order.customerDetails?.deliveryLocation?.formattedAddress ||
                  order.customerDetails?.selectedDestination ||
                  (location ? location.name : order.locationId)}
              </p>
              {order.customerDetails?.detailedAddress && !order.customerDetails?.deliveryLocation?.formattedAddress?.includes(order.customerDetails.detailedAddress) && (
                <p className="text-xs text-ink-muted mt-0.5">
                  Landmark: {order.customerDetails.detailedAddress}
                </p>
              )}
              {order.customerDetails?.fullName && (
                <p className="text-xs text-ink-subtle mt-0.5">
                  Recipient: {order.customerDetails.fullName}
                  {(order.customerDetails.phoneNumber || order.customerDetails.mobileNumber) &&
                    ` (${order.customerDetails.phoneNumber || order.customerDetails.mobileNumber})`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Order Line Items */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
            <Package className="size-3.5" aria-hidden="true" />
            <span>Items Ordered ({order.lines.length})</span>
          </h3>

          <div className="divide-y divide-line/60 rounded-tile border border-line/60 bg-surface px-4 py-1">
            {order.lines.map((item) => (
              <div key={item.productId} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0 pr-2">
                  <p className="font-medium text-ink truncate">{item.name}</p>
                  <p className="text-xs text-ink-subtle">
                    {item.pack && `${item.pack} • `}
                    {formatINR(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <span className="tabular font-semibold text-ink shrink-0">
                  {formatINR(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Server Authoritative Pricing Snapshot */}
        <div className="space-y-2.5 pt-2 border-t border-line/60">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
            Authoritative Pricing Snapshot
          </h3>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Item Subtotal</span>
              <span className="tabular font-medium text-ink">
                {formatINR(order.pricing.itemSubtotal)}
              </span>
            </div>

            <div className="flex justify-between text-ink-muted">
              <div>
                <span>Delivery Fee</span>
                {order.pricing.distanceKm != null && (
                  <span className="text-xs text-ink-subtle block">
                    {`(${formatDistanceKm(order.pricing.distanceKm)} km ${distanceMethodLabel})`}
                  </span>
                )}
              </div>
              <span className="tabular font-medium text-ink">
                {formatINR(order.pricing.deliveryFee)}
              </span>
            </div>

            <div className="flex justify-between text-ink-muted">
              <span>Platform Fee</span>
              <span className="tabular font-medium text-ink">
                {formatINR(order.pricing.platformFee)}
              </span>
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t border-line font-bold text-base text-ink">
              <span>Total Amount</span>
              <Price amount={order.pricing.total} size="lg" className="text-brand" />
            </div>

            {order.pricing.pricingVersion && (
              <p className="text-[11px] text-ink-subtle text-right pt-0.5">
                Pricing Policy: {order.pricing.pricingVersion}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button asChild variant="primary" size="lg" block className="sm:flex-1">
          <Link to="/app" onClick={onStartNew}>
            <span>Continue Shopping</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>

        <Button asChild variant="secondary" size="lg" block className="sm:w-auto">
          <Link to="/app/orders">
            View All Orders
          </Link>
        </Button>
      </div>
    </div>
  )
}
