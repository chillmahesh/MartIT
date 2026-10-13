import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Bike, CheckCircle2, Mail, Lock, ShieldCheck, ShoppingBasket } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Input, PasswordInput } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { isMockBackend } from '@/config/env'
import { homePathFor } from '@/utils/permissions'

/** Only allow same-site relative redirects (prevents open-redirects via ?next=). */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const demoLogin = useAuthStore((s) => s.demoLogin)
  const forgotPassword = useAuthStore((s) => s.forgotPassword)
  const configError = useAuthStore((s) => s.configError) || useAuthStore.getState().configError
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDemo, setPendingDemo] = useState(null)

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

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
      navigate(safeNext(params.get('next')) ?? homePathFor(user), { replace: true })
    } catch (err) {
      setFormError(err.message || 'Failed to log in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDemoSignIn = async (role) => {
    setPendingDemo(role)
    setFormError(null)
    try {
      const user = await demoLogin(role)
      toast.success(`Signed in as ${user.name}`)
      navigate(safeNext(params.get('next')) ?? homePathFor(user), { replace: true })
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

      {/* Error alert */}
      {formError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger"
        >
          <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
          <p className="font-medium text-danger">{formError}</p>
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
    </section>
  )
}
