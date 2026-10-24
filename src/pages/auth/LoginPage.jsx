import { useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router'
import { AlertCircle, Bike, CheckCircle2, Mail, ShieldCheck, ShoppingBasket } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input, PasswordInput } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { env, isMockBackend } from '@/config/env'
import { homePathFor, hasPermission, PERMISSIONS, ROLES } from '@/utils/permissions'

/** Only allow same-site relative redirects (prevents open-redirects via ?next=). */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const demoLogin = useAuthStore((s) => s.demoLogin)
  const forgotPassword = useAuthStore((s) => s.forgotPassword)
  const hydrateProfile = useAuthStore((s) => s.hydrateProfile)
  const logout = useAuthStore((s) => s.logout)
  const configError = useAuthStore((s) => s.configError) || useAuthStore.getState().configError
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [hydrationError, setHydrationError] = useState(null)
  const [retryingHydration, setRetryingHydration] = useState(false)
  const [pendingDemo, setPendingDemo] = useState(null)

  // Mode selection and runner diagnostic modal state
  const [modeModalOpen, setModeModalOpen] = useState(false)
  const [modeModalUser, setModeModalUser] = useState(null)
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)
  const [diagnosticUser, setDiagnosticUser] = useState(null)

  const noticeMessage = location.state?.notice || params.get('notice')

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [forgotError, setForgotError] = useState(null)

  const handleOpenForgot = () => {
    setForgotEmail(email.trim())
    setForgotError(null)
    setForgotSuccess(false)
    setForgotOpen(true)
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    setForgotError(null)
    const clean = forgotEmail.trim()
    if (!clean) {
      setForgotError('Please enter your email address.')
      return
    }
    if (!clean.includes('@')) {
      setForgotError('Please enter a valid email address.')
      return
    }

    setForgotSubmitting(true)
    try {
      await forgotPassword(clean)
      setForgotSuccess(true)
      toast.success('Password recovery email sent!')
    } catch (err) {
      setForgotError(err.message || 'Failed to request password reset. Please try again.')
    } finally {
      setForgotSubmitting(false)
    }
  }

  const handlePostLoginRouting = (authenticatedUser) => {
    const canShop = hasPermission(authenticatedUser, PERMISSIONS.SHOP)
    const canDeliver = hasPermission(authenticatedUser, PERMISSIONS.RUNNER_DELIVER)
    const hasRunnerRole = authenticatedUser?.roles?.includes(ROLES.RUNNER)

    if (canShop && canDeliver) {
      // Dual-role approved: show mode-selection dialog
      setModeModalUser(authenticatedUser)
      setModeModalOpen(true)
      return
    }

    if (canDeliver && !canShop) {
      // Runner-only approved: route to /runner
      useAuthStore.getState().setActiveMode('runner')
      navigate(safeNext(params.get('next')) ?? '/runner', { replace: true })
      return
    }

    if (hasRunnerRole && authenticatedUser?.runnerStatus !== 'approved') {
      // Runner role assigned, but runnerStatus is not approved:
      // Show diagnostic status modal explaining why runner delivery access is not active.
      setDiagnosticUser(authenticatedUser)
      setDiagnosticOpen(true)
      return
    }

    // Customer-only or default role: preserve /app (or next)
    useAuthStore.getState().setActiveMode('customer')
    navigate(safeNext(params.get('next')) ?? homePathFor(authenticatedUser), { replace: true })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setHydrationError(null)

    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setFormError('Please enter your email address.')
      return
    }
    if (!password) {
      setFormError('Please enter your password.')
      return
    }

    setSubmitting(true)
    try {
      const user = await login(cleanEmail, password)
      toast.success(`Welcome back, ${user.name}!`)
      handlePostLoginRouting(user)
    } catch (err) {
      if (err.authStage === 'profile_hydration') {
        setHydrationError(err)
      } else {
        setFormError(err.message || 'Failed to log in. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetryHydration = async () => {
    setRetryingHydration(true)
    try {
      const user = await hydrateProfile()
      toast.success(`Welcome back, ${user.name}!`)
      setHydrationError(null)
      handlePostLoginRouting(user)
    } catch (err) {
      setHydrationError(err)
      toast.error(err.message || 'Retry failed. Server may still be waking up.')
    } finally {
      setRetryingHydration(false)
    }
  }

  const handleCancelHydration = async () => {
    await logout().catch(() => {})
    setHydrationError(null)
    setFormError(null)
  }

  const handleDemoSignIn = async (role) => {
    setPendingDemo(role)
    setFormError(null)
    setHydrationError(null)
    try {
      const user = await demoLogin(role)
      toast.success(`Signed in as ${user.name}`)
      handlePostLoginRouting(user)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setPendingDemo(null)
    }
  }

  const demoOptions = [
    { role: 'customer', icon: ShoppingBasket, title: 'Sample customer', body: 'Browse, order and track.' },
    { role: 'runner', icon: Bike, title: 'Sample runner (approved)', body: 'Accept and deliver orders.' },
    { role: 'super_admin', icon: ShieldCheck, title: 'Sample super admin', body: 'Approve runners and manage roles.' },
  ]

  const hasConfigError = Boolean(configError)
  const isMockMode = isMockBackend && !hasConfigError

  return (
    <section className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="flex items-center gap-2">
        <Badge tone={isMockMode ? 'outline' : 'success'} size="md">
          {isMockMode ? 'Demo Mock Mode' : 'Supabase Auth'}
        </Badge>
      </div>

      <h1 className="mt-4 font-display text-4xl font-bold tracking-display text-ink">Log in</h1>
      <p className="mt-2 text-ink-muted">
        {isMockMode
          ? 'Enter your account details or choose a sample campus persona below.'
          : 'Welcome back to MartIT. Log in to track orders and delivery.'}
      </p>

      {/* Confirmation notice (e.g. from password reset) */}
      {noticeMessage && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-card border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-800 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden="true" />
          <p className="font-medium">{noticeMessage}</p>
        </div>
      )}

      {/* Remote mode missing configuration alert */}
      {hasConfigError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
        >
          <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Authentication Configuration Required</p>
            <p className="mt-1 text-ink">{configError}</p>
          </div>
        </div>
      )}

      {/* Profile hydration error alert with safe retry path */}
      {hydrationError && (
        <div
          role="alert"
          className="mt-6 rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Authentication Succeeded, Backend Verification Pending
              </p>
              <p className="text-ink">
                {hydrationError.code === 'API_UNREACHABLE'
                  ? 'Your credentials were accepted by Supabase, but the MartIT backend server could not be reached. If hosted on Render free tier, the server takes 45-60s to wake from sleep. Please wait a moment and click Retry.'
                  : hydrationError.code === 'PROFILE_NOT_FOUND'
                  ? 'Your account was verified by Supabase, but no user profile was found in the database. Account may be uninitialized.'
                  : hydrationError.code === 'ROLE_NOT_FOUND'
                  ? 'Your account was verified by Supabase, but no roles are assigned in the database.'
                  : hydrationError.code === 'DATABASE_ERROR'
                  ? 'A database error occurred on the backend server while retrieving your profile.'
                  : hydrationError.message || 'Failed to verify user profile with backend server.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={retryingHydration}
                  onClick={handleRetryHydration}
                >
                  Retry verification
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelHydration}
                >
                  Sign out & reset
                </Button>
              </div>
            </div>
          </div>

          {/* Safe developer diagnostics (development only, never logs secrets/passwords/tokens) */}
          {import.meta.env.DEV && (
            <div className="mt-3 border-t border-amber-500/20 pt-2 text-xs text-ink-muted">
              <p className="font-semibold text-ink">Developer Diagnostics (DEV mode):</p>
              <p>Stage: {hydrationError.authStage || 'profile_hydration'}</p>
              <p>Code: {hydrationError.code || 'UNKNOWN'}</p>
              <p>Status: {hydrationError.status || hydrationError.statusCode || '0'}</p>
              {hydrationError.details?.url && <p>URL: {hydrationError.details.url}</p>}
            </div>
          )}
        </div>
      )}

      {/* Form Error alert (credential, validation, etc.) */}
      {formError && !hydrationError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger"
        >
          <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium text-danger">{formError}</p>
            {import.meta.env.DEV && (
              <p className="mt-1 text-xs text-ink-muted">
                Developer Diagnostics: Stage: supabase_auth
              </p>
            )}
          </div>
        </div>
      )}

      {/* Standard Email/Password Form */}
      <form onSubmit={handleSubmit} className="mt-8 grid gap-4" noValidate>
        <Field label="Email" error={undefined}>
          <Input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@campus.edu"
            icon={Mail}
            disabled={submitting}
          />
        </Field>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-sm font-medium text-ink">
              Password
            </label>
            <button
              type="button"
              onClick={handleOpenForgot}
              className="text-xs font-medium text-fresh-ink hover:underline focus:outline-none"
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={submitting}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={submitting}
          disabled={Boolean(hasConfigError)}
          className="mt-2"
        >
          Log in
        </Button>
      </form>

      {/* Mock Mode Quick-Select Cards */}
      {isMockMode && (
        <div className="mt-10 border-t border-line pt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Or test with sample accounts (mock mode)
          </p>
          <ul className="mt-4 grid gap-3">
            {demoOptions.map(({ role, icon: Icon, title, body }) => (
              <li key={role}>
                <Card
                  as="button"
                  type="button"
                  interactive
                  disabled={Boolean(pendingDemo || submitting)}
                  onClick={() => handleDemoSignIn(role)}
                  className="flex w-full items-center gap-4 p-3.5 text-left disabled:opacity-60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-tile bg-brand-soft text-fresh-ink">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold text-sm">{title}</span>
                    <span className="block text-xs text-ink-muted">{body}</span>
                  </span>
                  {pendingDemo === role && <Spinner />}
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-8 text-sm text-ink-muted">
        New to MartIT?{' '}
        <Link to="/signup" className="font-medium text-fresh-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>

      {/* Forgot Password Modal Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent
          title="Reset your password"
          description="Enter your registered campus email address and we'll send you instructions to recover access."
        >
          {forgotSuccess ? (
            <div className="space-y-4">
              <div
                role="status"
                className="flex items-start gap-3 rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300"
              >
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Check your email</p>
                  <p className="mt-1 text-ink">
                    If an account exists for <span className="font-medium">{forgotEmail}</span>, we have sent instructions to reset your password.
                  </p>
                  {isMockMode && (
                    <p className="mt-2 text-xs text-ink-muted">
                      (Demo mode: simulated password recovery dispatched)
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() => setForgotOpen(false)}
              >
                Back to log in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4" noValidate>
              {forgotError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/10 p-3 text-xs text-danger"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{forgotError}</span>
                </div>
              )}

              <Field label="Campus Email" error={undefined}>
                <Input
                  type="email"
                  name="forgotEmail"
                  autoComplete="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@campus.edu"
                  icon={Mail}
                  disabled={forgotSubmitting}
                  autoFocus
                />
              </Field>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForgotOpen(false)}
                  disabled={forgotSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={forgotSubmitting}
                  disabled={Boolean(hasConfigError)}
                >
                  Send recovery link
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Mode Selection Dialog for Dual-Role Approved Users */}
      <Dialog open={modeModalOpen} onOpenChange={setModeModalOpen}>
        <DialogContent
          title="Choose your mode"
          description="Your account is approved for both customer orders and runner deliveries. Choose where you would like to start:"
        >
          <div className="mt-4 grid gap-3">
            <Card
              as="button"
              type="button"
              id="mode-select-customer"
              interactive
              onClick={() => {
                useAuthStore.getState().setActiveMode('customer')
                setModeModalOpen(false)
                navigate(safeNext(params.get('next')) ?? '/app', { replace: true })
              }}
              className="flex w-full items-center gap-4 p-4 text-left transition-all hover:border-brand"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-tile bg-surface-2 text-ink">
                <ShoppingBasket className="size-6 text-brand" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-base text-ink">Customer Dashboard</span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  Browse campus food &amp; groceries, build carts, and place delivery orders
                </span>
              </span>
            </Card>

            <Card
              as="button"
              type="button"
              id="mode-select-runner"
              interactive
              onClick={() => {
                useAuthStore.getState().setActiveMode('runner')
                setModeModalOpen(false)
                navigate(safeNext(params.get('next')) ?? '/runner', { replace: true })
              }}
              className="flex w-full items-center gap-4 p-4 text-left transition-all hover:border-brand"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-tile bg-brand-soft text-fresh-ink">
                <Bike className="size-6 text-fresh-ink" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-base text-ink">Runner Dashboard</span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  Accept pending delivery requests, manage pickups, and deliver across campus
                </span>
              </span>
            </Card>
          </div>
          <p className="mt-4 text-center text-xs text-ink-subtle">
            You can switch between Customer Mode and Runner Mode anytime using the button in the header.
          </p>
        </DialogContent>
      </Dialog>

      {/* Diagnostic Dialog for Runner Role without Approved Status */}
      <Dialog open={diagnosticOpen} onOpenChange={setDiagnosticOpen}>
        <DialogContent
          title="Runner Account Status Notice"
          description="Your account has the runner role assigned, but runner delivery privileges are not yet active."
        >
          <div className="space-y-4">
            <div
              role="alert"
              id="login-runner-diagnostic-alert"
              className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                <div className="flex-1 space-y-1.5">
                  <p className="font-semibold">
                    {diagnosticUser?.runnerStatus === 'suspended'
                      ? 'Runner Privileges Suspended'
                      : diagnosticUser?.runnerStatus === 'applicant' || diagnosticUser?.runnerStatus === 'pending'
                      ? 'Runner Application Pending Review'
                      : 'Runner Approval Required'}
                  </p>
                  <p className="text-xs text-ink">
                    {diagnosticUser?.runnerStatus === 'suspended'
                      ? 'Your runner delivery privileges are currently suspended by platform administrators. You can continue shopping in Customer Mode.'
                      : diagnosticUser?.runnerStatus === 'applicant' || diagnosticUser?.runnerStatus === 'pending'
                      ? 'Your runner application is under review by campus administrators. Once approved, the Runner Dashboard will become available. In the meantime, you can use Customer Mode.'
                      : 'Your user profile in the database has role "runner", but runner_status is currently unapproved (null or not approved). An administrator must set runner_status = \'approved\' in the profiles table to activate delivery permissions.'}
                  </p>
                  <div className="mt-2 text-[11px] font-mono text-ink-muted">
                    Assigned Role: runner | Profile Status: {diagnosticUser?.runnerStatus ?? 'unapproved (null)'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="primary"
                id="diagnostic-continue-customer"
                onClick={() => {
                  setDiagnosticOpen(false)
                  useAuthStore.getState().setActiveMode('customer')
                  navigate(safeNext(params.get('next')) ?? '/app', { replace: true })
                }}
              >
                Continue to Customer Dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
