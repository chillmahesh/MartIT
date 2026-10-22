import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike, Search, ShieldCheck, ShoppingBag, UserRound, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toaster'
import { adminService } from '@/services/adminService'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission, PERMISSIONS, ROLE_LABEL, ROLES } from '@/utils/permissions'

const RUNNER_TONE = { pending: 'warning', applicant: 'warning', approved: 'brand', suspended: 'danger' }


/**
 * Admin Console: People, Roles, and Runner Authorizations.
 * Buttons are conditionally rendered by permission and strictly re-authorized on the server.
 */
export default function AdminConsolePage() {
  const me = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const { data: users, isLoading, error } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminService.listUsers })

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const onDone = (msg) => (updated) => {
    qc.setQueryData(['admin', 'users'], (list) => list?.map((u) => (u.id === updated.id ? updated : u)))
    toast.success(msg(updated))
  }
  const onError = (e) => toast.error(e.message)

  const runnerMutation = useMutation({
    mutationFn: ({ userId, status }) => adminService.setRunnerStatus(userId, status),
    onSuccess: onDone((u) => `${u.name}: runner ${u.runnerStatus}`),
    onError,
  })
  const roleMutation = useMutation({
    mutationFn: ({ userId, role, granted }) => adminService.setRole(userId, role, granted),
    onSuccess: onDone((u) => `${u.name}: roles updated`),
    onError,
  })

  const canApprove = hasPermission(me, PERMISSIONS.RUNNERS_APPROVE)
  const canAssign = hasPermission(me, PERMISSIONS.ROLES_ASSIGN)
  const busy = runnerMutation.isPending || roleMutation.isPending

  // Derived real metrics from actual query response
  const metrics = useMemo(() => {
    const list = users || []
    const totalUsers = list.length
    const applicants = list.filter((u) => u.runnerStatus === 'applicant' || u.runnerStatus === 'pending').length
    const activeRunners = list.filter((u) => u.runnerStatus === 'approved').length
    const admins = list.filter((u) => u.roles.includes(ROLES.ADMIN) || u.roles.includes(ROLES.SUPER_ADMIN)).length
    return { totalUsers, applicants, activeRunners, admins }
  }, [users])

  // Filtered users
  const filteredUsers = useMemo(() => {
    let list = users || []

    // Search query
    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query)
      )
    }

    // Role tabs
    if (activeTab === 'applicants') {
      list = list.filter((u) => u.runnerStatus === 'applicant' || u.runnerStatus === 'pending')
    } else if (activeTab === 'runners') {
      list = list.filter((u) => u.runnerStatus === 'approved')
    } else if (activeTab === 'admins') {
      list = list.filter((u) => u.roles.includes(ROLES.ADMIN) || u.roles.includes(ROLES.SUPER_ADMIN))
    } else if (activeTab === 'customers') {
      list = list.filter((u) => !u.roles.includes(ROLES.ADMIN) && !u.roles.includes(ROLES.SUPER_ADMIN) && u.runnerStatus !== 'approved')
    }

    return list
  }, [users, search, activeTab])

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="info" size="md">Administrator Portal</Badge>
            <span className="text-xs text-ink-subtle">Authorized Session</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-display text-ink">People &amp; Roles</h1>
          <p className="mt-1 max-w-xl text-ink-muted">
            Manage user roles, verify runner applications, and oversee platform access.
          </p>
        </div>
      </div>

      {/* Real Statistics Overview */}
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-muted shrink-0">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Total Users</p>
            <p className="text-2xl font-bold font-display text-ink">{isLoading ? '-' : metrics.totalUsers}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning shrink-0">
            <Bike className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Runner Applicants</p>
            <p className="text-2xl font-bold font-display text-ink">{isLoading ? '-' : metrics.applicants}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand shrink-0">
            <Bike className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Active Runners</p>
            <p className="text-2xl font-bold font-display text-ink">{isLoading ? '-' : metrics.activeRunners}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-info-soft text-info shrink-0">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-semibold">Admins</p>
            <p className="text-2xl font-bold font-display text-ink">{isLoading ? '-' : metrics.admins}</p>
          </div>
        </Card>
      </div>

      {error && <p className="mt-6 rounded-tile bg-danger-soft p-3 text-sm font-medium text-danger">{error.message}</p>}

      {/* Filter and Search Bar */}
      <div className="mt-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap gap-1.5 p-1 rounded-card bg-surface-2 border border-line">
          {[
            { id: 'all', label: `All (${metrics.totalUsers})` },
            { id: 'applicants', label: `Applicants (${metrics.applicants})` },
            { id: 'runners', label: `Runners (${metrics.activeRunners})` },
            { id: 'admins', label: `Admins (${metrics.admins})` },
            { id: 'customers', label: 'Customers' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-tile transition-all ${
                activeTab === tab.id
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
      <ul className="mt-6 grid gap-3" aria-busy={isLoading || busy}>
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-24 rounded-card" />
            </li>
          ))}

        {!isLoading && filteredUsers.length === 0 && (
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
          const isAdmin = u.roles.includes(ROLES.ADMIN)
          const isSuperAdmin = u.roles.includes(ROLES.SUPER_ADMIN)
          const isApplicant = u.runnerStatus === 'applicant' || u.runnerStatus === 'pending'
          const isApproved = u.runnerStatus === 'approved'

          return (
            <li key={u.id}>
              <Card className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
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
                      {u.roles.map((r) => (
                        <Badge key={r} tone={r === ROLES.SUPER_ADMIN ? 'info' : r === ROLES.ADMIN ? 'brand' : 'neutral'}>
                          {ROLE_LABEL[r]}
                        </Badge>
                      ))}
                      {u.runnerStatus && (
                        <Badge tone={RUNNER_TONE[u.runnerStatus]}>
                          Runner: {u.runnerStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  {canApprove && isApplicant && (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      onClick={() => runnerMutation.mutate({ userId: u.id, status: 'approved' })}
                    >
                      Approve runner
                    </Button>
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
                  {canAssign && !isSuperAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => roleMutation.mutate({ userId: u.id, role: ROLES.ADMIN, granted: !isAdmin })}
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
    </section>
  )
}
