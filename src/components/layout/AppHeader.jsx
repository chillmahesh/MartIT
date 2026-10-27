import { Link, useNavigate } from 'react-router'
import { DropdownMenu } from 'radix-ui'
import { Bike, LogOut, MapPin, ShieldCheck, ShoppingBag, UserRound, FileText } from 'lucide-react'
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
  const user = useAuthStore((s) => s.user)
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
          {variant === 'customer' && (
            <DropdownMenu.Item asChild>
              <Link to="/app/profile" className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm outline-none data-[highlighted]:bg-surface-2">
                <UserRound className="size-4" aria-hidden="true" /> Profile
              </Link>
            </DropdownMenu.Item>
          )}
          {AREA_LINKS.filter((a) => a.variant !== variant && hasPermission(user, a.permission)).map(({ to, label, icon: Icon }) => (
            <DropdownMenu.Item key={to} asChild>
              <Link to={to} className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm outline-none data-[highlighted]:bg-surface-2">
                <Icon className="size-4" aria-hidden="true" /> {label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild>
            <Link to="/terms-and-conditions" className="flex h-9 items-center gap-2.5 rounded-tile px-3 text-xs text-ink-muted outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink">
              <FileText className="size-3.5" aria-hidden="true" /> Terms &amp; Privacy
            </Link>
          </DropdownMenu.Item>
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
