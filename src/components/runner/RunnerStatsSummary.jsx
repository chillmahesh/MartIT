import { PackagePlus, Bike, CheckCircle2, ListFilter, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatINR } from '@/utils/currency'
import { cn } from '@/utils/cn'

/**
 * RunnerStatsSummary Component
 * Displays live counts and earnings ledger derived from orders data.
 */
export function RunnerStatsSummary({
  availableCount = 0,
  activeCount = 0,
  completedCount = 0,
  earnedTotal = 0,
  activeEstimatedTotal = 0,
  selectedTab = 'all',
  onSelectTab,
  className,
}) {
  const stats = [
    {
      id: 'available',
      label: 'New Requests',
      count: availableCount,
      icon: PackagePlus,
      color: 'text-brand',
      bg: 'bg-brand-soft',
      border: 'border-brand/40',
      description: 'Awaiting runner pickup',
    },
    {
      id: 'active',
      label: 'Active Deliveries',
      count: activeCount,
      icon: Bike,
      color: 'text-accent',
      bg: 'bg-accent/10',
      border: 'border-accent/40',
      description: 'Accepted & in transit',
    },
    {
      id: 'completed',
      label: 'Completed',
      count: completedCount,
      icon: CheckCircle2,
      color: 'text-fresh-ink',
      bg: 'bg-fresh-soft',
      border: 'border-fresh-ink/40',
      description: 'Delivered today',
    },
  ]

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
          <ListFilter className="size-3.5" aria-hidden="true" />
          <span>Delivery Activity Summary</span>
        </h2>
        <span className="text-[11px] text-ink-subtle">
          Derived from current records
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {stats.map((stat) => {
          const Icon = stat.icon
          const isSelected = selectedTab === stat.id

          return (
            <Card
              key={stat.id}
              interactive
              onClick={() => onSelectTab?.(stat.id)}
              className={cn(
                'p-4 transition-all cursor-pointer relative overflow-hidden',
                isSelected && `ring-2 ring-brand ${stat.border}`,
              )}
              data-testid={`stat-card-${stat.id}`}
            >
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink-subtle truncate">{stat.label}</p>
                  <p className="font-display text-2xl sm:text-3xl font-extrabold text-ink mt-0.5" data-testid={`stat-count-${stat.id}`}>
                    {stat.count}
                  </p>
                  <p className="text-[11px] text-ink-muted mt-0.5 truncate">{stat.description}</p>
                </div>

                <div className={cn('grid size-11 shrink-0 place-items-center rounded-tile', stat.bg, stat.color)}>
                  <Icon className="size-5" aria-hidden="true" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Earnings & Settlement Summary (P1 Usability) */}
      <div
        className="rounded-tile border border-line bg-surface p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs"
        data-testid="runner-earnings-summary"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-tile bg-fresh-soft text-fresh-ink">
            <Wallet className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-bold text-ink text-sm">Earnings & Payout Ledger</p>
            <p className="text-[11px] text-ink-muted">
              Standard campus policy: ₹8 payout per completed delivery
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-line/60 pt-2.5 sm:pt-0 sm:pl-4">
          <div>
            <p className="text-[11px] text-ink-subtle font-medium">Settled Today</p>
            <p className="font-display text-base font-extrabold text-fresh-ink" data-testid="runner-settled-total">
              {formatINR(earnedTotal)}
            </p>
          </div>

          <div className="h-7 w-px bg-line/60" />

          <div>
            <p className="text-[11px] text-ink-subtle font-medium">In Transit (Est.)</p>
            <p className="font-display text-base font-extrabold text-accent" data-testid="runner-active-estimated-total">
              {formatINR(activeEstimatedTotal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
