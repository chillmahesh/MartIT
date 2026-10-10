import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Bike, Mail, Lock, ShieldCheck, ShoppingBasket } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
  const configError = useAuthStore((s) => s.configError) || useAuthStore.getState().configError
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDemo, setPendingDemo] = useState(null)

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

        <Field label="Password" error={undefined}>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={submitting}
          />
        </Field>

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
    </section>
  )
}
