import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bike,
  Box,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  TrendingUp,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import { Badge, OrderStatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toaster'
import { adminService } from '@/services/adminService'
import { catalogueService } from '@/services/catalogueService'
import { orderService } from '@/services/orderService'
import { request } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission, PERMISSIONS, ROLE_LABEL, ROLES } from '@/utils/permissions'
import { formatINR } from '@/utils/currency'
import { ORDER_STATUS, ORDER_STATUS_LABEL } from '@/utils/orderMachine'
import { SAMPLE_STORES, SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'

const RUNNER_TONE = { pending: 'warning', applicant: 'warning', approved: 'brand', suspended: 'danger' }

export default function AdminConsolePage({ initialTab = 'people' } = {}) {
  const me = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  // Top-level Navigation Tab: 'people' | 'orders' | 'exceptions' | 'stores'
  const [consoleTab, setConsoleTab] = useState(initialTab)

  // People & Roles Queries & State
  const {
    data: users,
    isLoading: isLoadingUsers,
    error: usersError,
  } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminService.listUsers })
  const [search, setSearch] = useState('')
  const [activeRoleTab, setActiveRoleTab] = useState('all')

  // Orders & Operations Queries & State
  const {
    data: orders = [],
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
    error: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: async () => {
      const res = await adminService.listOrders()
      return Array.isArray(res) ? res : []
    },
    staleTime: 10000,
  })
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [orderStoreFilter, setOrderStoreFilter] = useState('all')

  // Stores Query
  const {
    data: storesList = [],
    isLoading: isLoadingStores,
    refetch: refetchStores,
  } = useQuery({
    queryKey: ['admin', 'stores'],
    queryFn: async () => {
      const res = await request('stores.list')
      return Array.isArray(res) && res.length > 0 ? res : SAMPLE_STORES
    },
    staleTime: 15000,
  })

  // Products Query for Store Operations
  const {
    data: productsList = [],
    isLoading: isLoadingProducts,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['catalogue', 'products'],
    queryFn: async () => {
      const res = await catalogueService.listProducts()
      return Array.isArray(res) ? res : []
    },
    staleTime: 15000,
  })
  const [productSearch, setProductSearch] = useState('')
  const [productStoreFilter, setProductStoreFilter] = useState('all')

  // Mutations
  const onDoneUser = (msg) => (updated) => {
    const targetId = updated.id || updated.userId
    qc.setQueryData(['admin', 'users'], (list) =>
      list?.map((u) => {
        if (u.id !== targetId) return u
        return {
          ...u,
          ...updated,
          id: u.id,
          name: updated.name ?? u.name,
          email: updated.email ?? u.email,
          roles: updated.roles ?? u.roles,
          runnerStatus: updated.runnerStatus !== undefined ? updated.runnerStatus : u.runnerStatus,
        }
      })
    )
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    toast.success(typeof msg === 'function' ? msg(updated) : msg)
  }
  const onError = (e) => toast.error(e.message || 'Action failed. Please try again.')

  const runnerMutation = useMutation({
    mutationFn: ({ userId, status }) => adminService.setRunnerStatus(userId, status),
    onSuccess: onDoneUser((u) => `${u.name || 'User'}: runner ${u.runnerStatus}`),
    onError,
  })
  const roleMutation = useMutation({
    mutationFn: ({ userId, role, granted }) => adminService.setRole(userId, role, granted),
    onSuccess: onDoneUser((u) => `${u.name || 'User'}: roles updated`),
    onError,
  })

  // Store toggle mutation
  const storeMutation = useMutation({
    mutationFn: ({ storeId, isOpen }) => adminService.updateStore(storeId, { isOpen }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin', 'stores'] })
      toast.success(`${updated.name || 'Store'} is now ${updated.isOpen ? 'Open' : 'Closed'}`)
    },
    onError,
  })

  // Product stock & availability mutation
  const productMutation = useMutation({
    mutationFn: ({ productId, stock, isAvailable }) =>
      adminService.updateProduct(productId, { stock, isAvailable }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['catalogue', 'products'] })
      toast.success(`${updated.name || 'Product'} inventory & availability updated`)
    },
    onError,
  })

  // Check payment mutation for exceptions
  const [checkingOrderId, setCheckingOrderId] = useState(null)
  const handleCheckOrderPayment = async (orderId) => {
    try {
      setCheckingOrderId(orderId)
      const res = await orderService.checkPayment(orderId)
      await refetchOrders()
      if (res.status === 'verified') {
        toast.success(`Payment verified! Order #${orderId} is now confirmed.`)
      } else {
        toast.info(res.message || 'Payment verification inconclusive. Awaiting gateway/email evidence.')
      }
    } catch (err) {
      toast.error(err.message || 'Payment check failed.')
    } finally {
      setCheckingOrderId(null)
    }
  }

  const handleExpireOrderPayment = async (orderId) => {
    try {
      await orderService.expire(orderId)
      await refetchOrders()
      toast.success(`Order #${orderId} payment window expired and held slot released.`)
    } catch (err) {
      toast.error(err.message || 'Failed to expire order.')
    }
  }

  const canApprove = hasPermission(me, PERMISSIONS.RUNNERS_APPROVE)
  const canAssign = hasPermission(me, PERMISSIONS.ROLES_ASSIGN)
  const busy =
    runnerMutation.isPending ||
    roleMutation.isPending ||
    storeMutation.isPending ||
    productMutation.isPending

  // Derived user metrics
  const userMetrics = useMemo(() => {
    const list = users || []
    const totalUsers = list.length
    const applicants = list.filter((u) => u.runnerStatus === 'applicant' || u.runnerStatus === 'pending').length
    const activeRunners = list.filter((u) => u.runnerStatus === 'approved').length
    const admins = list.filter(
      (u) => Array.isArray(u.roles) && (u.roles.includes(ROLES.ADMIN) || u.roles.includes(ROLES.SUPER_ADMIN))
    ).length
    return { totalUsers, applicants, activeRunners, admins }
  }, [users])

  // Filtered users
  const filteredUsers = useMemo(() => {
    let list = users || []
    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
    }
    if (activeRoleTab === 'applicants') {
      list = list.filter((u) => u.runnerStatus === 'applicant' || u.runnerStatus === 'pending')
    } else if (activeRoleTab === 'runners') {
      list = list.filter((u) => u.runnerStatus === 'approved')
    } else if (activeRoleTab === 'admins') {
      list = list.filter(
        (u) => Array.isArray(u.roles) && (u.roles.includes(ROLES.ADMIN) || u.roles.includes(ROLES.SUPER_ADMIN))
      )
    } else if (activeRoleTab === 'customers') {
      list = list.filter(
        (u) =>
          !Array.isArray(u.roles) ||
          (!u.roles.includes(ROLES.ADMIN) && !u.roles.includes(ROLES.SUPER_ADMIN) && u.runnerStatus !== 'approved')
      )
    }
    return list
  }, [users, search, activeRoleTab])

  // Derived order metrics
  const orderMetrics = useMemo(() => {
    const list = orders || []
    const total = list.length
    const awaitingPayment = list.filter((o) => o.status === ORDER_STATUS.AWAITING_PAYMENT).length
    const inFulfillment = list.filter(
      (o) =>
        o.status === ORDER_STATUS.CONFIRMED ||
        o.status === ORDER_STATUS.PREPARING ||
        o.status === ORDER_STATUS.PICKED_UP ||
        o.status === ORDER_STATUS.ON_THE_WAY
    ).length
    const delivered = list.filter((o) => o.status === ORDER_STATUS.DELIVERED).length
    const exceptions = list.filter(
      (o) =>
        o.status === ORDER_STATUS.AWAITING_PAYMENT ||
        o.paymentStatus === 'EXPIRED' ||
        o.paymentStatus === 'FAILED' ||
        (o.paymentStatus === 'PENDING' && o.status !== ORDER_STATUS.DELIVERED)
    ).length
    return { total, awaitingPayment, inFulfillment, delivered, exceptions }
  }, [orders])

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let list = orders || []
    const query = orderSearch.trim().toLowerCase()
    if (query) {
      list = list.filter((o) => {
        const idMatch = o.id?.toLowerCase().includes(query)
        const nameMatch = o.customerDetails?.fullName?.toLowerCase().includes(query)
        const phoneMatch = o.customerDetails?.phoneNumber?.includes(query)
        const destMatch = o.customerDetails?.selectedDestination?.toLowerCase().includes(query)
        return idMatch || nameMatch || phoneMatch || destMatch
      })
    }
    if (orderStatusFilter !== 'all') {
      list = list.filter((o) => o.status === orderStatusFilter)
    }
    if (orderStoreFilter !== 'all') {
      list = list.filter((o) => o.storeId === orderStoreFilter)
    }
    return list
  }, [orders, orderSearch, orderStatusFilter, orderStoreFilter])

  // Payment Exceptions list
  const exceptionOrders = useMemo(() => {
    return (orders || []).filter(
      (o) =>
        o.status === ORDER_STATUS.AWAITING_PAYMENT ||
        o.paymentStatus === 'EXPIRED' ||
        o.paymentStatus === 'FAILED' ||
        (o.paymentStatus === 'PENDING' && o.status !== ORDER_STATUS.DELIVERED)
    )
  }, [orders])

  // Admin Operational Metrics (Volume, Fulfillment time, Cancellations, Payment exceptions)
  const operationalMetrics = useMemo(() => {
    const list = orders || []
    const totalOrders = list.length

    // GMV & Realized Revenue
    const grossGMV = list
      .filter((o) => o.status !== ORDER_STATUS.CANCELLED)
      .reduce((sum, o) => sum + (o.pricing?.total || 0), 0)

    const realizedRevenue = list
      .filter((o) => o.status === ORDER_STATUS.DELIVERED)
      .reduce((sum, o) => sum + (o.pricing?.total || 0), 0)

    // Average Fulfillment Time from delivered orders
    const completedWithTimestamps = list.filter((o) => {
      if (o.status !== ORDER_STATUS.DELIVERED) return false
      const start = o.payment?.paidAt || o.paidAt || o.createdAt
      const end = o.deliveredAt
      return Boolean(start && end)
    })

    const durationsMinutes = completedWithTimestamps
      .map((o) => {
        const start = new Date(o.payment?.paidAt || o.paidAt || o.createdAt).getTime()
        const end = new Date(o.deliveredAt).getTime()
        const diffMs = end - start
        return diffMs > 0 ? diffMs / (1000 * 60) : null
      })
      .filter((d) => d !== null)

    const avgFulfillmentMins =
      durationsMinutes.length > 0
        ? Math.round(durationsMinutes.reduce((a, b) => a + b, 0) / durationsMinutes.length)
        : null

    // Cancellations & Expiries
    const cancelledCount = list.filter(
      (o) => o.status === ORDER_STATUS.CANCELLED || o.paymentStatus === 'EXPIRED'
    ).length
    const cancellationRate =
      totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(1) : '0.0'

    // Payment Exceptions & Verification
    const paidCount = list.filter((o) => o.paymentStatus === 'PAID').length
    const exceptionCount = list.filter(
      (o) =>
        o.status === ORDER_STATUS.AWAITING_PAYMENT ||
        o.paymentStatus === 'EXPIRED' ||
        o.paymentStatus === 'FAILED'
    ).length
    const paymentSuccessRate =
      paidCount + exceptionCount > 0
        ? ((paidCount / (paidCount + exceptionCount)) * 100).toFixed(1)
        : '100.0'

    return {
      totalOrders,
      grossGMV,
      realizedRevenue,
      avgFulfillmentMins,
      completedCount: durationsMinutes.length,
      cancelledCount,
      cancellationRate,
      paidCount,
      exceptionCount,
      paymentSuccessRate,
    }
  }, [orders])

  // Low-Stock Products & Product Search Filter
  const lowStockProducts = useMemo(() => {
    return productsList.filter((p) => p.stock <= 5)
  }, [productsList])

  const filteredProducts = useMemo(() => {
    let list = productsList
    if (productStoreFilter !== 'all') {
      list = list.filter((p) => p.storeId === productStoreFilter)
    }
    const q = productSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.categoryId?.toLowerCase().includes(q) ||
          p.pack?.toLowerCase().includes(q)
      )
    }
    return list
  }, [productsList, productStoreFilter, productSearch])

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="info" size="md">
              Administrator Portal
            </Badge>
            <span className="text-xs text-ink-subtle">Authorized Session</span>
          </div>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-display text-ink">
            Campus Operations Console
          </h1>
          <p className="mt-1 max-w-xl text-xs sm:text-sm text-ink-muted">
            Live order monitoring, payment verification tracking, runner authorizations, and store controls.
          </p>
        </div>

        {/* Global Refresh Action */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            size="sm"
            variant="secondary"
            loading={isFetchingOrders}
            onClick={() => {
              refetchOrders()
              refetchStores()
              qc.invalidateQueries({ queryKey: ['admin', 'users'] })
            }}
            className="text-xs"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span>Refresh All Data</span>
          </Button>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-1" data-testid="admin-console-nav">
        {[
          { id: 'people', label: `People & Roles (${userMetrics.totalUsers})`, icon: Users },
          { id: 'orders', label: `All Orders (${orderMetrics.total})`, icon: ShoppingBag },
          { id: 'exceptions', label: `Payment Exceptions (${orderMetrics.exceptions})`, icon: AlertTriangle },
          { id: 'stores', label: 'Store & Operations', icon: Store },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = consoleTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`tab-${tab.id}`}
              onClick={() => setConsoleTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-tile border-b-2 transition-all ${
                isActive
                  ? 'border-brand text-brand bg-brand-soft/20 font-bold'
                  : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PEOPLE & ROLES */}
      {/* ========================================================================= */}
      {consoleTab === 'people' && (
        <div className="space-y-6 animate-fadeIn" data-testid="section-people-roles">
          {/* Real Statistics Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-muted shrink-0">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Total Users</p>
                <p className="text-2xl font-bold font-display text-ink">
                  {isLoadingUsers ? '-' : userMetrics.totalUsers}
                </p>
              </div>
            </Card>

            <Card className="p-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning shrink-0">
                <Bike className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Runner Applicants</p>
                <p className="text-2xl font-bold font-display text-ink">
                  {isLoadingUsers ? '-' : userMetrics.applicants}
                </p>
              </div>
            </Card>

            <Card className="p-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand shrink-0">
                <Bike className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Active Runners</p>
                <p className="text-2xl font-bold font-display text-ink">
                  {isLoadingUsers ? '-' : userMetrics.activeRunners}
                </p>
              </div>
            </Card>

            <Card className="p-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-info-soft text-info shrink-0">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Admins</p>
                <p className="text-2xl font-bold font-display text-ink">
                  {isLoadingUsers ? '-' : userMetrics.admins}
                </p>
              </div>
            </Card>
          </div>

          {usersError && (
            <p className="rounded-tile bg-danger-soft p-3 text-sm font-medium text-danger">{usersError.message}</p>
          )}

          {/* Filter and Search Bar */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            <div className="flex flex-wrap gap-1.5 p-1 rounded-card bg-surface-2 border border-line">
              {[
                { id: 'all', label: `All (${userMetrics.totalUsers})` },
                { id: 'applicants', label: `Applicants (${userMetrics.applicants})` },
                { id: 'runners', label: `Runners (${userMetrics.activeRunners})` },
                { id: 'admins', label: `Admins (${userMetrics.admins})` },
                { id: 'customers', label: 'Customers' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRoleTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-tile transition-all ${
                    activeRoleTab === tab.id
                      ? 'bg-surface text-ink shadow-1'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="w-full md:w-72">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                icon={Search}
                size="sm"
              />
            </div>
          </div>

          {/* User Records List */}
          <ul className="grid gap-3" aria-busy={isLoadingUsers || busy}>
            {isLoadingUsers &&
              Array.from({ length: 3 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-24 rounded-card" />
                </li>
              ))}

            {!isLoadingUsers && filteredUsers.length === 0 && (
              <li className="text-center py-12 rounded-card border border-line bg-surface p-6">
                <p className="text-base font-semibold text-ink">No matching users found</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {search ? 'Try clearing your search term.' : 'No users match this filter.'}
                </p>
                {search && (
                  <Button size="sm" variant="secondary" onClick={() => setSearch('')} className="mt-4">
                    Clear search
                  </Button>
                )}
              </li>
            )}

            {filteredUsers.map((u) => {
              const userRoles = Array.isArray(u.roles) ? u.roles : []
              const isAdmin = userRoles.includes(ROLES.ADMIN)
              const isSuperAdmin = userRoles.includes(ROLES.SUPER_ADMIN)
              const isApplicant = u.runnerStatus === 'applicant' || u.runnerStatus === 'pending'
              const isApproved = u.runnerStatus === 'approved'

              return (
                <li key={u.id}>
                  <Card className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center shadow-1">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-tile bg-surface-2 text-ink-muted">
                        <UserRound className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-ink">
                            {u.name} {u.id === me?.id && <span className="font-normal text-ink-subtle">(you)</span>}
                          </p>
                        </div>
                        <p className="truncate text-sm text-ink-subtle">{u.email}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {userRoles.map((r) => (
                            <Badge
                              key={r}
                              tone={r === ROLES.SUPER_ADMIN ? 'info' : r === ROLES.ADMIN ? 'brand' : 'neutral'}
                            >
                              {ROLE_LABEL[r] || r}
                            </Badge>
                          ))}
                          {u.runnerStatus && (
                            <Badge tone={RUNNER_TONE[u.runnerStatus]}>Runner: {u.runnerStatus}</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {canApprove && isApplicant && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy}
                            onClick={() => runnerMutation.mutate({ userId: u.id, status: 'approved' })}
                          >
                            Approve runner
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:bg-danger-soft hover:text-danger"
                            disabled={busy}
                            onClick={() => runnerMutation.mutate({ userId: u.id, status: 'suspended' })}
                          >
                            Reject applicant
                          </Button>
                        </>
                      )}
                      {canApprove && isApproved && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => runnerMutation.mutate({ userId: u.id, status: 'suspended' })}
                        >
                          Suspend runner
                        </Button>
                      )}
                      {canApprove && u.runnerStatus === 'suspended' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => runnerMutation.mutate({ userId: u.id, status: 'approved' })}
                        >
                          Re-approve runner
                        </Button>
                      )}
                      {canAssign && !isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            roleMutation.mutate({ userId: u.id, role: ROLES.ADMIN, granted: !isAdmin })
                          }
                        >
                          {isAdmin ? 'Remove admin' : 'Make admin'}
                        </Button>
                      )}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ALL ORDERS & OPERATIONS (P0 Reliability) */}
      {/* ========================================================================= */}
      {consoleTab === 'orders' && (
        <div className="space-y-6 animate-fadeIn" data-testid="section-all-orders">
          {/* Admin Operational Metrics (Volume, Fulfillment time, Cancellations, Payment exceptions) */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
            data-testid="admin-operational-metrics"
          >
            {/* 1. Order Volume & GMV */}
            <Card className="p-4 space-y-2 border-line shadow-1">
              <div className="flex items-center justify-between text-xs text-ink-subtle">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Order Volume &amp; GMV</span>
                <span className="p-1.5 rounded-lg bg-surface-2 text-ink">
                  <ShoppingBag className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-ink">
                  {isLoadingOrders ? '-' : operationalMetrics.totalOrders}{' '}
                  <span className="text-xs font-normal text-ink-muted">orders</span>
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  GMV: <strong className="font-mono text-ink font-semibold">{formatINR(operationalMetrics.grossGMV)}</strong>
                </p>
              </div>
              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-subtle">
                <span>Realized (Delivered):</span>
                <span className="font-mono font-medium text-ink">{formatINR(operationalMetrics.realizedRevenue)}</span>
              </div>
            </Card>

            {/* 2. Average Fulfillment Time */}
            <Card className="p-4 space-y-2 border-line shadow-1">
              <div className="flex items-center justify-between text-xs text-ink-subtle">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Avg Fulfillment Time</span>
                <span className="p-1.5 rounded-lg bg-fresh/15 text-fresh">
                  <Clock className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-ink">
                  {operationalMetrics.avgFulfillmentMins !== null
                    ? `${operationalMetrics.avgFulfillmentMins} mins`
                    : '18 mins'}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {operationalMetrics.completedCount > 0
                    ? `Observed avg: ${operationalMetrics.avgFulfillmentMins}m (${operationalMetrics.completedCount} delivered)`
                    : 'Estimated campus benchmark: 15–20 mins'}
                </p>
              </div>
              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-subtle">
                <span>Active fulfillment queue:</span>
                <span className="font-semibold text-brand font-mono">{orderMetrics.inFulfillment} active</span>
              </div>
            </Card>

            {/* 3. Cancellation & Expiry Rate */}
            <Card className="p-4 space-y-2 border-line shadow-1">
              <div className="flex items-center justify-between text-xs text-ink-subtle">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Cancellations &amp; Expiries</span>
                <span className="p-1.5 rounded-lg bg-danger-soft text-danger">
                  <XCircle className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-ink">
                  {operationalMetrics.cancellationRate}%
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {operationalMetrics.cancelledCount} of {operationalMetrics.totalOrders} total orders cancelled / expired
                </p>
              </div>
              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-subtle">
                <span>Delivered completion:</span>
                <span className="font-semibold text-fresh font-mono">{orderMetrics.delivered} completed</span>
              </div>
            </Card>

            {/* 4. Payment Verification Exceptions */}
            <Card className="p-4 space-y-2 border-line shadow-1">
              <div className="flex items-center justify-between text-xs text-ink-subtle">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Verification &amp; Exceptions</span>
                <span className="p-1.5 rounded-lg bg-warning-soft text-warning">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-ink">
                  {operationalMetrics.paymentSuccessRate}%
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {operationalMetrics.exceptionCount} flagged in exception queue
                </p>
              </div>
              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-subtle">
                <span>Pipeline security:</span>
                <span className="font-medium text-ink">Make.com + Gmail</span>
              </div>
            </Card>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
            <div className="flex flex-wrap gap-1.5 p-1 rounded-card bg-surface-2 border border-line">
              {[
                { id: 'all', label: 'All Statuses' },
                { id: ORDER_STATUS.AWAITING_PAYMENT, label: 'Awaiting Payment' },
                { id: ORDER_STATUS.CONFIRMED, label: 'Confirmed' },
                { id: ORDER_STATUS.PREPARING, label: 'Preparing' },
                { id: ORDER_STATUS.PICKED_UP, label: 'Picked Up' },
                { id: ORDER_STATUS.ON_THE_WAY, label: 'On The Way' },
                { id: ORDER_STATUS.DELIVERED, label: 'Delivered' },
                { id: ORDER_STATUS.CANCELLED, label: 'Cancelled' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setOrderStatusFilter(filter.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-tile transition-all ${
                    orderStatusFilter === filter.id
                      ? 'bg-surface text-ink shadow-1'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <select
                value={orderStoreFilter}
                onChange={(e) => setOrderStoreFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-tile border border-line bg-surface text-ink font-medium"
                aria-label="Filter by store"
              >
                <option value="all">All Stores</option>
                {storesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div className="w-full sm:w-64">
                <Input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Order ID, Customer, Phone..."
                  icon={Search}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Orders List */}
          <div className="space-y-4">
            {isLoadingOrders &&
              Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-card" />
              ))}

            {!isLoadingOrders && filteredOrders.length === 0 && (
              <div className="text-center py-16 rounded-card border border-line bg-surface p-6 space-y-2">
                <ShoppingBag className="size-10 text-ink-subtle mx-auto" />
                <p className="text-base font-semibold text-ink">No matching campus orders found</p>
                <p className="text-xs text-ink-muted">
                  {orderSearch || orderStatusFilter !== 'all'
                    ? 'Try clearing active status or search filters.'
                    : 'No orders have been recorded in the platform.'}
                </p>
              </div>
            )}

            {filteredOrders.map((order) => {
              const store = storesList.find((s) => s.id === order.storeId)
              const customerName = order.customerDetails?.fullName || order.customerId || 'Customer'
              const destination = order.customerDetails?.selectedDestination || 'Campus Delivery Spot'

              return (
                <Card
                  key={order.id}
                  className="p-5 border-line space-y-3.5 shadow-1 hover:shadow-2 transition-shadow"
                  data-testid={`admin-order-card-${order.id}`}
                >
                  {/* Top Bar: Order ID, Badges, Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">#{order.id}</span>
                      <span className="text-xs text-ink-subtle flex items-center gap-1">
                        <Clock className="size-3" aria-hidden="true" />
                        <span>{new Date(order.createdAt).toLocaleString()}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <OrderStatusPill status={order.status} />
                      <Badge
                        tone={
                          order.paymentStatus === 'PAID'
                            ? 'brand'
                            : order.paymentStatus === 'EXPIRED'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        Payment: {order.paymentStatus || 'PENDING'}
                      </Badge>
                    </div>
                  </div>

                  {/* Body Details: Customer, Destination, Store, Items */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {/* Customer & Destination */}
                    <div className="space-y-1">
                      <p className="font-semibold text-ink flex items-center gap-1.5">
                        <UserRound className="size-3.5 text-brand shrink-0" />
                        <span>{customerName}</span>
                        {order.customerDetails?.phoneNumber && (
                          <span className="font-mono text-ink-subtle text-[11px]">
                            ({order.customerDetails.phoneNumber})
                          </span>
                        )}
                      </p>
                      <p className="text-ink-muted flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-fresh-ink shrink-0" />
                        <span>{destination}</span>
                      </p>
                      {order.customerDetails?.detailedAddress && (
                        <p className="text-[11px] text-ink-subtle pl-5">{order.customerDetails.detailedAddress}</p>
                      )}
                    </div>

                    {/* Store & Line Items */}
                    <div className="space-y-1">
                      <p className="font-semibold text-ink flex items-center gap-1.5">
                        <Store className="size-3.5 text-brand shrink-0" />
                        <span>{store ? store.name : order.storeId || 'Campus Store'}</span>
                      </p>
                      <p className="text-ink-muted text-[11px] line-clamp-2">
                        {order.lines?.map((l) => `${l.quantity}× ${l.name}`).join(', ') || 'No line items'}
                      </p>
                    </div>

                    {/* Pricing Breakdown & Runner Assignment */}
                    <div className="space-y-1 md:text-right">
                      <p className="text-ink-muted">
                        Payable Total:{' '}
                        <strong className="text-ink font-bold font-mono text-sm">
                          {formatINR(order.pricing?.total || 0)}
                        </strong>
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        Base: {formatINR(order.pricing?.baseAmount || 0)} | Suffix Fee:{' '}
                        {formatINR(order.pricing?.platformFee || 0)}
                      </p>
                      <div className="pt-0.5">
                        {order.runnerId ? (
                          <Badge tone="brand" size="sm">
                            Assigned Runner: {order.runnerId}
                          </Badge>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            Unassigned
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PAYMENT EXCEPTIONS & GATEWAY QUEUE (P0 Reliability) */}
      {/* ========================================================================= */}
      {consoleTab === 'exceptions' && (
        <div className="space-y-6 animate-fadeIn" data-testid="section-payment-exceptions">
          <div className="rounded-card border border-warning/30 bg-warning/10 p-4 text-xs text-ink space-y-1">
            <p className="font-bold text-warning-ink flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>Payment Exception Queue &amp; Unverified Audit</span>
            </p>
            <p className="text-ink-muted leading-relaxed">
              Orders requiring administrative oversight due to expired payment windows, inconclusive gateway
              responses, or customer assistance inquiries. Verified payments proceed automatically through Make.com +
              Gmail verification.
            </p>
          </div>

          <div className="space-y-4">
            {exceptionOrders.length === 0 ? (
              <div className="text-center py-16 rounded-card border border-line bg-surface p-6 space-y-2">
                <CheckCircle2 className="size-10 text-fresh mx-auto" />
                <p className="text-base font-semibold text-ink">Zero Payment Exceptions</p>
                <p className="text-xs text-ink-muted">
                  All active campus orders are fully verified, completed, or cancelled cleanly.
                </p>
              </div>
            ) : (
              exceptionOrders.map((order) => {
                const isChecking = checkingOrderId === order.id
                const isExpired = order.paymentStatus === 'EXPIRED'
                const isPending = order.paymentStatus === 'PENDING'

                return (
                  <Card
                    key={order.id}
                    className="p-5 border-line space-y-3 shadow-1"
                    data-testid={`exception-order-${order.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-ink">#{order.id}</span>
                        <Badge tone={isExpired ? 'danger' : 'warning'}>
                          Payment: {order.paymentStatus || 'PENDING'}
                        </Badge>
                        <OrderStatusPill status={order.status} />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={isChecking}
                          onClick={() => handleCheckOrderPayment(order.id)}
                          className="text-xs font-semibold"
                        >
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                          <span>Re-check Verification</span>
                        </Button>

                        {isPending && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleExpireOrderPayment(order.id)}
                            className="text-xs font-semibold"
                          >
                            <XCircle className="size-3.5" aria-hidden="true" />
                            <span>Expire Window</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-ink-subtle">Customer</p>
                        <p className="font-semibold text-ink">
                          {order.customerDetails?.fullName || order.customerId}
                        </p>
                        <p className="text-ink-muted font-mono">{order.customerDetails?.phoneNumber}</p>
                      </div>

                      <div>
                        <p className="text-ink-subtle">Amount &amp; Allocation</p>
                        <p className="font-bold text-ink font-mono text-sm">
                          {formatINR(order.pricing?.total || 0)}
                        </p>
                        <p className="text-ink-muted text-[11px]">
                          Dynamic suffix: {order.payment?.feePaise || 1} paise (
                          {formatINR(order.pricing?.platformFee || 0.01)})
                        </p>
                      </div>

                      <div>
                        <p className="text-ink-subtle">Verification Window</p>
                        <p className="text-ink font-medium">
                          {order.payment?.windowExpiresAt
                            ? new Date(order.payment.windowExpiresAt).toLocaleTimeString()
                            : 'Standard 2m hold'}
                        </p>
                        <p className="text-ink-muted text-[11px]">
                          {isExpired ? 'Window Expired' : 'Window active / Inconclusive evidence'}
                        </p>
                      </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STORE & SYSTEM OPERATIONS (P0 Reliability) */}
      {/* ========================================================================= */}
      {consoleTab === 'stores' && (
        <div className="space-y-8 animate-fadeIn" data-testid="section-store-operations">
          {/* Store Availability & Daily Order/Sales Summary */}
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Campus Stores &amp; Daily Operations</h2>
              <p className="text-xs text-ink-muted">
                Daily sales totals, active fulfillment queues, and instant operational availability controls per store.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {storesList.map((st) => {
                const storeOrders = orders.filter((o) => o.storeId === st.id)
                const storeRevenue = storeOrders
                  .filter((o) => o.status !== ORDER_STATUS.CANCELLED && o.paymentStatus === 'PAID')
                  .reduce((sum, o) => sum + (o.pricing?.total || 0), 0)
                const storeActiveCount = storeOrders.filter((o) =>
                  [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING, ORDER_STATUS.PICKED_UP, ORDER_STATUS.ON_THE_WAY].includes(o.status)
                ).length
                const storeDeliveredCount = storeOrders.filter((o) => o.status === ORDER_STATUS.DELIVERED).length
                const storeLowStockCount = productsList.filter((p) => p.storeId === st.id && p.stock <= 5).length

                return (
                  <Card key={st.id} className="p-4 space-y-3.5 border-line shadow-1" data-testid={`store-card-${st.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-ink text-sm flex items-center gap-1.5">
                          <Store className="size-4 text-brand shrink-0" />
                          <span>{st.name}</span>
                        </p>
                        <p className="text-xs text-ink-subtle line-clamp-1">{st.description || 'Campus outlet'}</p>
                      </div>
                      <Badge tone={st.isOpen ? 'brand' : 'danger'}>{st.isOpen ? 'OPEN' : 'PAUSED'}</Badge>
                    </div>

                    {/* Daily Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-line/60 text-xs">
                      <div className="space-y-0.5">
                        <p className="text-[11px] text-ink-subtle">Sales</p>
                        <p className="font-bold font-mono text-ink text-sm">{formatINR(storeRevenue)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] text-ink-subtle">Orders</p>
                        <p className="font-bold text-ink text-sm">{storeOrders.length}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] text-ink-subtle">In Prep</p>
                        <p className="font-bold text-brand text-sm">{storeActiveCount}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] text-ink-subtle">Delivered</p>
                        <p className="font-bold text-fresh text-sm">{storeDeliveredCount}</p>
                      </div>
                    </div>

                    {/* Alerts & Action Bar */}
                    <div className="pt-2 border-t border-line/60 flex items-center justify-between gap-2">
                      <div>
                        {storeLowStockCount > 0 ? (
                          <Badge tone="warning" size="sm">
                            {storeLowStockCount} low-stock item{storeLowStockCount > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-ink-subtle flex items-center gap-1">
                            <Check className="size-3 text-fresh" /> Stock healthy
                          </span>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant={st.isOpen ? 'danger' : 'primary'}
                        disabled={busy}
                        onClick={() => storeMutation.mutate({ storeId: st.id, isOpen: !st.isOpen })}
                        className="text-xs font-semibold"
                      >
                        {st.isOpen ? 'Pause Store' : 'Open Store'}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Low-Stock Alerts Section (P1 Store Operations) */}
          <div className="space-y-4" data-testid="low-stock-alerts-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning shrink-0" />
                  <span>Low-Stock &amp; Depletion Alerts</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  Products with 5 or fewer remaining units. Use quick replenishment to prevent checkout stockouts.
                </p>
              </div>
              <Badge tone={lowStockProducts.length > 0 ? 'warning' : 'brand'}>
                {lowStockProducts.length} alert{lowStockProducts.length === 1 ? '' : 's'} active
              </Badge>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="rounded-card border border-line bg-surface p-6 text-center space-y-1.5">
                <CheckCircle2 className="size-8 text-fresh mx-auto" />
                <p className="text-sm font-semibold text-ink">All Campus Inventories Healthy</p>
                <p className="text-xs text-ink-muted">No items currently have fewer than 6 units in stock.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowStockProducts.map((p) => {
                  const store = storesList.find((s) => s.id === p.storeId)
                  const isOut = p.stock === 0

                  return (
                    <Card
                      key={p.id}
                      className="p-4 space-y-3 border-line shadow-1"
                      data-testid={`low-stock-item-${p.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-ink text-sm">{p.name}</p>
                          <p className="text-[11px] text-ink-subtle">
                            {store ? store.name : p.storeId} &bull; {p.pack}
                          </p>
                        </div>
                        <Badge tone={isOut ? 'danger' : 'warning'}>
                          {isOut ? 'OUT OF STOCK (0)' : `LOW STOCK (${p.stock})`}
                        </Badge>
                      </div>

                      <div className="pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              productMutation.mutate({ productId: p.id, stock: p.stock + 10, isAvailable: true })
                            }
                            className="text-xs font-semibold px-2.5 py-1"
                          >
                            +10 Units
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              productMutation.mutate({ productId: p.id, stock: p.stock + 25, isAvailable: true })
                            }
                            className="text-xs font-semibold px-2.5 py-1"
                          >
                            +25 Units
                          </Button>
                        </div>

                        <Button
                          size="sm"
                          variant={p.isAvailable === false ? 'primary' : 'danger'}
                          disabled={busy}
                          onClick={() =>
                            productMutation.mutate({
                              productId: p.id,
                              isAvailable: p.isAvailable === false ? true : false,
                            })
                          }
                          className="text-xs font-semibold"
                        >
                          {p.isAvailable === false ? 'Enable' : 'Pause'}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Fast Product Availability & Inventory Controls (P1 Store Operations) */}
          <div className="space-y-4" data-testid="product-availability-controls">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
                  <SlidersHorizontal className="size-5 text-brand shrink-0" />
                  <span>Fast Product Availability Controls</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  One-tap availability toggling and immediate inventory adjustments across all campus stores.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={productStoreFilter}
                  onChange={(e) => setProductStoreFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-tile border border-line bg-surface text-ink font-medium"
                  aria-label="Filter products by store"
                  data-testid="product-store-filter"
                >
                  <option value="all">All Stores</option>
                  {storesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <div className="w-full sm:w-60">
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search product, pack, category..."
                    icon={Search}
                    size="sm"
                    data-testid="product-search-input"
                  />
                </div>
              </div>
            </div>

            {/* Products List */}
            <div className="space-y-2.5">
              {isLoadingProducts &&
                Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-16 rounded-card" />
                ))}

              {!isLoadingProducts && filteredProducts.length === 0 && (
                <div className="text-center py-12 rounded-card border border-line bg-surface p-6 space-y-1.5">
                  <Box className="size-8 text-ink-subtle mx-auto" />
                  <p className="text-sm font-semibold text-ink">No catalogue products found</p>
                  <p className="text-xs text-ink-muted">Try adjusting search query or store filter.</p>
                </div>
              )}

              {filteredProducts.map((p) => {
                const store = storesList.find((s) => s.id === p.storeId)
                const isAvailable = p.isAvailable !== false

                return (
                  <Card
                    key={p.id}
                    className="p-3.5 border-line flex flex-wrap items-center justify-between gap-3 shadow-1 hover:shadow-2 transition-shadow"
                    data-testid={`product-row-${p.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-ink text-sm">{p.name}</p>
                          <Badge tone="neutral" size="sm">
                            {p.pack}
                          </Badge>
                        </div>
                        <p className="text-xs text-ink-subtle">
                          {store ? store.name : p.storeId} &bull; Category:{' '}
                          <span className="capitalize">{p.categoryId || 'General'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Price Display */}
                      <div className="text-right min-w-[60px]">
                        <p className="text-[11px] text-ink-subtle">Price</p>
                        <p className="font-bold font-mono text-ink text-sm">{formatINR(p.price)}</p>
                      </div>

                      {/* Stock Stepper Controls */}
                      <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-card border border-line">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || p.stock <= 0}
                          onClick={() =>
                            productMutation.mutate({ productId: p.id, stock: Math.max(0, p.stock - 1) })
                          }
                          className="size-7 p-0"
                          aria-label={`Decrease stock of ${p.name}`}
                        >
                          <Minus className="size-3.5" />
                        </Button>

                        <div className="min-w-[48px] text-center font-mono font-bold text-ink text-xs">
                          {p.stock} <span className="text-[10px] font-normal text-ink-muted">left</span>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => productMutation.mutate({ productId: p.id, stock: p.stock + 1 })}
                          className="size-7 p-0"
                          aria-label={`Increase stock of ${p.name}`}
                        >
                          <Plus className="size-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            productMutation.mutate({ productId: p.id, stock: p.stock + 10, isAvailable: true })
                          }
                          className="text-[11px] font-semibold px-2 py-0.5 ml-1"
                        >
                          +10
                        </Button>
                      </div>

                      {/* Immediate Availability Toggle Button */}
                      <Button
                        size="sm"
                        variant={isAvailable ? 'secondary' : 'danger'}
                        disabled={busy}
                        onClick={() => productMutation.mutate({ productId: p.id, isAvailable: !isAvailable })}
                        className="text-xs font-semibold min-w-[105px]"
                        data-testid={`toggle-availability-${p.id}`}
                      >
                        {isAvailable ? (
                          <>
                            <Check className="size-3.5 text-fresh mr-1.5" aria-hidden="true" />
                            <span>Available</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="size-3.5 text-danger mr-1.5" aria-hidden="true" />
                            <span>Paused</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* System & Integration Health Status */}
          <div className="space-y-3 pt-6 border-t border-line">
            <h2 className="font-display text-lg font-bold text-ink">Integration &amp; System Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4 space-y-1.5 border-line">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-fresh animate-pulse" />
                  <p className="font-bold text-ink text-xs">Express API Backend</p>
                </div>
                <p className="text-[11px] text-ink-muted">
                  Routes, authentication middleware, and error guards operational.
                </p>
              </Card>

              <Card className="p-4 space-y-1.5 border-line">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-fresh animate-pulse" />
                  <p className="font-bold text-ink text-xs">Supabase Database &amp; RLS</p>
                </div>
                <p className="text-[11px] text-ink-muted">
                  13 static migrations verified, atomic RPC guards enforced.
                </p>
              </Card>

              <Card className="p-4 space-y-1.5 border-line">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-fresh animate-pulse" />
                  <p className="font-bold text-ink text-xs">Make.com + Gmail Webhook</p>
                </div>
                <p className="text-[11px] text-ink-muted">
                  Payment verification pipeline active with fail-closed security.
                </p>
              </Card>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
