import { useState } from 'react'
import {
  Store,
  MapPin,
  ShoppingBag,
  Clock,
  ArrowRight,
  User,
  CheckCircle2,
  KeyRound,
  AlertCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { OrderStatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { splitDeliveryFee } from '@/utils/deliveryFee'
import { formatINR } from '@/utils/currency'
import { SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'
import { getOrderPickups, areAllPickupsComplete, getStoreDisplayName } from '@/utils/runnerOrders'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/utils/cn'


/**
 * Formats order creation timestamp into readable relative or absolute time.
 */
function formatOrderTime(dateStr) {
  if (!dateStr) return 'Recently'
  try {
    const d = new Date(dateStr)
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'Recently'
  }
}

/**
 * DeliveryCard Component
 * Displays order reference, store(s), destination, items, authoritative delivery fee,
 * multi-store pickup progress, and state-appropriate actions.
 */
export function DeliveryCard({ order, onAction, isOnline = true, currentRunnerId, className }) {
  if (!order) return null

  // Resolve pickup store(s)
  const pickups = getOrderPickups(order)
  const isMultiStore = pickups.length > 1
  const allPickupsDone = areAllPickupsComplete(order)
  const completedPickupCount = pickups.filter((p) => p.status === 'PICKED_UP').length
  const singleStoreName =
    pickups[0]?.storeName ||
    getStoreDisplayName(order.storeId || order.store_id) ||
    order.order_fulfillment_groups?.[0]?.store_snapshot?.name ||
    'Campus Store'

  // Resolve destination details
  const locationId = order.locationId || order.delivery_location_id || order.deliveryLocationId
  const locationObj = SAMPLE_DELIVERY_LOCATIONS.find((l) => l.id === locationId)
  const destination =
    order.customerDetails?.selectedDestination ||
    order.customerDetails?.deliveryLocation?.selectedDestination ||
    order.delivery_location_snapshot?.customerDetails?.selectedDestination ||
    order.deliveryLocationSnapshot?.customerDetails?.selectedDestination ||
    order.customerDetails?.deliveryLocation?.formattedAddress ||
    order.delivery_location_snapshot?.customerDetails?.deliveryLocation?.formattedAddress ||
    order.delivery_location_snapshot?.name ||
    order.deliveryLocationSnapshot?.name ||
    (locationObj ? locationObj.name : locationId) ||
    'Campus Destination'

  const detailedAddress =
    order.customerDetails?.detailedAddress ||
    order.customerDetails?.deliveryLocation?.detailedAddress ||
    order.delivery_location_snapshot?.customerDetails?.detailedAddress ||
    order.deliveryLocationSnapshot?.customerDetails?.detailedAddress ||
    (order.delivery_location_snapshot
      ? [
          order.delivery_location_snapshot.roomNumber,
          order.delivery_location_snapshot.group_name,
          order.delivery_location_snapshot.landmark,
        ].filter(Boolean).join(', ')
      : '') ||
    ''

  const recipientName =
    order.customerDetails?.fullName ||
    order.delivery_location_snapshot?.customerDetails?.fullName ||
    order.delivery_location_snapshot?.fullName ||
    'Customer'

  // Resolve item summary defensively across formats:
  // Canonical lines, raw order_items, or order_fulfillment_groups[].order_items
  const rawLines =
    Array.isArray(order.lines) && order.lines.length > 0
      ? order.lines
      : Array.isArray(order.order_items) && order.order_items.length > 0
        ? order.order_items
        : Array.isArray(order.orderItems) && order.orderItems.length > 0
          ? order.orderItems
          : Array.isArray(order.order_fulfillment_groups)
            ? order.order_fulfillment_groups.flatMap((g) => g.order_items || g.orderItems || [])
            : Array.isArray(order.fulfillmentGroups)
              ? order.fulfillmentGroups.flatMap((g) => g.order_items || g.orderItems || [])
              : []

  const lines = rawLines.map((item) => ({
    name: item.name || item.product_name || item.productName || 'Item',
    quantity: Number(item.quantity ?? 1),
    unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
    lineSubtotal: Number(
      item.lineSubtotal ??
        item.line_subtotal ??
        Number(item.unitPrice ?? item.unit_price ?? 0) * Number(item.quantity ?? 1),
    ),
  }))

  const calculatedLinesTotal = lines.reduce((sum, item) => sum + (item.lineSubtotal || 0), 0)
  const totalItemCount = lines.reduce((sum, item) => sum + (item.quantity || 1), 0)

  // Authoritative item subtotal
  const itemSubtotal =
    order.pricing?.itemSubtotal != null
      ? Number(order.pricing.itemSubtotal)
      : order.item_subtotal != null
        ? Number(order.item_subtotal)
        : order.itemSubtotal != null
          ? Number(order.itemSubtotal)
          : order.pricing?.baseAmount != null
            ? Number(order.pricing.baseAmount)
            : order.base_amount != null
              ? Number(order.base_amount)
              : calculatedLinesTotal

  // Authoritative delivery fee and runner payout
  const deliveryFee =
    order.pricing?.deliveryFee != null
      ? Number(order.pricing.deliveryFee)
      : order.combined_delivery_fee != null
        ? Number(order.combined_delivery_fee)
        : order.combinedDeliveryFee != null
          ? Number(order.combinedDeliveryFee)
          : order.delivery_fee != null
            ? Number(order.delivery_fee)
            : order.deliveryFee != null
              ? Number(order.deliveryFee)
              : 0

  const feeSplit = splitDeliveryFee(deliveryFee)
  const runnerPayout = feeSplit.runnerPayout

  // Status-dependent configuration
  const isAvailable = order.status === ORDER_STATUS.CONFIRMED
  const isPreparing = order.status === ORDER_STATUS.PREPARING
  const isPickedUp = order.status === ORDER_STATUS.PICKED_UP
  const isOnTheWay = order.status === ORDER_STATUS.ON_THE_WAY
  const isDelivered = order.status === ORDER_STATUS.DELIVERED

  // OTP verification state (Milestone 3)
  const [otpInput, setOtpInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [otpError, setOtpError] = useState('')

  const authUserId = useAuthStore((s) => s.user?.id)
  const currentUserId = currentRunnerId ?? authUserId
  const isAssignedToCaller = order.runnerId ? currentUserId === order.runnerId : true

  const handleOtpSubmit = async (e) => {
    e?.preventDefault()
    const cleanOtp = otpInput.trim()
    if (!/^\d{6}$/.test(cleanOtp)) {
      setOtpError('OTP must contain exactly six numeric digits.')
      return
    }
    setIsSubmitting(true)
    setOtpError('')
    try {
      await onAction?.(order, 'verify-otp', { otp: cleanOtp })
      setOtpInput('')
    } catch (err) {
      setOtpError(err.message || 'OTP verification failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card
      className={cn(
        'p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all hover:shadow-2 border-line min-w-0 w-full',
        isAvailable && 'border-brand/40 bg-brand-soft/10',
        className,
      )}
      data-testid={`delivery-card-${order.id}`}
    >
      {/* Top Header: Order Ref, Status Pill, Time */}
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="font-mono text-xs font-bold text-ink truncate max-w-[130px] sm:max-w-[200px]"
            title={`#${order.id}`}
            data-testid={`order-ref-${order.id}`}
          >
            {`#${order.id}`}
          </span>
          <span className="text-[11px] text-ink-subtle flex items-center gap-1 shrink-0">
            <Clock className="size-3" aria-hidden="true" />
            <span>{formatOrderTime(order.createdAt || order.created_at)}</span>
          </span>
        </div>

        <div className="shrink-0">
          <OrderStatusPill status={order.status} />
        </div>
      </div>

      {/* Store and Destination Info */}
      <div className="space-y-3 text-xs min-w-0">
        {/* Single Store vs Multi-store Display */}
        {!isMultiStore ? (
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-2 text-ink-subtle mt-0.5">
              <Store className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-subtle">
                Pickup from
              </p>
              <p className="font-bold text-ink truncate" title={singleStoreName} data-testid={`store-name-${order.id}`}>
                {singleStoreName}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-tile border border-line bg-surface-2/40 p-2.5 space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs font-semibold text-ink gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <Store className="size-3.5 text-ink-subtle shrink-0" aria-hidden="true" />
                <span className="truncate">{`Required Pickups (${pickups.length} stores)`}</span>
              </span>
              <span className="text-[11px] font-medium text-ink-subtle shrink-0">
                {`${completedPickupCount} of ${pickups.length} collected`}
              </span>
            </div>
            <div className="space-y-1.5">
              {pickups.map((p) => {
                const isDone = p.status === 'PICKED_UP'
                return (
                  <div
                    key={p.storeId}
                    className="flex items-center justify-between gap-2 rounded bg-surface px-2.5 py-1.5 text-xs border border-line/50 min-w-0"
                    data-testid={`pickup-store-${order.id}-${p.storeId}`}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span
                        className={cn(
                          'size-2 rounded-full shrink-0',
                          isDone ? 'bg-fresh' : 'bg-warning',
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-ink truncate" title={p.storeName}>{p.storeName}</span>
                    </div>

                    <div className="shrink-0">
                      {isDone ? (
                        <span className="text-[11px] font-semibold text-fresh-ink flex items-center gap-1">
                          <CheckCircle2 className="size-3 text-fresh" aria-hidden="true" />
                          Picked up
                        </span>
                      ) : isPreparing ? (
                        <Button
                          size="sm"
                          tone="brand"
                          onClick={() =>
                            onAction?.(order, 'pickup-store', { storeId: p.storeId })
                          }
                          data-testid={`action-pickup-${order.id}-${p.storeId}`}
                          className="h-6 px-2 text-[10px] font-semibold"
                        >
                          Confirm Pickup
                        </Button>
                      ) : (
                        <span className="text-[11px] text-ink-subtle">Pending</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Drop Destination */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="grid size-6 shrink-0 place-items-center rounded bg-fresh-soft text-fresh-ink mt-0.5">
            <MapPin className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-subtle">
              Deliver to
            </p>
            <p className="font-bold text-ink truncate" title={destination} data-testid={`destination-${order.id}`}>
              {destination}
            </p>
            {detailedAddress && (
              <p className="text-[11px] text-ink-muted truncate mt-0.5" title={detailedAddress} data-testid={`landmark-${order.id}`}>
                {detailedAddress}
              </p>
            )}
            {recipientName && (
              <p className="text-[11px] text-ink-subtle flex items-center gap-1 mt-0.5 min-w-0">
                <User className="size-3 text-ink-subtle shrink-0" aria-hidden="true" />
                <span className="truncate" title={`Recipient: ${recipientName}`}>{`Recipient: ${recipientName}`}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Item Summary */}
      <div className="rounded-tile bg-surface-2/60 border border-line/60 p-2.5 text-xs min-w-0">
        <div className="flex items-center justify-between text-ink-subtle font-medium mb-1 gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <ShoppingBag className="size-3.5 shrink-0" aria-hidden="true" />
            <span data-testid={`item-count-${order.id}`} className="truncate">
              {`${totalItemCount} ${totalItemCount === 1 ? 'item' : 'items'}`}
            </span>
          </span>
          <span className="font-semibold text-ink shrink-0" data-testid={`item-subtotal-${order.id}`}>
            {formatINR(itemSubtotal)}
          </span>
        </div>

        <p className="text-[11px] text-ink-muted truncate" title={lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}>
          {lines.length > 0
            ? lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')
            : 'Standard campus order'}
        </p>
      </div>

      {/* Handover OTP Verification Panel (Milestone 3) */}
      {isOnTheWay && isAssignedToCaller && (
        <div
          className="rounded-tile border border-brand/40 bg-brand-soft/20 p-3 space-y-2.5 min-w-0"
          data-testid={`runner-otp-section-${order.id}`}
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink min-w-0">
              <KeyRound className="size-3.5 text-brand shrink-0" aria-hidden="true" />
              <span className="truncate">Customer Handover Verification</span>
            </div>
            <span className="text-[10px] font-semibold text-brand bg-brand-soft px-2 py-0.5 rounded shrink-0">
              OTP Required
            </span>
          </div>

          <p className="text-[11px] text-ink-muted">
            Ask the recipient for their 6-digit delivery OTP at physical handover to confirm completion.
          </p>

          <form onSubmit={handleOtpSubmit} className="space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <label htmlFor={`otp-input-${order.id}`} className="sr-only">
                6-digit Handover OTP
              </label>
              <input
                id={`otp-input-${order.id}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otpInput}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setOtpInput(clean)
                  if (otpError) setOtpError('')
                }}
                placeholder="6-digit OTP"
                disabled={isSubmitting || !isOnline}
                aria-label="6-digit Handover OTP"
                data-testid={`otp-input-${order.id}`}
                className="w-full sm:flex-1 rounded-tile border border-line bg-surface px-3 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-ink focus:border-brand focus:outline-none min-w-0"
              />
              <Button
                type="submit"
                size="sm"
                tone="brand"
                loading={isSubmitting}
                disabled={otpInput.trim().length !== 6 || isSubmitting || !isOnline}
                data-testid={`action-verify-otp-${order.id}`}
                className="text-xs font-semibold shrink-0 w-full sm:w-auto"
              >
                Verify & Deliver
              </Button>
            </div>

            {otpError && (
              <p
                role="alert"
                className="text-[11px] font-medium text-danger flex items-center gap-1"
                data-testid={`otp-error-${order.id}`}
              >
                <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
                <span className="break-words">{otpError}</span>
              </p>
            )}
          </form>
        </div>
      )}

      {/* Payout & Fee Footer */}
      <div className="border-t border-line/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs min-w-0">
        <div className="min-w-0">
          <p className="text-[11px] text-ink-subtle font-medium">Delivery Fee</p>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-bold text-ink">
              {formatINR(deliveryFee)}
            </span>
            <span className="text-[11px] text-ink-subtle">
              {runnerPayout != null
                ? `(Est. Payout ${formatINR(runnerPayout)})`
                : '(Payout at assignment)'}
            </span>
          </div>
        </div>

        {/* State-appropriate action / label */}
        <div className="shrink-0 flex items-center">
          {isAvailable && (
            <Button
              size="sm"
              tone="brand"
              disabled={!isOnline}
              onClick={() => onAction?.(order, 'accept')}
              data-testid={`action-accept-${order.id}`}
              className="text-xs font-semibold"
            >
              <span>Accept Request</span>
              <ArrowRight className="size-3" aria-hidden="true" />
            </Button>
          )}

          {isPreparing && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent bg-accent/10 rounded px-2 py-1 shrink-0">
                Store Preparing
              </span>
              {!isMultiStore ? (
                <Button
                  size="sm"
                  tone="brand"
                  onClick={() =>
                    onAction?.(order, 'transition', { nextStatus: ORDER_STATUS.PICKED_UP })
                  }
                  data-testid={`action-pickup-${order.id}`}
                  className="text-xs font-semibold shrink-0"
                >
                  <span>Confirm Pickup</span>
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Button>
              ) : allPickupsDone ? (
                <Button
                  size="sm"
                  tone="brand"
                  onClick={() =>
                    onAction?.(order, 'transition', { nextStatus: ORDER_STATUS.PICKED_UP })
                  }
                  data-testid={`action-ready-${order.id}`}
                  className="text-xs font-semibold shrink-0"
                >
                  <span>Ready for Transit</span>
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Button>
              ) : (
                <span className="text-[10px] text-ink-subtle font-medium shrink-0">
                  Collect all stores first
                </span>
              )}
            </div>
          )}

          {isPickedUp && (
            <Button
              size="sm"
              tone="brand"
              onClick={() =>
                onAction?.(order, 'transition', { nextStatus: ORDER_STATUS.ON_THE_WAY })
              }
              data-testid={`action-start-delivery-${order.id}`}
              className="text-xs font-semibold shrink-0"
            >
              <span>Start Delivery</span>
              <ArrowRight className="size-3" aria-hidden="true" />
            </Button>
          )}

          {isOnTheWay && (
            <div className="flex flex-col items-end">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand bg-brand-soft rounded px-2.5 py-1 shrink-0">
                Out for Delivery
              </span>
              <span className="text-[10px] text-ink-subtle mt-0.5">
                {isAssignedToCaller ? 'Awaiting handover OTP' : 'Assigned to another runner'}
              </span>
            </div>
          )}

          {isDelivered && (
            <div className="flex flex-col items-end">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fresh-ink bg-fresh-soft rounded px-2.5 py-1 shrink-0">
                <CheckCircle2 className="size-3 text-fresh" aria-hidden="true" />
                <span>Delivered</span>
              </span>
              {(order.handoverVerifiedAt || order.handover_verified_at) && (
                <span className="text-[10px] text-ink-subtle mt-0.5">
                  OTP Verified
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

