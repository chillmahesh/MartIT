import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles,
  X,
  ShoppingBag,
  ClipboardList,
  Store,
  Zap,
  Clock,
  MapPin,
  ArrowRight,
  CreditCard,
  RefreshCw,
  Search,
  ArrowUpDown,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useProducts } from '@/hooks/useCatalogue'
import { orderService } from '@/services/orderService'
import { CatalogueSearch } from '@/components/products/CatalogueSearch'
import { CategoryPills } from '@/components/products/CategoryPills'
import { ProductGrid } from '@/components/products/ProductGrid'
import { QuickCartBar } from '@/components/cart/QuickCartBar'
import { Badge, OrderStatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CustomerDeliveryOtpCard } from '@/components/customer/CustomerDeliveryOtpCard'
import { formatINR } from '@/utils/currency'
import { cn } from '@/utils/cn'
import { SAMPLE_CATEGORIES } from '@/mocks/categories'
import { SAMPLE_STORES, SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'
import { ORDER_STATUS } from '@/utils/orderMachine'

const POPULAR_SEARCHES = ['Maggi', 'Toned Milk', 'Cold Coffee', 'Potato Chips', 'Cookies', 'Notebook']

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name: A to Z' },
]

export default function HomePage() {
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  // Dashboard Tab state: 'catalogue' | 'orders' | 'outlets' | 'budget'
  const [activeTab, setActiveTab] = useState('catalogue')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedStoreId, setSelectedStoreId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('featured') // 'featured' | 'price-asc' | 'price-desc' | 'name-asc'

  // Fetch campus catalogue products
  const { data: rawProducts = [], isLoading: isLoadingProducts } = useProducts()

  // Fetch customer orders for the My Orders tab & active delivery banner
  const {
    data: myOrders = [],
    isLoading: isLoadingOrders,
    refetch: refetchOrders,
    isFetching: isFetchingOrders,
  } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: async () => {
      const res = await orderService.listMyOrders()
      return Array.isArray(res) ? res : []
    },
    staleTime: 10000,
  })

  // Separate active in-flight deliveries from completed orders
  const activeOrders = useMemo(() => {
    return myOrders.filter((o) =>
      ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'PICKED_UP', 'ON_THE_WAY'].includes(o.status),
    )
  }, [myOrders])

  // Filter products by category, store, budget, and search query, then sort
  const filteredProducts = useMemo(() => {
    let result = rawProducts

    // Filter by store if selected
    if (selectedStoreId !== 'all') {
      result = result.filter((p) => p.storeId === selectedStoreId)
    }

    // Filter by Category
    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.categoryId === selectedCategory)
    }

    // Budget tab filter (Under ₹50)
    if (activeTab === 'budget') {
      result = result.filter((p) => Number(p.price) <= 50)
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((p) => {
        const nameMatch = p.name.toLowerCase().includes(q)
        const packMatch = p.pack?.toLowerCase().includes(q)
        const catObj = SAMPLE_CATEGORIES.find((c) => c.id === p.categoryId)
        const catMatch = catObj?.name.toLowerCase().includes(q)
        return nameMatch || packMatch || catMatch
      })
    }

    // Apply sorting
    if (sortBy === 'price-asc') {
      result = [...result].sort((a, b) => Number(a.price) - Number(b.price))
    } else if (sortBy === 'price-desc') {
      result = [...result].sort((a, b) => Number(b.price) - Number(a.price))
    } else if (sortBy === 'name-asc') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [rawProducts, selectedCategory, selectedStoreId, activeTab, searchQuery, sortBy])

  const handleResetFilters = () => {
    setSelectedCategory('all')
    setSelectedStoreId('all')
    setSearchQuery('')
    setSortBy('featured')
  }

  const handlePopularSearch = (query) => {
    setSearchQuery(query)
    setActiveTab('catalogue')
  }

  const selectedCategoryName = SAMPLE_CATEGORIES.find((c) => c.id === selectedCategory)?.name
  const selectedStoreName = SAMPLE_STORES.find((s) => s.id === selectedStoreId)?.name

  const DASHBOARD_TABS = [
    { id: 'catalogue', label: 'All Products', icon: ShoppingBag, count: rawProducts.length },
    {
      id: 'orders',
      label: 'My Orders',
      icon: ClipboardList,
      badge: activeOrders.length > 0 ? `${activeOrders.length} active` : null,
    },
    { id: 'outlets', label: 'Campus Outlets', icon: Store, count: SAMPLE_STORES.length },
    { id: 'budget', label: 'Under ₹50', icon: Zap },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* Greeting & Header Banner */}
      <section aria-labelledby="catalogue-heading" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge tone="brand" size="sm" className="gap-1">
                <Sparkles className="size-3 text-fresh-ink" aria-hidden="true" />
                <span>Campus Delivery</span>
              </Badge>
            </div>
            <h1 id="catalogue-heading" className="font-display text-3xl sm:text-4xl font-bold tracking-display text-ink">
              Hi {firstName}, what do you need?
            </h1>
          </div>

          {/* Quick link to full order tracking if user has active delivery */}
          {activeOrders.length > 0 && (
            <Link
              to="/app/orders"
              className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft/80 px-3 py-1.5 text-xs font-semibold text-fresh-ink shadow-1 hover:bg-brand-soft transition-colors"
            >
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fresh opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-fresh" />
              </span>
              <span>{activeOrders.length} active delivery in progress</span>
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      {/* Prominent Instant Search Bar & Popular Chips */}
      <section aria-label="Search catalogue" className="space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <CatalogueSearch
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val)
              if (activeTab === 'outlets') setActiveTab('catalogue')
            }}
            onClear={() => setSearchQuery('')}
            className="flex-1"
          />
        </div>

        {/* Popular Quick-Search Suggestions */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
          <span className="font-semibold text-ink flex items-center gap-1 mr-1">
            <Search className="size-3 text-brand" aria-hidden="true" />
            <span>Popular:</span>
          </span>
          {POPULAR_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => handlePopularSearch(term)}
              className={cn(
                'rounded-full px-2.5 py-0.5 border text-[11px] font-medium transition-colors',
                searchQuery.toLowerCase() === term.toLowerCase()
                  ? 'border-brand bg-brand-soft text-fresh-ink font-semibold'
                  : 'border-line bg-surface hover:bg-surface-2 hover:border-ink-subtle text-ink-muted',
              )}
            >
              {term}
            </button>
          ))}
        </div>
      </section>

      {/* Interactive Customer Dashboard Segmented Tabs */}
      <nav aria-label="Customer dashboard tabs" className="border-b border-line">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {DASHBOARD_TABS.map(({ id, label, icon: Icon, badge, count }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                id={`dashboard-tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2 rounded-t-tile px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all shrink-0 border-b-2',
                  isActive
                    ? 'border-brand text-brand bg-brand-soft/20'
                    : 'border-transparent text-ink-subtle hover:text-ink hover:bg-surface-2/60',
                )}
              >
                <Icon className={cn('size-4', isActive ? 'text-brand' : 'text-ink-subtle')} aria-hidden="true" />
                <span>{label}</span>
                {badge && (
                  <span className="rounded-full bg-fresh/15 px-1.5 py-0.5 text-[10px] font-bold text-fresh-ink">
                    {badge}
                  </span>
                )}
                {count !== undefined && !badge && (
                  <span className="text-[11px] font-normal text-ink-subtle opacity-70">
                    ({count})
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* =====================================================================
          TAB 1 & 4: CATALOGUE & BUDGET UNDER ₹50 VIEWS
          ===================================================================== */}
      {(activeTab === 'catalogue' || activeTab === 'budget') && (
        <div className="space-y-6">
          {/* Category Pills (available on catalogue view) */}
          {activeTab === 'catalogue' && (
            <CategoryPills
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              products={rawProducts}
            />
          )}

          {/* Active Filter Chips */}
          {(selectedCategory !== 'all' || selectedStoreId !== 'all' || searchQuery || activeTab === 'budget') && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-ink-subtle font-medium">Active filters:</span>

              {activeTab === 'budget' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft border border-brand/40 px-2.5 py-1 text-fresh-ink font-semibold">
                  Under ₹50 Picks
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalogue')}
                    aria-label="Remove budget filter"
                    className="rounded-full p-0.5 hover:bg-brand/20 text-fresh-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {selectedStoreId !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line px-2.5 py-1 text-ink">
                  Outlet: <strong className="font-semibold">{selectedStoreName}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedStoreId('all')}
                    aria-label="Remove outlet filter"
                    className="rounded-full p-0.5 hover:bg-line text-ink-subtle hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line px-2.5 py-1 text-ink">
                  Category: <strong className="font-semibold">{selectedCategoryName}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    aria-label="Remove category filter"
                    className="rounded-full p-0.5 hover:bg-line text-ink-subtle hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {searchQuery && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line px-2.5 py-1 text-ink">
                  Search: <strong className="font-semibold">&ldquo;{searchQuery}&rdquo;</strong>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search query"
                    className="rounded-full p-0.5 hover:bg-line text-ink-subtle hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {sortBy !== 'featured' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line px-2.5 py-1 text-ink">
                  Sort: <strong className="font-semibold">{SORT_OPTIONS.find((s) => s.value === sortBy)?.label || sortBy}</strong>
                  <button
                    type="button"
                    onClick={() => setSortBy('featured')}
                    aria-label="Reset sorting"
                    className="rounded-full p-0.5 hover:bg-line text-ink-subtle hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-brand underline-offset-4 hover:underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Catalogue Grid */}
          <section aria-label="Available products" className="pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold text-ink">
                  {activeTab === 'budget'
                    ? 'Student Budget Picks (Under ₹50)'
                    : selectedStoreId !== 'all'
                    ? `${selectedStoreName} Items`
                    : selectedCategory === 'all'
                    ? 'All Products'
                    : selectedCategoryName || 'Products'}
                </h2>
                <span className="text-xs text-ink-subtle font-medium">
                  ({filteredProducts.length} item{filteredProducts.length === 1 ? '' : 's'})
                </span>
              </div>

              {/* Product Sorting Selector */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <label htmlFor="catalogue-sort" className="text-xs text-ink-subtle font-medium flex items-center gap-1 shrink-0">
                  <ArrowUpDown className="size-3.5 text-brand" aria-hidden="true" />
                  <span>Sort by:</span>
                </label>
                <select
                  id="catalogue-sort"
                  data-testid="catalogue-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-tile border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-brand focus:outline-none shadow-1 transition-colors cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ProductGrid
              products={filteredProducts}
              isLoading={isLoadingProducts}
              searchQuery={searchQuery}
              selectedCategory={selectedCategory}
              onResetFilters={handleResetFilters}
            />
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 2: MY ORDERS IN-DASHBOARD VIEW
          ===================================================================== */}
      {activeTab === 'orders' && (
        <section aria-label="Customer Orders" className="space-y-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">My Campus Orders</h2>
              <p className="text-xs text-ink-subtle mt-0.5">
                Track active orders, view verification OTPs, and reorder campus snacks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                tone="neutral"
                onClick={() => refetchOrders()}
                loading={isFetchingOrders}
                className="text-xs"
                aria-label="Refresh orders"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                <span>Refresh</span>
              </Button>
              <Button asChild size="sm" tone="outline" className="text-xs">
                <Link to="/app/orders">
                  <span>Full History</span>
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Orders Loading */}
          {isLoadingOrders && (
            <div className="space-y-4 animate-pulse">
              <div className="h-28 rounded-card bg-surface-2" />
              <div className="h-28 rounded-card bg-surface-2" />
            </div>
          )}

          {/* Orders Empty State */}
          {!isLoadingOrders && myOrders.length === 0 && (
            <div className="mx-auto max-w-md py-12 text-center space-y-4">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                <ClipboardList className="size-7" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-ink">No Orders Placed Yet</h3>
              <p className="text-xs text-ink-muted">
                You haven&apos;t placed any campus delivery orders yet. Browse snacks or essentials to get started!
              </p>
              <Button tone="brand" size="sm" onClick={() => setActiveTab('catalogue')}>
                <span>Browse Snacks & Essentials</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* Orders List */}
          {!isLoadingOrders && myOrders.length > 0 && (
            <div className="space-y-4">
              {myOrders.map((order) => {
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
                    className="p-4 sm:p-5 border-line space-y-3 shadow-1 hover:shadow-2 transition-shadow"
                    data-testid={`dashboard-order-card-${order.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs sm:text-sm font-bold text-ink">#{order.id}</span>
                        <span className="text-[11px] text-ink-subtle flex items-center gap-1">
                          <Clock className="size-3" aria-hidden="true" />
                          <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                        </span>
                      </div>
                      <OrderStatusPill status={order.status} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-start gap-2 text-ink-muted">
                        <Store className="size-3.5 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                        <div>
                          <p className="font-semibold text-ink">{store ? store.name : order.storeId}</p>
                          <p className="text-[11px] text-ink-subtle truncate">
                            {order.lines?.map((l) => `${l.quantity}× ${l.name}`).join(', ') || 'Campus products'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-ink-muted">
                        <MapPin className="size-3.5 text-fresh-ink shrink-0 mt-0.5" aria-hidden="true" />
                        <div>
                          <p className="font-semibold text-ink">{destinationName}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-line/40 text-xs">
                      <span className="text-ink-muted">
                        Total:{' '}
                        <strong className="text-ink font-bold font-mono">
                          {formatINR(order.pricing?.total || 0)}
                        </strong>
                      </span>

                      <div className="flex items-center gap-2">
                        {isPendingPayment ? (
                          <Button asChild size="sm" tone="brand" className="text-xs h-7">
                            <Link to={`/app/payment?orderId=${order.id}`} state={{ order }}>
                              <CreditCard className="size-3" aria-hidden="true" />
                              <span>Pay Now</span>
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" tone="outline" className="text-xs h-7">
                            <Link to={`/app/order-confirmation?orderId=${order.id}`}>
                              <span>Track Live</span>
                              <ArrowRight className="size-3" aria-hidden="true" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Delivery OTP Card if Out for Delivery */}
                    {isOnTheWay && (
                      <div className="pt-2">
                        <CustomerDeliveryOtpCard orderId={order.id} />
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          TAB 3: CAMPUS OUTLETS / STORES VIEW
          ===================================================================== */}
      {activeTab === 'outlets' && (
        <section aria-label="Campus Outlets" className="space-y-6">
          <div className="border-b border-line pb-3">
            <h2 className="font-display text-xl font-bold text-ink">Campus Outlets & Canteens</h2>
            <p className="text-xs text-ink-subtle mt-0.5">
              Browse stores across campus with real-time open status and student delivery availability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAMPLE_STORES.map((store) => {
              const storeProducts = rawProducts.filter((p) => p.storeId === store.id)
              const hours =
                store.id === 'store_night_canteen'
                  ? '6:00 PM – 2:00 AM'
                  : store.id === 'store_stationery_hub'
                  ? '9:00 AM – 7:00 PM'
                  : '8:00 AM – 10:00 PM'

              const description =
                store.id === 'store_night_canteen'
                  ? 'Hot rolls, sandwiches, instant noodles, chilled sodas & late-night fuel.'
                  : store.id === 'store_stationery_hub'
                  ? 'Lab manuals, spiral notebooks, gel pens & exam supplies.'
                  : 'Dairy, bread, fresh fruits, snacks, toiletries & everyday campus essentials.'

              return (
                <Card
                  key={store.id}
                  className="p-5 flex flex-col justify-between border-line shadow-1 hover:shadow-2 transition-all space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid size-10 place-items-center rounded-tile bg-brand-soft text-fresh-ink">
                        <Store className="size-5" aria-hidden="true" />
                      </div>
                      <Badge tone={store.isOpen ? 'brand' : 'warning'} size="sm">
                        {store.isOpen ? 'Open Now' : 'Closed'}
                      </Badge>
                    </div>

                    <div>
                      <h3 className="font-display text-base font-bold text-ink">{store.name}</h3>
                      <p className="text-xs text-ink-subtle flex items-center gap-1 mt-0.5">
                        <Clock className="size-3" aria-hidden="true" />
                        <span>{hours}</span>
                      </p>
                    </div>

                    <p className="text-xs text-ink-muted leading-relaxed">{description}</p>
                  </div>

                  <div className="pt-3 border-t border-line/60 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-ink-subtle">
                      {storeProducts.length} items available
                    </span>
                    <Button
                      size="sm"
                      tone="brand"
                      onClick={() => {
                        setSelectedStoreId(store.id)
                        setActiveTab('catalogue')
                      }}
                      className="text-xs h-8"
                    >
                      <span>Browse Outlet</span>
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Floating Quick Cart Summary Bar */}
      <QuickCartBar />
    </div>
  )
}
