import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ShoppingBag,
  ArrowLeft,
  Store,
  MapPin,
  Zap,
  AlertCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore, selectCartStoreId, selectCartCount } from '@/stores/cartStore'
import { useStores, useProducts } from '@/hooks/useCatalogue'
import { useLocations } from '@/hooks/useLocations'
import { useDeliveryQuote } from '@/hooks/useDeliveryQuote'
import { orderService } from '@/services/orderService'
import { CartLineItem } from '@/components/cart/CartLineItem'
import { DeliveryDetailsForm } from '@/components/cart/DeliveryDetailsForm'
import { OrderConfirmationView } from '@/components/cart/OrderConfirmationView'
import {
  validateCheckoutDetails,
  mapCampusLocationToDestinationId,
  OTHER_LOCATION_VALUE,
} from '@/utils/checkoutValidation'
import { Button } from '@/components/ui/Button'
import { Price } from '@/components/ui/Price'
import { formatINR } from '@/utils/currency'
import { formatDistanceKm } from '@/utils/distance'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import {
  FLAT_DELIVERY_FEE,
  FLAT_DELIVERY_FEE_LABEL,
  PRICING_VERSION,
} from '@/config/fees'

export default function CartPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)

  // Cart store
  const lines = useCartStore((s) => s.lines)
  const cartStoreId = useCartStore(selectCartStoreId)
  const cartCount = useCartStore(selectCartCount)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const clearCart = useCartStore((s) => s.clear)
  const checkoutDetails = useCartStore((s) => s.checkoutDetails)
  const setCheckoutDetails = useCartStore((s) => s.setCheckoutDetails)

  // Stores & Products
  const { data: stores = [], isLoading: isLoadingStores } = useStores()
  const effectiveStoreId = cartStoreId || stores[0]?.id || 'store_campus_mart'
  const store = stores.find((s) => s.id === effectiveStoreId) || stores[0]
  const isStoreClosed = store ? !store.isOpen : false

  const { data: products = SAMPLE_PRODUCTS, isLoading: isLoadingProducts } = useProducts()
  const { data: locations = [] } = useLocations()

  // Form validation errors state
  const [fieldErrors, setFieldErrors] = useState({})

  // Prefill authenticated profile details without overwriting existing user edits
  useEffect(() => {
    if (!user) return
    const updates = {}
    if (!checkoutDetails?.fullName && user.name) {
      updates.fullName = user.name
    }
    if (!checkoutDetails?.mobileNumber && user.phone) {
      updates.mobileNumber = user.phone
    }
    if (Object.keys(updates).length > 0) {
      setCheckoutDetails(updates)
    }
  }, [user, checkoutDetails?.fullName, checkoutDetails?.mobileNumber, setCheckoutDetails])

  // Map selected campus preset / other to authoritative registered delivery destination ID
  const selectedLocationId = useMemo(() => {
    const preset = checkoutDetails?.presetLocation || 'A Block'
    return mapCampusLocationToDestinationId(
      preset,
      locations,
      user?.defaultLocationId || 'loc_hostel_b',
    )
  }, [checkoutDetails?.presetLocation, locations, user?.defaultLocationId])

  // Order submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState(null)
  const [createdOrder, setCreatedOrder] = useState(null)

  // Authoritative delivery quote query
  const {
    data: quote,
    isLoading: isLoadingQuote,
    isError: isQuoteError,
    error: quoteError,
  } = useDeliveryQuote({
    storeId: effectiveStoreId,
    locationId: selectedLocationId,
  })

  // Match cart lines with catalogue products
  const cartItemsWithProduct = useMemo(() => {
    return lines.map((line) => {
      const product = products.find((p) => p.id === line.productId)
      return { line, product }
    })
  }, [lines, products])

  // Subtotal calculation from client-side products
  const itemSubtotal = useMemo(() => {
    return cartItemsWithProduct.reduce((sum, { line, product }) => {
      const price = product?.price ?? 0
      return sum + price * line.quantity
    }, 0)
  }, [cartItemsWithProduct])

  const isOutOfDeliveryArea =
    isQuoteError &&
    (quoteError?.code === 'OUT_OF_SERVICE_AREA' || quoteError?.code === 'MAX_DISTANCE_EXCEEDED')
  const isLocationNotFound = isQuoteError && quoteError?.code === 'LOCATION_NOT_FOUND'
  const isCoordinateError =
    isQuoteError &&
    (quoteError?.code === 'INVALID_COORDINATES' || quoteError?.code === 'INVALID_DISTANCE')

  // Estimated base amount before checkout platform fee (Flat ₹10 delivery policy)
  const estimatedBaseAmount = useMemo(() => {
    const isBlocked = isOutOfDeliveryArea || isLocationNotFound || isCoordinateError
    const deliveryFee = (selectedLocationId && !isBlocked) ? (quote?.deliveryFee ?? FLAT_DELIVERY_FEE) : 0
    return Math.round(itemSubtotal + deliveryFee)
  }, [itemSubtotal, quote?.deliveryFee, selectedLocationId, isOutOfDeliveryArea, isLocationNotFound, isCoordinateError])

  // Validation checks
  const hasUnavailableItems = cartItemsWithProduct.some(({ product }) => !product)
  const hasOutOfStockItems = cartItemsWithProduct.some(
    ({ line, product }) => product && (product.stock <= 0 || line.quantity > product.stock),
  )

  const canSubmitOrder =
    lines.length > 0 &&
    !isStoreClosed &&
    Boolean(selectedLocationId) &&
    !isOutOfDeliveryArea &&
    !isLocationNotFound &&
    !isCoordinateError &&
    !hasUnavailableItems &&
    !hasOutOfStockItems &&
    !isSubmitting

  const handleUpdateQuantity = (productId, newQuantity) => {
    setSubmissionError(null)
    setQuantity(productId, newQuantity, effectiveStoreId)
  }

  const handleRemoveItem = (productId) => {
    setSubmissionError(null)
    setQuantity(productId, 0, effectiveStoreId)
  }

  const handleClearCart = () => {
    setSubmissionError(null)
    clearCart()
  }

  const handleDetailChange = (field, value) => {
    setSubmissionError(null)
    setFieldErrors((prev) => ({ ...prev, [field]: null, location: null }))
    setCheckoutDetails({ [field]: value })
  }

  const formattedAddressPreview = useMemo(() => {
    const isOther =
      checkoutDetails?.presetLocation === OTHER_LOCATION_VALUE ||
      checkoutDetails?.presetLocation === 'other'
    if (isOther) {
      const custom = checkoutDetails?.customLocation?.trim()
      if (!custom) return 'Other (enter hostel/landmark details)'
      return checkoutDetails?.deliveryInstructions?.trim()
        ? `${custom}, ${checkoutDetails.deliveryInstructions.trim()}`
        : custom
    }
    const preset = checkoutDetails?.presetLocation || 'A Block'
    return checkoutDetails?.deliveryInstructions?.trim()
      ? `${preset}, ${checkoutDetails.deliveryInstructions.trim()}`
      : preset
  }, [
    checkoutDetails?.presetLocation,
    checkoutDetails?.customLocation,
    checkoutDetails?.deliveryInstructions,
  ])

  // Handle Order Placement
  const handlePlaceOrder = async () => {
    if (!canSubmitOrder) return

    // 1. Authoritative validation of customer delivery details
    const validation = validateCheckoutDetails({
      fullName: checkoutDetails?.fullName,
      mobileNumber: checkoutDetails?.mobileNumber,
      presetLocation: checkoutDetails?.presetLocation,
      customLocation: checkoutDetails?.customLocation,
      deliveryInstructions: checkoutDetails?.deliveryInstructions,
      availableLocations: locations,
      fallbackLocationId: user?.defaultLocationId || 'loc_hostel_b',
    })

    if (!validation.isValid) {
      setFieldErrors(validation.errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    setSubmissionError(null)

    try {
      if (!token) {
        throw new Error('Please sign in to place your order.')
      }

      const orderPayload = {
        storeId: effectiveStoreId,
        locationId: selectedLocationId,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customerDetails: validation.data,
      }

      // Submit through the existing order service
      const newOrder = await orderService.create(orderPayload)

      // Guard: Validate that authoritative order pricing is complete and includes platform fee
      if (
        !newOrder?.pricing ||
        typeof newOrder.pricing.platformFee !== 'number' ||
        typeof newOrder.pricing.baseAmount !== 'number' ||
        typeof newOrder.pricing.total !== 'number' ||
        newOrder.pricing.platformFee <= 0 ||
        Math.abs(newOrder.pricing.total - (newOrder.pricing.baseAmount + newOrder.pricing.platformFee)) > 0.001
      ) {
        throw new Error('Order was created with an invalid pricing snapshot. Please contact support.')
      }

      // Clear cart only after successful response
      clearCart()
      setCreatedOrder(newOrder)
      navigate(`/app/payment?orderId=${newOrder.id}`, { state: { order: newOrder } })
    } catch (err) {
      setSubmissionError(
        err.message || 'We could not complete your order. Please review your cart and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // 1. Order Confirmation View (Shown when order was created)
  if (createdOrder) {
    return (
      <OrderConfirmationView
        order={createdOrder}
        onStartNew={() => setCreatedOrder(null)}
      />
    )
  }

  // 2. Empty Cart View
  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center space-y-5">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-surface-2 text-ink-subtle border border-line shadow-1">
          <ShoppingBag className="size-10 text-fresh-ink" aria-hidden="true" />
        </div>

        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            Your Cart is Empty
          </h1>
          <p className="text-sm text-ink-muted max-w-sm mx-auto">
            Looks like you haven&apos;t added any groceries or snacks yet.
          </p>
        </div>

        <div className="pt-2">
          <Button asChild variant="primary" size="lg">
            <Link to="/app">
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span>Explore Campus Catalogue</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // 3. Active Cart & Checkout Flow
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-line/60">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon-sm" className="rounded-full">
            <Link to="/app" aria-label="Back to store catalogue">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>

          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Your Cart
            </h1>
            <p className="text-xs sm:text-sm text-ink-subtle">
              {cartCount} item{cartCount === 1 ? '' : 's'} from{' '}
              <strong className="text-ink font-semibold">{store ? store.name : 'Store'}</strong>
            </p>
          </div>
        </div>

        {/* Clear Cart Button */}
        <button
          type="button"
          onClick={handleClearCart}
          className="inline-flex items-center gap-1.5 rounded-tile border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft transition-colors shadow-1"
          aria-label="Clear all items from cart"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span>Clear Cart</span>
        </button>
      </div>

      {/* Store Closed Warning */}
      {isStoreClosed && (
        <div className="flex items-start gap-3 rounded-card border border-amber-500/40 bg-amber-500/10 p-4 text-ink">
          <Clock className="size-5 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <strong className="font-semibold text-ink">
              {store ? store.name : 'This store'} is closed right now.
            </strong>
            <p className="text-ink-muted text-xs mt-0.5">
              You can review or adjust your items, but orders cannot be placed until the store re-opens.
            </p>
          </div>
        </div>
      )}

      {/* Submission API Error Banner */}
      {submissionError && (
        <div className="flex items-start gap-3 rounded-card border border-red-500/40 bg-red-500/10 p-4 text-ink">
          <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <strong className="font-semibold text-danger">Checkout was not completed</strong>
            <p className="text-xs text-ink-muted mt-0.5">{submissionError}</p>
          </div>
        </div>
      )}

      {/* Main Grid: Items on Left, Checkout Summary on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left: Cart Product Lines & Delivery Location */}
        <div className="lg:col-span-7 space-y-6">
          {/* Product Lines Section */}
          <section aria-label="Cart items" className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Items from {store ? store.name : 'Store'}
            </h2>

            <div className="space-y-2.5">
              {cartItemsWithProduct.map(({ line, product }) => (
                <CartLineItem
                  key={line.productId}
                  line={line}
                  product={product}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                  disabled={isSubmitting}
                />
              ))}
            </div>
          </section>

          {/* Delivery Details Form */}
          <DeliveryDetailsForm
            details={checkoutDetails}
            errors={fieldErrors}
            onChange={handleDetailChange}
            disabled={isSubmitting}
          />
        </div>

        {/* Right: Sticky Order Summary & Authoritative Pricing */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          <div className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-2 space-y-5">
            <h2 className="font-display text-lg font-bold text-ink border-b border-line/60 pb-3">
              Order Summary
            </h2>

            {/* Delivery Destination Snapshot */}
            <div className="rounded-tile bg-surface-2/60 border border-line/70 p-3 space-y-1 text-xs">
              <div className="flex items-center justify-between text-ink-subtle font-medium">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-fresh-ink shrink-0" aria-hidden="true" />
                  <span>Delivery Destination</span>
                </span>
                <span className="text-[11px] font-semibold text-brand">
                  {checkoutDetails?.presetLocation === OTHER_LOCATION_VALUE ? 'Custom' : 'Preset'}
                </span>
              </div>
              <p className="font-semibold text-ink truncate">
                {formattedAddressPreview}
              </p>
              {checkoutDetails?.fullName && (
                <p className="text-[11px] text-ink-subtle truncate">
                  Recipient: <span className="font-medium text-ink">{checkoutDetails.fullName}</span>
                  {checkoutDetails?.mobileNumber && ` • ${checkoutDetails.mobileNumber}`}
                </p>
              )}
            </div>

            {/* Delivery Quote Snapshot Box */}
            <div className="rounded-tile bg-surface-2/70 border border-line/70 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-ink-subtle font-medium">
                <span className="flex items-center gap-1.5">
                  <Zap className="size-3.5 text-accent shrink-0 fill-accent" aria-hidden="true" />
                  <span>Delivery Estimate</span>
                </span>
                <span className="text-[11px] uppercase tracking-wider font-bold">
                  {quote?.pricingVersion || `Policy ${PRICING_VERSION}`}
                </span>
              </div>

              {!selectedLocationId ? (
                <div className="text-ink-subtle">Select a delivery spot to get quote.</div>
              ) : isOutOfDeliveryArea ? (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-2.5 text-danger space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>Outside 5 km Delivery Radius</span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {`This location is outside our 5 km service area${quoteError?.distanceKm ? ` (${formatDistanceKm(quoteError.distanceKm)} km)` : ''}. Checkout blocked.`}
                  </p>
                </div>
              ) : isLocationNotFound ? (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-2.5 text-danger space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>Choose a valid delivery spot</span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {quoteError?.message || 'Choose a valid delivery spot first.'}
                  </p>
                </div>
              ) : isCoordinateError ? (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-2.5 text-danger space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>Location Coordinates Unavailable</span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {quoteError?.message || "We couldn't verify the location coordinates. Please pick another spot."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 text-ink">
                  <div className="flex justify-between items-center">
                    <span className="text-ink-muted">Delivery Fee:</span>
                    <span className="font-semibold tabular text-brand">
                      {formatINR(quote?.deliveryFee ?? FLAT_DELIVERY_FEE)} (Flat fee)
                    </span>
                  </div>
                  {quote?.distanceKm ? (
                    <div className="flex justify-between items-center text-ink-subtle">
                      <span className="text-ink-muted">Distance:</span>
                      <span className="tabular">
                        {`${formatDistanceKm(quote.distanceKm)} km ${quote.distanceMethod === 'straight_line' ? 'straight-line distance' : 'route distance'}`}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center">
                    <span className="text-ink-muted">Policy:</span>
                    <span className="font-medium text-ink-subtle">{quote?.feeLabel || FLAT_DELIVERY_FEE_LABEL}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Price Lines Breakdown */}
            <div className="space-y-2 text-sm border-b border-line/60 pb-4">
              <div className="flex justify-between text-ink-muted">
                <span>Item Subtotal ({cartCount} items)</span>
                <span className="tabular font-medium text-ink">{formatINR(itemSubtotal)}</span>
              </div>

              <div className="flex justify-between text-ink-muted">
                <div>
                  <span>Delivery Fee</span>
                  {quote?.distanceKm ? (
                    <span className="text-[11px] text-ink-subtle block">
                      {`(${formatDistanceKm(quote.distanceKm)} km ${quote.distanceMethod === 'straight_line' ? 'straight-line distance' : 'route distance'})`}
                    </span>
                  ) : null}
                </div>
                <span className="tabular font-medium text-ink">
                  {isOutOfDeliveryArea
                    ? 'Blocked'
                    : selectedLocationId
                      ? formatINR(quote?.deliveryFee ?? FLAT_DELIVERY_FEE)
                      : 'Select location'}
                </span>
              </div>

              {/* Total Row */}
              <div className="flex justify-between items-baseline pt-2 border-t border-line font-bold text-base text-ink">
                <span>Estimated Total</span>
                <Price
                  amount={estimatedBaseAmount}
                  size="lg"
                  className="text-brand"
                />
              </div>

              <p className="text-[11px] text-ink-subtle pt-1">
                Estimated base total. The final amount includes a small platform fee assigned at checkout.
              </p>
            </div>

            {/* Stock / Item Validation Warning */}
            {hasUnavailableItems && (
              <div className="flex items-start gap-2 text-xs text-danger bg-red-500/10 border border-red-500/20 rounded p-2.5">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>One or more items are unavailable. Remove them before checkout.</span>
              </div>
            )}

            {hasOutOfStockItems && (
              <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded p-2.5">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>Some items exceed available stock. Adjust quantities to proceed.</span>
              </div>
            )}

            {/* Checkout Action Button */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              block
              disabled={!canSubmitOrder}
              loading={isSubmitting}
              onClick={handlePlaceOrder}
              data-testid="continue-to-payment-button"
              className="text-base font-bold shadow-2 hover:scale-[1.01] active:scale-[0.99]"
            >
              {isStoreClosed
                ? 'Store is Closed'
                : isOutOfDeliveryArea
                ? 'Outside Delivery Radius'
                : `Continue to Payment • ${formatINR(estimatedBaseAmount)}`}
            </Button>

            <p className="text-[11px] text-center text-ink-subtle">
              Payment is made upon order placement. You will review authoritative order details in the next step.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
