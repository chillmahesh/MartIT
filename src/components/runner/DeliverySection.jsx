import { Inbox } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DeliveryCard } from './DeliveryCard'
import { cn } from '@/utils/cn'

/**
 * DeliverySection Component
 * Wraps a group of orders with a section header, count badge, and empty state.
 */
export function DeliverySection({
  title,
  icon: Icon = Inbox,
  count = 0,
  orders = [],
  emptyTitle = 'No deliveries in this section',
  emptyDescription = 'Orders will appear here as they transition through the delivery lifecycle.',
  onAction,
  isOnline = true,
  className,
  testId,
}) {
  return (
    <section className={cn('space-y-3.5', className)} data-testid={testId || `delivery-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded bg-surface-2 text-ink">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <Badge tone={count > 0 ? 'brand' : 'neutral'} size="sm">
            {count}
          </Badge>
        </div>
      </div>

      {/* Orders Grid or Empty State */}
      {orders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
          {orders.map((order) => (
            <DeliveryCard
              key={order.id}
              order={order}
              onAction={onAction}
              isOnline={isOnline}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-tile border border-dashed border-line bg-surface/40 p-4 sm:p-5 text-center space-y-1.5 max-w-md mx-auto"
          data-testid="section-empty-state"
        >
          <div className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-subtle mx-auto">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <p className="text-xs sm:text-sm font-semibold text-ink">{emptyTitle}</p>
          <p className="text-[11px] sm:text-xs text-ink-subtle max-w-xs sm:max-w-sm mx-auto">{emptyDescription}</p>
        </div>
      )}
    </section>
  )
}
