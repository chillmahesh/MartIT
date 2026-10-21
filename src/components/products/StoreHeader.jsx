import { MapPin, Zap, AlertCircle } from 'lucide-react'
import { StoreSelector } from './StoreSelector'
import { useDeliveryQuote } from '@/hooks/useDeliveryQuote'
import { useLocationName } from '@/hooks/useLocations'
import { useAuthStore } from '@/stores/authStore'
import { formatINR } from '@/utils/currency'
import { formatDistanceKm } from '@/utils/distance'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'

/**
 * StoreHeader displays the store selection control and authoritative delivery quote estimate.
 */
export function StoreHeader({
  stores = [],
  selectedStoreId,
  onSelectStore,
  className,
}) {
  const user = useAuthStore((s) => s.user)
  const locationName = useLocationName(user?.defaultLocationId)

  const { data: quote, isError: quoteError, error: quoteErrObj } = useDeliveryQuote({
    storeId: selectedStoreId,
    locationId: user?.defaultLocationId,
  })

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      {/* Store Switcher */}
      <div className="w-full sm:w-auto">
        <StoreSelector
          stores={stores}
          selectedStoreId={selectedStoreId}
          onSelectStore={onSelectStore}
        />
      </div>

      {/* Authoritative Delivery Estimate Snippet */}
      {user?.defaultLocationId && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted bg-surface border border-line rounded-tile px-3 py-2 shadow-1">
          <MapPin className="size-3.5 text-fresh-ink shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[160px] sm:max-w-none">
            {locationName}
          </span>
          <span className="text-line-strong">•</span>

          {quote ? (
            <span className="flex items-center gap-1.5 text-ink font-semibold">
              <Zap className="size-3 text-accent shrink-0 fill-accent" />
              <span>{formatINR(quote.deliveryFee)} delivery</span>
              <span className="text-ink-subtle font-normal">
                ({formatDistanceKm(quote.distanceKm)} km {quote.distanceMethod === 'straight_line' ? 'straight-line distance' : 'route distance'})
              </span>
            </span>
          ) : quoteError ? (
            <Badge tone="danger" size="sm" className="gap-1">
              <AlertCircle className="size-3" />
              {quoteErrObj?.code === 'OUT_OF_SERVICE_AREA' || quoteErrObj?.code === 'MAX_DISTANCE_EXCEEDED'
                ? 'Outside 5 km delivery radius'
                : 'Cannot deliver here'}
            </Badge>
          ) : (
            <span className="text-ink-subtle">Calculating delivery...</span>
          )}
        </div>
      )}
    </div>
  )
}
