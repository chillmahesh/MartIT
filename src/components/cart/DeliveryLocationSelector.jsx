import { useMemo } from 'react'
import { MapPin, ChevronDown, Check, Building, GraduationCap, Home, Compass } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useLocations } from '@/hooks/useLocations'
import { cn } from '@/utils/cn'

const GROUP_ICONS = {
  Hostels: Home,
  Academic: GraduationCap,
  Residential: Building,
  'Off-campus': Compass,
}

/**
 * DeliveryLocationSelector allows customers to select a supported campus delivery location.
 */
export function DeliveryLocationSelector({
  selectedLocationId,
  onSelectLocation,
  disabled = false,
  className,
}) {
  const { data: locations = [], isLoading } = useLocations()

  const selectedLocation = useMemo(() => {
    return locations.find((l) => l.id === selectedLocationId) || null
  }, [locations, selectedLocationId])

  // Group locations
  const groupedLocations = useMemo(() => {
    const groups = {}
    for (const loc of locations) {
      const g = loc.group || 'Other'
      if (!groups[g]) groups[g] = []
      groups[g].push(loc)
    }
    return groups
  }, [locations])

  const GroupIcon = (selectedLocation && GROUP_ICONS[selectedLocation.group]) || MapPin

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
        Delivery Spot
      </label>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={disabled || isLoading}
          className={cn(
            'group flex w-full items-center justify-between gap-3 rounded-tile border border-line-strong bg-surface px-3.5 py-2.5 shadow-1 transition-all text-left',
            'hover:border-ink-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] select-none',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
          aria-label="Select delivery location"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-fresh-soft text-fresh-ink">
              <GroupIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink leading-tight">
                {isLoading ? 'Loading campus locations...' : selectedLocation ? selectedLocation.name : 'Choose delivery location'}
              </p>
              {selectedLocation && (
                <p className="truncate text-xs text-ink-subtle mt-0.5">
                  {selectedLocation.group} Area
                </p>
              )}
            </div>
          </div>

          <ChevronDown className="size-4 text-ink-subtle shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            data-lenis-prevent
            data-lenis-prevent-wheel
            onWheel={(e) => e.stopPropagation()}
            className="z-50 w-[min(380px,calc(100vw-32px))] max-h-80 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-1.5 shadow-2 data-[state=open]:animate-fade-in"
          >
            <div className="px-3 py-2 border-b border-line/60">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Campus Locations</p>
              <p className="text-xs text-ink-muted mt-0.5">Select where our campus runner should meet you.</p>
            </div>

            <div className="py-1">
              {Object.entries(groupedLocations).map(([groupName, groupLocs]) => {
                const Icon = GROUP_ICONS[groupName] || MapPin
                return (
                  <div key={groupName} className="mb-2 last:mb-0">
                    <div className="px-3 py-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-subtle/80 bg-surface-2/60 rounded">
                      <Icon className="size-3" aria-hidden="true" />
                      <span>{groupName}</span>
                    </div>

                    <div className="mt-1 space-y-0.5">
                      {groupLocs.map((loc) => {
                        const isSelected = loc.id === selectedLocationId
                        return (
                          <DropdownMenu.Item
                            key={loc.id}
                            onSelect={() => onSelectLocation(loc.id)}
                            className={cn(
                              'flex items-center justify-between gap-2.5 rounded-tile px-3 py-2 text-sm cursor-pointer outline-none transition-colors',
                              isSelected ? 'bg-brand-soft text-brand-ink font-semibold' : 'data-[highlighted]:bg-surface-2 text-ink',
                            )}
                          >
                            <span className="truncate">{loc.name}</span>
                            {isSelected && <Check className="size-4 text-fresh-ink shrink-0" aria-hidden="true" />}
                          </DropdownMenu.Item>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
