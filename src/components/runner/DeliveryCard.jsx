import { Store, MapPin, ShoppingBag, Clock, IndianRupee, ArrowRight, User } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { OrderStatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { splitDeliveryFee } from '@/utils/deliveryFee'
import { formatINR } from '@/utils/currency'
import { SAMPLE_STORES, SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'
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
 * Displays order reference, store info, destination, items, authoritative delivery fee, and state action.
 */
export function DeliveryCard({ order, onAction, isOnline = true, className }) {
  if (!order) return null

  // Resolve store details
  const store = SAMPLE_STORES.find((s) => s.id === order.storeId)
  const storeName = store ? store.name.replace(' (sample store)', '') : order.storeId || 'Campus Store'

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
      <div className="space-y-2.5 text-xs">
        {/* Pickup Store */}
        <div className="flex items-start gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-2 text-ink-subtle mt-0.5">
            <Store className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-subtle">
              Pickup from
            </p>
            <p className="font-bold text-ink truncate" data-testid={`store-name-${order.id}`}>
              {storeName}
            </p>
          </div>
        </div>

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

      {/* Payout & Fee Footer */}
      <div className="border-t border-line/60 pt-3 flex items-center justify-between gap-3 text-xs">
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
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent bg-accent/10 rounded px-2.5 py-1">
              Store Preparing
            </span>
          )}

          {(isPickedUp || isOnTheWay) && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand bg-brand-soft rounded px-2.5 py-1">
              Out for Delivery
            </span>
          )}

          {isDelivered && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fresh-ink bg-fresh-soft rounded px-2.5 py-1">
              Delivered
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
