import { useState, useEffect } from 'react'
import { useLocation, useSearchParams, Link } from 'react-router'
import { ShoppingBag, ArrowLeft, RefreshCw } from 'lucide-react'
import { OrderConfirmationView } from '@/components/cart/OrderConfirmationView'
import { Button } from '@/components/ui/Button'
import { orderService } from '@/services/orderService'

export default function OrderConfirmationPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const orderFromState = location.state?.order
  const orderId = searchParams.get('orderId') || orderFromState?.id

  const [order, setOrder] = useState(orderFromState || null)
  const [isLoading, setIsLoading] = useState(!orderFromState && Boolean(orderId))

  useEffect(() => {
    if (!orderId) return

    let isMounted = true
    const terminalStates = ['DELIVERED', 'CANCELLED', 'EXPIRED']

    const fetchOrder = () => {
      orderService
        .get(orderId)
        .then((data) => {
          if (isMounted && data) {
            setOrder(data)
          }
        })
        .catch(() => {
          // Keep existing order state on transient poll failures
        })
        .finally(() => {
          if (isMounted) setIsLoading(false)
        })
    }

    // Initial fetch if we don't have orderFromState
    if (!orderFromState) {
      setIsLoading(true)
      fetchOrder()
    }

    // If order is in a non-terminal state, poll every 4 seconds to observe runner acceptance and handover progression
    const interval = setInterval(() => {
      if (!isMounted) return
      setOrder((current) => {
        if (!current || terminalStates.includes(current.status)) {
          clearInterval(interval)
          return current
        }
        fetchOrder()
        return current
      })
    }, 4000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [orderId, orderFromState])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center space-y-3">
        <RefreshCw className="size-8 animate-spin mx-auto text-brand" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-ink">Loading Order Details</h2>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-surface-2 text-ink-subtle">
          <ShoppingBag className="size-8" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">No Recent Order Found</h1>
        <p className="text-sm text-ink-muted">
          Looking for past orders? You can explore items in the catalogue or check your order history.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
          <Button asChild variant="primary">
            <Link to="/app">
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span>Back to Shopping</span>
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/app/orders">
              <span>View Orders</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return <OrderConfirmationView order={order} />
}
