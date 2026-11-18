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
import {
  useCartStore,
  selectCartStoreId,
  selectCartCount,
  selectDistinctStoreIds,
  selectIsMultiStore,
  selectMultiStoreCount,
} from '@/stores/cartStore'
import { useShallow } from 'zustand/react/shallow'
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
  CAMPUS_LOCATION_DESTINATION_MAP,
  OTHER_LOCATION_VALUE,
} from '@/utils/checkoutValidation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Price } from '@/components/ui/Price'
import { formatINR } from '@/utils/currency'
import { formatDistanceKm } from '@/utils/distance'
import { calculateAdditionalStoreSurcharge } from '@/utils/deliveryFee'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import { SAMPLE_STORES } from '@/mocks/campus'
import {
  FLAT_DELIVERY_FEE,
  FLAT_DELIVERY_FEE_LABEL,
  MULTI_STORE_SURCHARGE,
  MULTI_STORE_SURCHARGE_LABEL,
  PRICING_VERSION,
} from '@/config/fees'
import { cn } from '@/utils/cn'

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
  const checkoutDetails = useCartStore(useShallow((s) => s.checkoutDetails))
  const setCheckoutDetails = useCartStore((s) => s.setCheckoutDetails)

  // Stores & Products
  const { data: stores = [], isLoading: isLoadingStores } = useStores()
  const distinctStoreIds = useCartStore(useShallow(selectDistinctStoreIds))
  const isMultiStore = distinctStoreIds.length > 1
  const storeCount = distinctStoreIds.length
  const effectiveStoreId = cartStoreId || distinctStoreIds[0] || stores[0]?.id || 'store_campus_mart'
  const store = stores.find((s) => s.id === effectiveStoreId) || stores[0]

  // Multi-store resolution & closed-store checks
  const cartStores = useMemo(() => {
    return distinctStoreIds.map((sid) => {
      return (
        stores.find((s) => s.id === sid) ||
        SAMPLE_STORES.find((s) => s.id === sid) ||
        { id: sid, name: 'Campus Store', isOpen: true }
      )
    })
  }, [distinctStoreIds, stores])

  const closedStores = useMemo(() => {
    return cartStores.filter((s) => !s.isOpen)
  }, [cartStores])

  const anyStoreClosed = closedStores.length > 0
  const isStoreClosed = store ? !store.isOpen : false

  // Surcharge for extra distinct stores: A = max(0, N - 1) * S
  const additionalStoreSurcharge = useMemo(() => {
    return calculateAdditionalStoreSurcharge(storeCount, MULTI_STORE_SURCHARGE)
  }, [storeCount])

  const { data: products = SAMPLE_PRODUCTS, isLoading: isLoadingProducts } = useProducts()
  const { data: locations = [] } = useLocations()

  // Form validation errors state
  const [fieldErrors, setFieldErrors] = useState({})

  // Prefill authenticated profile details without overwriting existing user edits
  const userName = user?.name
  const userPhone = user?.phone
  const userDefaultLocationId = user?.defaultLocationId
  const userId = user?.id

  useEffect(() => {
    const updates = {}
    if (!checkoutDetails?.fullName && userName) {
      updates.fullName = userName
    }
    if (!checkoutDetails?.mobileNumber && userPhone) {
      updates.mobileNumber = userPhone
    }
    // Prefill active destination if not set and not explicitly cleared
    if (
      !checkoutDetails?.isCleared &&
      !checkoutDetails?.presetLocation &&
      !checkoutDetails?.customLocation
    ) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem('martit_saved_delivery_location')
          if (raw) {
            const saved = JSON.parse(raw)
            if (!saved.userId || !userId || saved.userId === userId) {
              if (saved.presetLocation) updates.presetLocation = saved.presetLocation
              if (saved.customLocation) updates.customLocation = saved.customLocation
              if (saved.deliveryInstructions) updates.deliveryInstructions = saved.deliveryInstructions
            }
          }
        }
      } catch {}

      if (!updates.presetLocation && userDefaultLocationId) {
        const matchedPreset = Object.entries(CAMPUS_LOCATION_DESTINATION_MAP).find(
          ([, destId]) => destId === userDefaultLocationId,
        )?.[0]
        if (matchedPreset) {
          updates.presetLocation = matchedPreset
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      setCheckoutDetails(updates)
    }
  }, [
    userName,
    userPhone,
    userDefaultLocationId,
    userId,
    checkoutDetails?.fullName,
    checkoutDetails?.mobileNumber,
    checkoutDetails?.presetLocation,
    checkoutDetails?.customLocation,
    checkoutDetails?.isCleared,
    setCheckoutDetails,
  ])

  // Map selected campus preset / other to authoritative registered delivery destination ID
  const selectedLocationId = useMemo(() => {
    if (checkoutDetails?.isCleared) {
      return null
    }
    const preset = checkoutDetails?.presetLocation
    const custom = checkoutDetails?.customLocation
    if (preset) {
      return mapCampusLocationToDestinationId(
        preset,
        locations,
        user?.defaultLocationId || 'loc_hostel_b',
      )
    }
    if (custom) {
      return mapCampusLocationToDestinationId(
        OTHER_LOCATION_VALUE,
        locations,
        user?.defaultLocationId || 'loc_hostel_b',
      )
    }
    if (user?.defaultLocationId) {
      const exists = locations.some((l) => l.id === user.defaultLocationId)
      if (exists || locations.length === 0) {
        return user.defaultLocationId
      }
    }
    // Fallback for SSR / initial cart preview
    return mapCampusLocationToDestinationId(
      'A Block',
      locations,
      'loc_hostel_a',
    )
  }, [
    checkoutDetails?.presetLocation,
    checkoutDetails?.customLocation,
    checkoutDetails?.isCleared,
    locations,
    user?.defaultLocationId,
  ])

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

  // Group cart lines by store for multi-store layout
  const cartItemsByStore = useMemo(() => {
    const map = new Map()
    for (const sid of distinctStoreIds) {
      const storeObj =
        stores.find((s) => s.id === sid) ||
        SAMPLE_STORES.find((s) => s.id === sid) ||
        { id: sid, name: 'Campus Store', isOpen: true }
      map.set(sid, {
        store: storeObj,
        items: [],
        subtotal: 0,
      })
    }
    for (const item of cartItemsWithProduct) {
      const itemStoreId = item.line.storeId || item.product?.storeId || effectiveStoreId
      let group = map.get(itemStoreId)
      if (!group) {
        const storeObj =
          stores.find((s) => s.id === itemStoreId) ||
          SAMPLE_STORES.find((s) => s.id === itemStoreId) ||
          { id: itemStoreId, name: 'Campus Store', isOpen: true }
        group = { store: storeObj, items: [], subtotal: 0 }
        map.set(itemStoreId, group)
      }
      group.items.push(item)
      group.subtotal += (item.product?.price ?? 0) * item.line.quantity
    }
    return Array.from(map.values())
  }, [distinctStoreIds, cartItemsWithProduct, effectiveStoreId, stores])

  const isOutOfDeliveryArea =
    isQuoteError &&
    (quoteError?.code === 'OUT_OF_SERVICE_AREA' || quoteError?.code === 'MAX_DISTANCE_EXCEEDED')
  const isLocationNotFound = isQuoteError && quoteError?.code === 'LOCATION_NOT_FOUND'
  const isCoordinateError =
    isQuoteError &&
    (quoteError?.code === 'INVALID_COORDINATES' || quoteError?.code === 'INVALID_DISTANCE')

  // Estimated base amount before checkout platform fee (Flat ₹10 delivery policy + additional store surcharge)
  const isBlocked = isOutOfDeliveryArea || isLocationNotFound || isCoordinateError
  const baseDeliveryFee = (selectedLocationId && !isBlocked) ? (quote?.deliveryFee ?? FLAT_DELIVERY_FEE) : 0
  const totalDeliveryFee = (selectedLocationId && !isBlocked) ? (baseDeliveryFee + additionalStoreSurcharge) : 0

  const estimatedBaseAmount = useMemo(() => {
    return Math.round(itemSubtotal + totalDeliveryFee)
  }, [itemSubtotal, totalDeliveryFee])

  // Validation checks
  const hasUnavailableItems = cartItemsWithProduct.some(({ product }) => !product)
  const hasOutOfStockItems = cartItemsWithProduct.some(
    ({ line, product }) => product && (product.stock <= 0 || line.quantity > product.stock),
  )

  const canSubmitOrder =
    lines.length > 0 &&
    !anyStoreClosed &&
    Boolean(selectedLocationId) &&
    !isOutOfDeliveryArea &&
    !isLocationNotFound &&
    !isCoordinateError &&
    !hasUnavailableItems &&
    !hasOutOfStockItems &&
    !isSubmitting

  const handleUpdateQuantity = (productId, newQuantity) => {
    setSubmissionError(null)
    const existingLine = lines.find((l) => l.productId === productId)
    setQuantity(productId, newQuantity, existingLine?.storeId || effectiveStoreId)
  }

  const handleRemoveItem = (productId) => {
    setSubmissionError(null)
    const existingLine = lines.find((l) => l.productId === productId)
    setQuantity(productId, 0, existingLine?.storeId || effectiveStoreId)
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
    if (checkoutDetails?.isCleared) {
      return 'Select campus destination'
    }
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
    if (checkoutDetails?.presetLocation) {
      const preset = checkoutDetails.presetLocation
      return checkoutDetails?.deliveryInstructions?.trim()
        ? `${preset}, ${checkoutDetails.deliveryInstructions.trim()}`
        : preset
    }
    if (user?.defaultLocationId) {
      const locName = locations.find((l) => l.id === user.defaultLocationId)?.name
      if (locName) return locName
    }
    return 'A Block'
  }, [
    checkoutDetails?.presetLocation,
    checkoutDetails?.customLocation,
    checkoutDetails?.deliveryInstructions,
    checkoutDetails?.isCleared,
    user?.defaultLocationId,
    locations,
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
        storeIds: distinctStoreIds,
        locationId: selectedLocationId,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          storeId: l.storeId || effectiveStoreId,
        })),
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
              {cartCount} item{cartCount === 1 ? '' : 's'}
              {isMultiStore ? (
                <span> across <strong className="text-ink font-semibold">{storeCount} campus stores</strong></span>
              ) : (
                <span> from <strong className="text-ink font-semibold">{store ? store.name : 'Store'}</strong></span>
              )}
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

      {/* Multi-Store Persistent Indicator Banner */}
      {isMultiStore && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-card border border-brand/30 bg-brand-soft/40 p-4 text-ink">
          <div className="flex items-start gap-3">
            <Store className="size-5 shrink-0 text-brand mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <strong className="font-semibold text-ink">{`Multi-Store Order (${storeCount} Stores)`}</strong>
                <Badge variant="brand" size="xs">Combined Delivery</Badge>
              </div>
              <p className="text-ink-muted text-xs mt-0.5">
                Items will be collected from {cartStores.map((s) => s.name?.replace(/\s*\(sample store\)/i, '')).join(', ')}.
                {additionalStoreSurcharge > 0 && ` An additional surcharge of ${formatINR(additionalStoreSurcharge)} is included.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Store Closed Warning */}
      {anyStoreClosed && (
        <div className="flex items-start gap-3 rounded-card border border-amber-500/40 bg-amber-500/10 p-4 text-ink">
          <Clock className="size-5 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <strong className="font-semibold text-ink">
              {closedStores.map((s) => s.name?.replace(/\s*\(sample store\)/i, '')).join(', ')} {closedStores.length === 1 ? 'is' : 'are'} closed right now.
            </strong>
            <p className="text-ink-muted text-xs mt-0.5">
              You can review or adjust your items, but orders cannot be placed until all stores in your cart re-open.
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
          <section aria-label="Cart items" className="space-y-4">
            {isMultiStore ? (
              cartItemsByStore.map((group) => (
                <div key={group.store.id} className="rounded-card border border-line bg-surface p-4 sm:p-5 shadow-1 space-y-3">
                  <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Store className="size-4 text-brand shrink-0" aria-hidden="true" />
                      <h2 className="text-sm font-bold text-ink">
                        {group.store.name?.replace(/\s*\(sample store\)/i, '')}
                      </h2>
                      {!group.store.isOpen && (
                        <Badge variant="danger" size="xs">Closed</Badge>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-ink-muted">
                      {group.items.length} item{group.items.length === 1 ? '' : 's'} • {formatINR(group.subtotal)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {group.items.map(({ line, product }) => (
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
                </div>
              ))
            ) : (
              <div className="space-y-3">
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
              </div>
            )}
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
                <div className="space-y-1.5 text-ink">
                  <div className="flex justify-between items-center">
                    <span className="text-ink-muted">Base Delivery Fee:</span>
                    <span className="font-semibold tabular text-brand">
                      {formatINR(baseDeliveryFee)} (Flat fee)
                    </span>
                  </div>
                  {isMultiStore && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-ink-muted">
                        Additional Store Surcharge ({storeCount - 1} extra store{storeCount - 1 > 1 ? 's' : ''}):
                      </span>
                      <span className="font-semibold tabular text-ink">
                        +{formatINR(additionalStoreSurcharge)}
                      </span>
                    </div>
                  )}
                  {quote?.distanceKm ? (
                    <div className="flex justify-between items-center text-ink-subtle">
                      <span className="text-ink-muted">Distance:</span>
                      <span className="tabular">
                        {`${formatDistanceKm(quote.distanceKm)} km ${quote.distanceMethod === 'straight_line' ? 'straight-line distance' : 'route distance'}`}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center pt-1 border-t border-line/40">
                    <span className="font-semibold text-ink">Total Delivery Fee:</span>
                    <span className="font-bold tabular text-brand">
                      {formatINR(totalDeliveryFee)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-ink-subtle">
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
                  {isMultiStore ? (
                    <span className="text-[11px] text-ink-subtle block">
                      {`Base ${formatINR(baseDeliveryFee)} + Surcharge ${formatINR(additionalStoreSurcharge)}`}
                    </span>
                  ) : quote?.distanceKm ? (
                    <span className="text-[11px] text-ink-subtle block">
                      {`(${formatDistanceKm(quote.distanceKm)} km ${quote.distanceMethod === 'straight_line' ? 'straight-line distance' : 'route distance'})`}
                    </span>
                  ) : null}
                </div>
                <span className="tabular font-medium text-ink">
                  {isOutOfDeliveryArea
                    ? 'Blocked'
                    : selectedLocationId
                      ? formatINR(totalDeliveryFee)
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

            <p className="text-[11px] text-center text-ink-subtle leading-normal">
              Payment is made upon order placement. By proceeding, you agree to MartIT&apos;s{' '}
              <Link to="/terms-and-conditions" target="_blank" className="underline hover:text-ink">
                Terms
              </Link>{' '}
              &amp;{' '}
              <Link to="/privacy-policy" target="_blank" className="underline hover:text-ink">
                Privacy Policy
              </Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
