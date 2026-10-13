import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  ShoppingBag,
  Store,
  MapPin,
  Clock,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  PackageCheck,
  CreditCard,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OrderStatusPill } from '@/components/ui/Badge'
import { CustomerDeliveryOtpCard } from '@/components/customer/CustomerDeliveryOtpCard'
import { orderService } from '@/services/orderService'
import { ORDER_STATUS } from '@/utils/orderMachine'
import { formatINR } from '@/utils/currency'
import { SAMPLE_STORES, SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'

export default function OrdersPage() {
  const {
    data: orders = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: async () => {
      const res = await orderService.listMyOrders()
      return Array.isArray(res) ? res : []
    },
    staleTime: 10000,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            My Orders
          </h1>
          <p className="text-xs sm:text-sm text-ink-subtle mt-1">
            Track active deliveries, view receipt summaries, and manage handover verification.
          </p>
        </div>

        <Button
          size="sm"
          tone="neutral"
          onClick={() => refetch()}
          loading={isFetching}
          className="text-xs self-start sm:self-auto"
          aria-label="Refresh orders"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse" data-testid="orders-loading-skeleton">
          <div className="h-32 rounded-card bg-surface-2" />
          <div className="h-32 rounded-card bg-surface-2" />
        </div>
      )}

      {/* Error State */}
      {isError && (
        <Card className="p-6 text-center border-danger/30 bg-danger/5 space-y-3">
          <p className="font-bold text-danger text-sm">Failed to load order history</p>
          <p className="text-xs text-ink-muted">
            {error?.message || 'Could not retrieve your orders. Please try again.'}
          </p>
          <Button size="sm" tone="danger" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !isError && orders.length === 0 && (
        <div className="mx-auto max-w-md py-16 text-center space-y-4" data-testid="orders-empty-state">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-surface-2 text-ink-subtle">
            <ShoppingBag className="size-8" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-ink">No Orders Placed Yet</h2>
          <p className="text-sm text-ink-muted">
            You don&apos;t have any past or active campus delivery orders.
          </p>
          <div className="pt-2">
            <Button asChild tone="brand">
              <Link to="/app">
                <span>Start Shopping</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Order Cards List */}
      {!isLoading && !isError && orders.length > 0 && (
        <div className="space-y-6" data-testid="orders-list">
          {orders.map((order) => {
            const store = SAMPLE_STORES.find((s) => s.id === order.storeId)
            const location = SAMPLE_DELIVERY_LOCATIONS.find((l) => l.id === order.locationId)
            const destinationName =
              order.customerDetails?.selectedDestination ||
              order.customerDetails?.deliveryLocation?.selectedDestination ||
              (location ? location.name : order.locationId) ||
              'Campus Destination'

            const isOnTheWay = order.status === ORDER_STATUS.ON_THE_WAY
            const isDelivered = order.status === ORDER_STATUS.DELIVERED
            const isPendingPayment = order.paymentStatus !== 'PAID' && order.status === ORDER_STATUS.AWAITING_PAYMENT

            return (
              <Card
                key={order.id}
                className="p-5 sm:p-6 border-line space-y-4 shadow-1 hover:shadow-2 transition-shadow"
                data-testid={`customer-order-card-${order.id}`}
              >
                {/* Header: Order ID, Status, Timestamp */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink" data-testid={`order-id-${order.id}`}>
                      #{order.id}
                    </span>
                    <span className="text-xs text-ink-subtle flex items-center gap-1">
                      <Clock className="size-3" aria-hidden="true" />
                      <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>

                  <OrderStatusPill status={order.status} />
                </div>

                {/* Body: Store, Destination, Items, Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2 text-ink-muted">
                    <Store className="size-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-ink">{store ? store.name : order.storeId}</p>
                      <p className="text-[11px] text-ink-subtle truncate">
                        {order.lines?.map((l) => `${l.quantity}× ${l.name}`).join(', ') || 'Campus products'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-ink-muted">
                    <MapPin className="size-4 text-fresh-ink shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-ink">{destinationName}</p>
                      {order.customerDetails?.detailedAddress && (
                        <p className="text-[11px] text-ink-subtle truncate">
                          {order.customerDetails.detailedAddress}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Total and Payment Status */}
                <div className="flex items-center justify-between pt-1 border-t border-line/40 text-xs">
                  <span className="text-ink-muted">
                    Total Amount:{' '}
                    <strong className="text-ink font-bold font-mono">
                      {formatINR(order.pricing?.total || 0)}
                    </strong>
                  </span>

                  {isPendingPayment && (
                    <Button asChild size="sm" tone="brand" className="text-xs font-semibold">
                      <Link to={`/app/payment?orderId=${order.id}`} state={{ order }}>
                        <CreditCard className="size-3.5" aria-hidden="true" />
                        <span>Pay Now</span>
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Handover OTP Verification Panel for ON_THE_WAY orders */}
                {isOnTheWay && (
                  <div className="pt-2">
                    <CustomerDeliveryOtpCard orderId={order.id} />
                  </div>
                )}

                {/* Delivered confirmation */}
                {isDelivered && (
                  <div
                    className="flex items-center gap-2 rounded-tile bg-fresh/10 border border-fresh/30 p-3 text-xs text-fresh-ink"
                    data-testid={`delivered-banner-${order.id}`}
                  >
                    <CheckCircle2 className="size-4 text-fresh shrink-0" aria-hidden="true" />
                    <div>
                      <strong className="font-bold">Delivered Successfully!</strong>
                      <span className="text-ink-muted block text-[11px]">
                        Order was handed over and verified via secure delivery OTP.
                        {order.handoverVerifiedAt &&
                          ` Verified at ${new Date(order.handoverVerifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Preparation status */}
                {!isOnTheWay && !isDelivered && !isPendingPayment && (
                  <div className="flex items-center gap-2 rounded-tile bg-surface-2/60 border border-line/60 p-2.5 text-xs text-ink-muted">
                    <PackageCheck className="size-4 text-brand shrink-0" aria-hidden="true" />
                    <span>
                      Order is being processed. Your delivery handover OTP will be generated as soon as your runner is en route.
                    </span>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
