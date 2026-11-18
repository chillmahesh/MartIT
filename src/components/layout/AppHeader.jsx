import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { DropdownMenu } from 'radix-ui'
import {
  Bike,
  Bookmark,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  LogOut,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore, selectCartCount } from '@/stores/cartStore'
import { useActiveDestination } from '@/hooks/useLocations'
import { Dialog, DialogContent, DialogClose } from '@/components/ui/Dialog'
import { PRESET_CAMPUS_LOCATIONS, OTHER_LOCATION_VALUE } from '@/utils/checkoutValidation'
import { SAVED_LOCATION_STORAGE_KEY } from '@/components/cart/DeliveryDetailsForm'
import { cn } from '@/utils/cn'
import { ThemeToggle } from './ThemeToggle'
import { CountBadge } from './CountBadge'
import { hasPermission, PERMISSIONS, ROLE_LABEL, ROLES } from '@/utils/permissions'

/** Header for signed-in areas. `variant` = customer | runner | admin; non-customer variants hide shopping controls. */
export function AppHeader({ variant = 'customer' }) {
  const userFromHook = useAuthStore((s) => s.user)
  const user = userFromHook ?? useAuthStore.getState().user
  const cartCount = useCartStore(selectCartCount)
  const { displayLabel } = useActiveDestination()
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)
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
            <button
              type="button"
              id="header-deliver-to-btn"
              data-testid="header-deliver-to-btn"
              onClick={() => setIsLocationDialogOpen(true)}
              className="group flex items-center gap-1.5 rounded-tile px-2 py-1.5 -mx-1 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer"
              aria-label={`Delivery location: ${displayLabel || 'Choose a delivery spot'}. Click to change delivery location.`}
            >
              <MapPin className="size-4 shrink-0 text-fresh-ink" aria-hidden="true" />
              <span
                className="truncate max-w-[160px] sm:max-w-[240px] md:max-w-[320px] text-sm font-semibold text-ink group-hover:text-brand transition-colors"
                title={displayLabel || 'Choose a delivery spot'}
              >
                {displayLabel || 'Choose a delivery spot'}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-ink-subtle group-hover:text-ink transition-transform duration-150" aria-hidden="true" />
            </button>
          </div>
        )}

        {variant === 'customer' && (
          <nav aria-label="Customer navigation" className="hidden md:flex items-center gap-1.5 ml-2">
            <Link
              to="/app"
              id="header-nav-shop"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              <ShoppingBag className="size-3.5 text-ink-subtle" aria-hidden="true" />
              <span>Shop</span>
            </Link>
            <Link
              to="/app/orders"
              id="header-nav-orders"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              <ClipboardList className="size-3.5 text-ink-subtle" aria-hidden="true" />
              <span>My Orders</span>
            </Link>
          </nav>
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
      {variant === 'customer' && (
        <DeliveryLocationDialog
          open={isLocationDialogOpen}
          onOpenChange={setIsLocationDialogOpen}
        />
      )}
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
            <>
              <DropdownMenu.Item asChild>
                <Link
                  to="/app/orders"
                  id="menu-nav-orders"
                  className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm outline-none data-[highlighted]:bg-surface-2"
                >
                  <ClipboardList className="size-4" aria-hidden="true" /> My Orders
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link
                  to="/app/profile"
                  className="flex h-10 items-center gap-2.5 rounded-tile px-3 text-sm outline-none data-[highlighted]:bg-surface-2"
                >
                  <UserRound className="size-4" aria-hidden="true" /> Profile
                </Link>
              </DropdownMenu.Item>
            </>
          )}
          {AREA_LINKS.filter((a) => a.variant !== variant && hasPermission(user, a.permission) && !(isApprovedRunner && (a.variant === 'runner' || a.variant === 'customer'))).map(({ to, label, icon: Icon }) => (
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

function DeliveryLocationDialog({ open, onOpenChange }) {
  const checkoutDetails = useCartStore((s) => s.checkoutDetails)
  const setCheckoutDetails = useCartStore((s) => s.setCheckoutDetails)
  const clearActiveDestination = useCartStore((s) => s.clearActiveDestination)
  const user = useAuthStore((s) => s.user)

  const [customAddress, setCustomAddress] = useState(
    checkoutDetails?.presetLocation === OTHER_LOCATION_VALUE
      ? checkoutDetails?.customLocation || ''
      : '',
  )
  const [customInstructions, setCustomInstructions] = useState(
    checkoutDetails?.deliveryInstructions || '',
  )

  const savedLocation = useMemo(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(SAVED_LOCATION_STORAGE_KEY)
        if (!item) return null
        const parsed = JSON.parse(item)
        if (parsed.userId && user?.id && parsed.userId !== user.id) return null
        return parsed
      }
    } catch {}
    return null
  }, [user?.id, open])

  const handleSelectPreset = (preset) => {
    setCheckoutDetails({
      presetLocation: preset,
      customLocation: '',
      deliveryInstructions: customInstructions,
    })
    onOpenChange(false)
  }

  const handleApplyCustom = (e) => {
    e?.preventDefault()
    if (!customAddress.trim()) return
    setCheckoutDetails({
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: customAddress.trim(),
      deliveryInstructions: customInstructions.trim(),
    })
    onOpenChange(false)
  }

  const handleApplySaved = () => {
    if (!savedLocation) return
    setCheckoutDetails({
      presetLocation: savedLocation.presetLocation || '',
      customLocation: savedLocation.customLocation || '',
      deliveryInstructions: savedLocation.deliveryInstructions || '',
    })
    onOpenChange(false)
  }

  const handleClear = () => {
    clearActiveDestination()
    onOpenChange(false)
  }

  const currentPreset = checkoutDetails?.presetLocation

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Choose Delivery Location"
        description="Select your campus delivery spot or enter an address."
        className="max-w-md sm:max-w-lg"
      >
        {savedLocation && (
          <div
            data-testid="dialog-saved-location-banner"
            className="mb-4 flex items-center justify-between gap-3 rounded-tile border border-brand/30 bg-brand-soft/40 p-3 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Bookmark className="size-4 text-brand shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-ink leading-tight">Saved Default Address</p>
                <p className="truncate text-ink-muted mt-0.5">
                  {savedLocation.presetLocation === OTHER_LOCATION_VALUE
                    ? savedLocation.customLocation
                    : savedLocation.presetLocation}
                  {savedLocation.deliveryInstructions ? ` • ${savedLocation.deliveryInstructions}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="dialog-apply-saved-btn"
              onClick={handleApplySaved}
              className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white shadow-1 hover:bg-brand/90 transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              Preset Campus Spots
            </span>
            {checkoutDetails?.presetLocation && (
              <button
                type="button"
                data-testid="dialog-clear-location-btn"
                onClick={handleClear}
                className="text-xs font-medium text-danger hover:underline cursor-pointer"
              >
                Clear selection
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PRESET_CAMPUS_LOCATIONS.map((preset) => {
              const isSelected = currentPreset === preset
              return (
                <button
                  key={preset}
                  type="button"
                  data-testid={`dialog-preset-${preset.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-tile border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer',
                    isSelected
                      ? 'border-brand bg-brand-soft text-brand-ink font-semibold shadow-1'
                      : 'border-line bg-surface hover:bg-surface-2 text-ink',
                  )}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="size-3.5 text-fresh-ink shrink-0" aria-hidden="true" />
                    <span className="truncate">{preset}</span>
                  </span>
                  {isSelected && <Check className="size-3.5 text-fresh-ink shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleApplyCustom} className="mt-4 space-y-3 border-t border-line/60 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle block">
            Or Custom Destination
          </span>
          <div className="space-y-2">
            <input
              type="text"
              data-testid="dialog-custom-location-input"
              placeholder="e.g. Science Block, Old Workshop"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              maxLength={200}
              className="w-full rounded-tile border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <input
              type="text"
              data-testid="dialog-custom-instructions-input"
              placeholder="Room, floor, or nearby landmark (optional)"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              maxLength={500}
              className="w-full rounded-tile border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-tile border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              data-testid="dialog-apply-custom-btn"
              disabled={!customAddress.trim()}
              className="rounded-tile bg-brand px-3.5 py-1.5 text-xs font-bold text-white shadow-1 hover:bg-brand/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Set Custom Address
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
