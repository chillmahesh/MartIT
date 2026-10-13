import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PackagePlus,
  Bike,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Info,
  Clock,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { RunnerAvailabilityToggle } from '@/components/runner/RunnerAvailabilityToggle'
import { RunnerStatsSummary } from '@/components/runner/RunnerStatsSummary'
import { DeliverySection } from '@/components/runner/DeliverySection'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useRunnerStore } from '@/stores/runnerStore'
import { useAuthStore } from '@/stores/authStore'
import { runnerService } from '@/services/runnerService'
import { ORDER_STATUS } from '@/utils/orderMachine'

/**
 * RunnerDashboardPage Component
 * Milestone 1 Implementation:
 * - Runner availability toggle (Online/Offline status)
 * - Dashboard activity summary (Derived counts)
 * - 4 distinct delivery lifecycle sections
 * - Empty & loading states without fake claims
 * - Simulated actions for milestone 1
 */
export default function RunnerDashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { isOnline, activeTab, setActiveTab } = useRunnerStore()
  const [localSimulatedOrders, setLocalSimulatedOrders] = useState([])

  // Query runner orders from service
  const {
    data: remoteOrders = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['runner-orders'],
    queryFn: async () => {
      try {
        const res = await runnerService.getAssignedOrders()
        return Array.isArray(res) ? res : []
      } catch (err) {
        console.warn('Runner orders retrieval notice:', err.message)
        throw err
      }
    },
    staleTime: 30000,
  })

  // Merge remote orders with any local Milestone 1 simulated transitions
  const allOrders = remoteOrders.map((ro) => {
    const override = localSimulatedOrders.find((lo) => lo.id === ro.id)
    return override ? { ...ro, ...override } : ro
  })

  // Categorize orders strictly by delivery lifecycle state
  const availableOrders = allOrders.filter(
    (o) => o.status === ORDER_STATUS.CONFIRMED,
  )
  const assignedOrders = allOrders.filter(
    (o) => o.status === ORDER_STATUS.PREPARING,
  )
  const inProgressOrders = allOrders.filter(
    (o) =>
      o.status === ORDER_STATUS.PICKED_UP || o.status === ORDER_STATUS.ON_THE_WAY,
  )
  const completedOrders = allOrders.filter(
    (o) => o.status === ORDER_STATUS.DELIVERED,
  )

  // Derived counts for dashboard summary
  const availableCount = availableOrders.length
  const activeCount = assignedOrders.length + inProgressOrders.length
  const completedCount = completedOrders.length

  // Simulated action handler for Milestone 1 (Assignment / Status)
  const handleOrderAction = (order, actionType) => {
    if (actionType === 'accept') {
      if (!isOnline) {
        toast.error('You are offline. Go online to accept delivery requests.')
        return
      }

      // Simulate assignment in local state for UI demonstration
      setLocalSimulatedOrders((prev) => [
        ...prev.filter((o) => o.id !== order.id),
        { id: order.id, status: ORDER_STATUS.PREPARING, runnerId: user?.id },
      ])
      toast.success(`Order #${order.id} accepted (Simulated for Milestone 1).`)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      {/* Page Title & Environment Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Runner Dashboard
            </h1>
            <Badge tone="brand" size="md">
              Milestone 1
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-ink-subtle mt-1">
            Welcome back, <span className="font-semibold text-ink">{user?.name || 'Runner'}</span>. Manage your campus pickups and active deliveries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            tone="neutral"
            onClick={() => refetch()}
            loading={isFetching}
            className="text-xs"
            aria-label="Refresh deliveries"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Mock Data Information Banner */}
      <div className="flex items-start gap-2.5 rounded-tile border border-info/30 bg-info/10 p-3 text-xs text-info">
        <Info className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong>Mock Environment:</strong> Runner availability, delivery orders, and status transitions are simulated in this milestone. Real OTP verification and earnings will be connected in Milestone 2.
        </p>
      </div>

      {/* 1. Runner Availability Toggle */}
      <RunnerAvailabilityToggle
        isOnline={isOnline}
        onToggle={useRunnerStore.getState().toggleAvailability}
      />

      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4 text-xs text-ink animate-fade-in"
        >
          <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-bold text-ink">You are currently offline</p>
            <p className="text-ink-muted mt-0.5">
              New delivery requests cannot be accepted while offline. Turn on your availability switch above when you are ready to pick up campus orders.
            </p>
          </div>
        </div>
      )}

      {/* 2. Dashboard Activity Summary */}
      <RunnerStatsSummary
        availableCount={availableCount}
        activeCount={activeCount}
        completedCount={completedCount}
        selectedTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Tab Filter Controls */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-b border-line/60">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'all'
              ? 'bg-brand text-white shadow-1'
              : 'bg-surface-2 text-ink hover:bg-surface-2/80'
          }`}
          data-testid="filter-tab-all"
        >
          <Layers className="size-3.5" aria-hidden="true" />
          <span>All Deliveries</span>
          <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
            {allOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('available')}
          className={`flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'available'
              ? 'bg-brand text-white shadow-1'
              : 'bg-surface-2 text-ink hover:bg-surface-2/80'
          }`}
          data-testid="filter-tab-available"
        >
          <PackagePlus className="size-3.5" aria-hidden="true" />
          <span>Available</span>
          <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
            {availableCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'active'
              ? 'bg-brand text-white shadow-1'
              : 'bg-surface-2 text-ink hover:bg-surface-2/80'
          }`}
          data-testid="filter-tab-active"
        >
          <Bike className="size-3.5" aria-hidden="true" />
          <span>Active</span>
          <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
            {activeCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'completed'
              ? 'bg-brand text-white shadow-1'
              : 'bg-surface-2 text-ink hover:bg-surface-2/80'
          }`}
          data-testid="filter-tab-completed"
        >
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          <span>Completed</span>
          <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
            {completedCount}
          </span>
        </button>
      </div>

      {/* Error State */}
      {isError && (
        <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-xs text-danger space-y-2">
          <p className="font-bold">Failed to load runner orders</p>
          <p className="text-ink-muted">
            {error?.message || 'Could not retrieve runner delivery records. Please try again.'}
          </p>
          <Button size="sm" tone="danger" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-6 animate-pulse" data-testid="runner-loading-skeleton">
          <div className="h-6 w-48 rounded bg-surface-2" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="h-48 rounded-card bg-surface-2" />
            <div className="h-48 rounded-card bg-surface-2" />
            <div className="h-48 rounded-card bg-surface-2" />
          </div>
        </div>
      )}

      {/* 3. Delivery Sections */}
      {!isLoading && (
        <div className="space-y-8">
          {/* Section A: Available Requests */}
          {(activeTab === 'all' || activeTab === 'available') && (
            <DeliverySection
              title="Available Requests"
              icon={PackagePlus}
              count={availableCount}
              orders={availableOrders}
              emptyTitle="No available delivery requests"
              emptyDescription="There are currently no new campus orders awaiting runner pickup. New paid orders will appear here automatically."
              onAction={handleOrderAction}
              isOnline={isOnline}
              testId="section-available-requests"
            />
          )}

          {/* Section B: Accepted / Assigned Deliveries */}
          {(activeTab === 'all' || activeTab === 'active') && (
            <DeliverySection
              title="Accepted & Preparing"
              icon={Clock}
              count={assignedOrders.length}
              orders={assignedOrders}
              emptyTitle="No accepted deliveries awaiting pickup"
              emptyDescription="Orders you accept will be listed here while the campus store packs the items."
              onAction={handleOrderAction}
              isOnline={isOnline}
              testId="section-accepted-deliveries"
            />
          )}

          {/* Section C: In-Progress Deliveries */}
          {(activeTab === 'all' || activeTab === 'active') && (
            <DeliverySection
              title="In-Progress Deliveries"
              icon={Bike}
              count={inProgressOrders.length}
              orders={inProgressOrders}
              emptyTitle="No deliveries in transit"
              emptyDescription="Orders that have been picked up from the store and are en route to the customer will appear here."
              onAction={handleOrderAction}
              isOnline={isOnline}
              testId="section-in-progress-deliveries"
            />
          )}

          {/* Section D: Completed Deliveries */}
          {(activeTab === 'all' || activeTab === 'completed') && (
            <DeliverySection
              title="Completed Deliveries"
              icon={CheckCircle2}
              count={completedCount}
              orders={completedOrders}
              emptyTitle="No completed deliveries yet"
              emptyDescription="Orders that have been delivered to customers with OTP verification will be archived here."
              onAction={handleOrderAction}
              isOnline={isOnline}
              testId="section-completed-deliveries"
            />
          )}
        </div>
      )}
    </div>
  )
}
