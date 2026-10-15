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
  const singleStoreName = pickups[0]?.storeName || getStoreDisplayName(order.storeId)

  // Resolve destination details
  const locationObj = SAMPLE_DELIVERY_LOCATIONS.find((l) => l.id === order.locationId)
  const destination =
    order.customerDetails?.selectedDestination ||
    order.customerDetails?.deliveryLocation?.selectedDestination ||
    order.customerDetails?.deliveryLocation?.formattedAddress ||
    (locationObj ? locationObj.name : order.locationId) ||
    'Campus Destination'

  const detailedAddress =
    order.customerDetails?.detailedAddress ||
    order.customerDetails?.deliveryLocation?.detailedAddress ||
    ''

  const recipientName = order.customerDetails?.fullName || 'Customer'

  // Item summary
  const lines = order.lines || []
  const totalItemCount = lines.reduce((sum, item) => sum + (item.quantity || 1), 0)

  // Authoritative delivery fee and runner payout
  const deliveryFee = order.pricing?.deliveryFee ?? 0
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
        'p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all hover:shadow-2 border-line',
        isAvailable && 'border-brand/40 bg-brand-soft/10',
        className,
      )}
      data-testid={`delivery-card-${order.id}`}
    >
      {/* Top Header: Order Ref, Status Pill, Time */}
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-ink" data-testid={`order-ref-${order.id}`}>
            {`#${order.id}`}
          </span>
          <span className="text-[11px] text-ink-subtle flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            <span>{formatOrderTime(order.createdAt)}</span>
          </span>
        </div>

        <OrderStatusPill status={order.status} />
      </div>

      {/* Store and Destination Info */}
      <div className="space-y-3 text-xs">
        {/* Single Store vs Multi-store Display */}
        {!isMultiStore ? (
          <div className="flex items-start gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-2 text-ink-subtle mt-0.5">
              <Store className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-subtle">
                Pickup from
              </p>
              <p className="font-bold text-ink truncate" data-testid={`store-name-${order.id}`}>
                {singleStoreName}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-tile border border-line bg-surface-2/40 p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-ink">
              <span className="flex items-center gap-1.5">
                <Store className="size-3.5 text-ink-subtle" aria-hidden="true" />
                <span>{`Required Pickups (${pickups.length} stores)`}</span>
              </span>
              <span className="text-[11px] font-medium text-ink-subtle">
                {`${completedPickupCount} of ${pickups.length} collected`}
              </span>
            </div>
            <div className="space-y-1.5">
              {pickups.map((p) => {
                const isDone = p.status === 'PICKED_UP'
                return (
                  <div
                    key={p.storeId}
                    className="flex items-center justify-between gap-2 rounded bg-surface px-2.5 py-1.5 text-xs border border-line/50"
                    data-testid={`pickup-store-${order.id}-${p.storeId}`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={cn(
                          'size-2 rounded-full shrink-0',
                          isDone ? 'bg-fresh' : 'bg-warning',
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-ink truncate">{p.storeName}</span>
                    </div>

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
                )
              })}
            </div>
          </div>
        )}

        {/* Drop Destination */}
        <div className="flex items-start gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded bg-fresh-soft text-fresh-ink mt-0.5">
            <MapPin className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-subtle">
              Deliver to
            </p>
            <p className="font-bold text-ink truncate" data-testid={`destination-${order.id}`}>
              {destination}
            </p>
            {detailedAddress && (
              <p className="text-[11px] text-ink-muted truncate mt-0.5" data-testid={`landmark-${order.id}`}>
                {detailedAddress}
              </p>
            )}
            {recipientName && (
              <p className="text-[11px] text-ink-subtle flex items-center gap-1 mt-0.5">
                <User className="size-3 text-ink-subtle" aria-hidden="true" />
                <span>{`Recipient: ${recipientName}`}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Item Summary */}
      <div className="rounded-tile bg-surface-2/60 border border-line/60 p-2.5 text-xs">
        <div className="flex items-center justify-between text-ink-subtle font-medium mb-1">
          <span className="flex items-center gap-1.5">
            <ShoppingBag className="size-3.5" aria-hidden="true" />
            <span data-testid={`item-count-${order.id}`}>
              {`${totalItemCount} ${totalItemCount === 1 ? 'item' : 'items'}`}
            </span>
          </span>
          <span className="font-semibold text-ink">
            {formatINR(order.pricing?.itemSubtotal || order.pricing?.baseAmount || 0)}
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
          className="rounded-tile border border-brand/40 bg-brand-soft/20 p-3 space-y-2.5"
          data-testid={`runner-otp-section-${order.id}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
              <KeyRound className="size-3.5 text-brand" aria-hidden="true" />
              <span>Customer Handover Verification</span>
            </div>
            <span className="text-[10px] font-semibold text-brand bg-brand-soft px-2 py-0.5 rounded">
              OTP Required
            </span>
          </div>

          <p className="text-[11px] text-ink-muted">
            Ask the recipient for their 6-digit delivery OTP at physical handover to confirm completion.
          </p>

          <form onSubmit={handleOtpSubmit} className="space-y-2">
            <div className="flex items-center gap-2">
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
                className="flex-1 rounded-tile border border-line bg-surface px-3 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-ink focus:border-brand focus:outline-none"
              />
              <Button
                type="submit"
                size="sm"
                tone="brand"
                loading={isSubmitting}
                disabled={otpInput.trim().length !== 6 || isSubmitting || !isOnline}
                data-testid={`action-verify-otp-${order.id}`}
                className="text-xs font-semibold shrink-0"
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
                <span>{otpError}</span>
              </p>
            )}
          </form>
        </div>
      )}

      {/* Payout & Fee Footer */}
      <div className="border-t border-line/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <p className="text-[11px] text-ink-subtle font-medium">Delivery Fee</p>
          <div className="flex items-baseline gap-1.5">
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
        <div>
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
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent bg-accent/10 rounded px-2 py-1">
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
                  className="text-xs font-semibold"
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
                  className="text-xs font-semibold"
                >
                  <span>Ready for Transit</span>
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Button>
              ) : (
                <span className="text-[10px] text-ink-subtle font-medium">
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
              className="text-xs font-semibold"
            >
              <span>Start Delivery</span>
              <ArrowRight className="size-3" aria-hidden="true" />
            </Button>
          )}

          {isOnTheWay && (
            <div className="flex flex-col items-end">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand bg-brand-soft rounded px-2.5 py-1">
                Out for Delivery
              </span>
              <span className="text-[10px] text-ink-subtle mt-0.5">
                {isAssignedToCaller ? 'Awaiting handover OTP' : 'Assigned to another runner'}
              </span>
            </div>
          )}

          {isDelivered && (
            <div className="flex flex-col items-end">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fresh-ink bg-fresh-soft rounded px-2.5 py-1">
                <CheckCircle2 className="size-3 text-fresh" aria-hidden="true" />
                <span>Delivered</span>
              </span>
              {order.handoverVerifiedAt && (
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

