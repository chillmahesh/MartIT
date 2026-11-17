import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { useRunnerStore } from '@/stores/runnerStore'
import { cn } from '@/utils/cn'
import { Radio } from 'lucide-react'

/**
 * RunnerAvailabilityToggle Component
 * Displays Online/Offline status with an accessible Radix Switch.
 * Note: Availability is managed as UI/mock state for Milestone 1.
 */
export function RunnerAvailabilityToggle({ isOnline: propOnline, onToggle: propToggle, className }) {
  const storeOnline = useRunnerStore((s) => s.isOnline)
  const storeToggle = useRunnerStore((s) => s.toggleAvailability)
  const isOnline = propOnline !== undefined ? propOnline : storeOnline
  const toggleAvailability = propToggle ?? storeToggle

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-card border bg-surface shadow-1 transition-all',
        isOnline ? 'border-brand/30 bg-brand-soft/20' : 'border-line bg-surface',
        className,
      )}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <div
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-tile transition-colors',
            isOnline ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-subtle',
          )}
        >
          <Radio className={cn('size-5', isOnline && 'animate-pulse')} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-base font-bold shrink-0',
                isOnline ? 'text-brand-ink' : 'text-ink-subtle',
              )}
            >
              <span
                className={cn(
                  'size-2.5 rounded-full transition-colors',
                  isOnline ? 'bg-brand animate-pulse' : 'bg-ink-subtle/50',
                )}
                aria-hidden="true"
              />
              <span data-testid="runner-status-text">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </span>

            <Badge tone={isOnline ? 'brand' : 'neutral'} size="sm" className="shrink-0">
              {isOnline ? 'Active for pickups' : 'Paused'}
            </Badge>

            <span className="hidden md:inline-block text-[11px] text-ink-subtle border border-line rounded px-1.5 py-0.5 shrink-0">
              UI state
            </span>
          </div>

          <p className="text-xs text-ink-muted mt-0.5">
            {isOnline
              ? 'You are visible and ready to accept new campus delivery requests.'
              : 'You are offline. Toggle to online when you are ready to receive delivery requests.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
        <label
          htmlFor="runner-availability-switch"
          className="text-xs font-semibold text-ink cursor-pointer select-none"
        >
          {isOnline ? 'Go Offline' : 'Go Online'}
        </label>
        <Switch
          id="runner-availability-switch"
          data-testid="runner-availability-toggle"
          checked={isOnline}
          onCheckedChange={toggleAvailability}
          aria-label="Toggle runner availability"
        />
      </div>
    </div>
  )
}
