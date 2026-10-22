import { Link, useNavigate } from 'react-router'
import { DropdownMenu } from 'radix-ui'
import { Bike, LogOut, MapPin, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore, selectCartCount } from '@/stores/cartStore'
import { useLocationName } from '@/hooks/useLocations'
import { ThemeToggle } from './ThemeToggle'
import { CountBadge } from './CountBadge'
import { hasPermission, PERMISSIONS, ROLE_LABEL, ROLES } from '@/utils/permissions'

/** Header for signed-in areas. `variant` = customer | runner | admin; non-customer variants hide shopping controls. */
export function AppHeader({ variant = 'customer' }) {
  const userFromHook = useAuthStore((s) => s.user)
  const user = userFromHook ?? useAuthStore.getState().user
  const cartCount = useCartStore(selectCartCount)
  const locationName = useLocationName(user?.defaultLocationId)
  const home = { customer: '/app', runner: '/runner', admin: '/admin' }[variant]

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
        <Link to={home} aria-label="MartIT home" className="shrink-0 rounded-tile">
          <Logo size="sm" className="sm:hidden" markOnly />
          <Logo className="hidden sm:inline-flex" />
        </Link>

        {variant === 'runner' ? (
          <Badge tone="brand" size="md">Runner</Badge>
        ) : variant === 'admin' ? (
          <Badge tone="info" size="md">
            {ROLE_LABEL[user?.roles.includes(ROLES.SUPER_ADMIN) ? ROLES.SUPER_ADMIN : ROLES.ADMIN]}
          </Badge>
        ) : (
          <div className="min-w-0 flex-1 sm:flex-none">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">Deliver to</p>
            <p className="flex items-center gap-1 truncate text-sm font-semibold">
              <MapPin className="size-3.5 shrink-0 text-fresh-ink" aria-hidden="true" />
              <span className="truncate">{locationName ?? 'Choose a delivery spot'}</span>
            </p>
          </div>
        )}

        {/* Mode switcher or runner status in header bar */}
        {hasPermission(user, PERMISSIONS.RUNNER_DELIVER) ? (
          variant === 'customer' ? (
            <Link
              to="/runner"
              id="header-mode-switch-runner"
              onClick={() => useAuthStore.getState().setActiveMode('runner')}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft/80 px-2.5 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold text-fresh-ink transition-colors hover:bg-brand-soft shrink-0"
              aria-label="Switch to Runner mode"
            >
              <Bike className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="inline sm:hidden">Runner</span>
              <span className="hidden sm:inline">Runner Mode</span>
            </Link>
          ) : (
            <Link
              to="/app"
              id="header-mode-switch-customer"
              onClick={() => useAuthStore.getState().setActiveMode('customer')}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold text-ink transition-colors hover:bg-surface-3 shrink-0"
              aria-label="Switch to Customer mode"
            >
              <ShoppingBag className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="inline sm:hidden">Customer</span>
              <span className="hidden sm:inline">Customer Mode</span>
            </Link>
          )
        ) : (user?.runnerStatus === 'applicant' || user?.runnerStatus === 'pending') ? (
          <div
            id="header-runner-pending-badge"
            className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] sm:px-2.5 sm:py-1 sm:text-xs font-medium text-warning-ink shrink-0"
            title="Runner application pending review"
          >
            <Bike className="size-3 text-warning shrink-0" aria-hidden="true" />
            <span className="inline sm:hidden">App pending</span>
            <span className="hidden sm:inline">Runner application pending</span>
          </div>
        ) : user?.runnerStatus === 'suspended' ? (
          <div
            id="header-runner-suspended-badge"
            className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] sm:px-2.5 sm:py-1 sm:text-xs font-medium text-danger shrink-0"
            title="Runner privileges suspended"
          >
            <Bike className="size-3 text-danger shrink-0" aria-hidden="true" />
            <span className="inline sm:hidden">Suspended</span>
            <span className="hidden sm:inline">Runner suspended</span>
          </div>
        ) : user?.roles?.includes(ROLES.RUNNER) && user?.runnerStatus !== 'approved' ? (
          <div
            id="header-runner-unapproved-badge"
            className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] sm:px-2.5 sm:py-1 sm:text-xs font-medium text-warning-ink shrink-0"
            title="Runner role assigned but profile runner_status is not approved"
          >
            <Bike className="size-3 text-warning shrink-0" aria-hidden="true" />
            <span className="inline sm:hidden">Unapproved</span>
            <span className="hidden sm:inline">Runner unapproved</span>
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {variant === 'customer' && (
            <Link
              to="/app/cart"
              className="relative hidden size-10 place-items-center rounded-full transition-colors hover:bg-surface-2 md:grid"
              aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
            >
              <ShoppingBag className="size-[19px]" aria-hidden="true" />
              <CountBadge count={cartCount} className="absolute -right-0.5 -top-0.5" />
            </Link>
          )}
          <AccountMenu user={user} variant={variant} />
        </div>
      </div>
    </header>
  )
}

const AREA_LINKS = [
  { variant: 'customer', to: '/app', label: 'Shop', icon: ShoppingBag, permission: PERMISSIONS.SHOP },
  { variant: 'runner', to: '/runner', label: 'Runner mode', icon: Bike, permission: PERMISSIONS.RUNNER_DELIVER },
  { variant: 'admin', to: '/admin', label: 'Admin console', icon: ShieldCheck, permission: PERMISSIONS.ADMIN_ACCESS },
]

function AccountMenu({ user, variant }) {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const initial = user?.name?.[0]?.toUpperCase() ?? '?'

  const isApprovedRunner = hasPermission(user, PERMISSIONS.RUNNER_DELIVER)
  const isApplicant = user?.runnerStatus === 'applicant' || user?.runnerStatus === 'pending'
  const isSuspended = user?.runnerStatus === 'suspended'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="grid size-10 place-items-center rounded-full bg-brand-soft font-display text-sm font-bold text-fresh-ink transition-transform active:scale-95"
        aria-label="Account menu"
      >
        {initial}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-card border border-line bg-surface p-1.5 shadow-2 data-[state=open]:animate-fade-in"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-semibold">{user?.name}</p>
            <p className="text-[13px] text-ink-subtle">{user?.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          {/* Mode Switcher in Account Menu for Dual-Role Users */}
          {isApprovedRunner && (
            variant === 'customer' ? (
              <DropdownMenu.Item asChild>
                <Link
                  to="/runner"
                  id="menu-mode-switch-runner"
                  className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm font-medium text-fresh-ink bg-brand-soft/30 outline-none data-[highlighted]:bg-brand-soft/60 mb-1"
                >
                  <Bike className="size-4" aria-hidden="true" /> Switch to Runner Mode
                </Link>
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item asChild>
                <Link
                  to="/app"
                  id="menu-mode-switch-customer"
                  className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm font-medium text-ink bg-surface-2 outline-none data-[highlighted]:bg-surface-3 mb-1"
                >
                  <ShoppingBag className="size-4" aria-hidden="true" /> Switch to Customer Mode
                </Link>
              </DropdownMenu.Item>
            )
          )}

          {/* Applicant & Suspended runner status notices in menu */}
          {isApplicant && (
            <div
              id="menu-runner-pending-status"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-warning-ink bg-warning/10 rounded-tile mx-1 mb-1"
            >
              <Bike className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span>Runner application pending</span>
            </div>
          )}
          {isSuspended && (
            <div
              id="menu-runner-suspended-status"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-danger bg-danger/10 rounded-tile mx-1 mb-1"
            >
              <Bike className="size-3.5 shrink-0 text-danger" aria-hidden="true" />
              <span>Runner privileges suspended</span>
            </div>
          )}
          {user?.roles?.includes(ROLES.RUNNER) && !isApprovedRunner && !isApplicant && !isSuspended && (
            <div
              id="menu-runner-unapproved-status"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-warning-ink bg-warning/10 rounded-tile mx-1 mb-1"
            >
              <Bike className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span>Runner unapproved (status missing)</span>
            </div>
          )}

          {variant === 'customer' && (
            <DropdownMenu.Item asChild>
              <Link to="/app/profile" className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm outline-none data-[highlighted]:bg-surface-2">
                <UserRound className="size-4" aria-hidden="true" /> Profile
              </Link>
            </DropdownMenu.Item>
          )}
          {AREA_LINKS.filter((a) => a.variant !== variant && hasPermission(user, a.permission) && !(isApprovedRunner && (a.variant === 'runner' || a.variant === 'customer'))).map(({ to, label, icon: Icon }) => (
            <DropdownMenu.Item key={to} asChild>
              <Link to={to} className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm outline-none data-[highlighted]:bg-surface-2">
                <Icon className="size-4" aria-hidden="true" /> {label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item
            onSelect={async () => {
              await logout()
              navigate('/', { replace: true })
            }}
            className="flex h-10 cursor-pointer items-center gap-2.5 rounded-tile px-3 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
