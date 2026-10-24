import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Mail, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input, PasswordInput } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { isMockBackend } from '@/config/env'
import { hasPermission, PERMISSIONS } from '@/utils/permissions'

/** Only allow same-site relative redirects (prevents open-redirects via ?next=). */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function AdminLoginPage() {
  const login = useAuthStore((s) => s.login)
  const demoLogin = useAuthStore((s) => s.demoLogin)
  const logout = useAuthStore((s) => s.logout)
  const userFromHook = useAuthStore((s) => s.user)
  const currentUser = userFromHook ?? useAuthStore.getState().user
  const configError = useAuthStore((s) => s.configError) || useAuthStore.getState().configError

  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDemo, setPendingDemo] = useState(null)

  const isAuthedAdmin = currentUser && hasPermission(currentUser, PERMISSIONS.ADMIN_ACCESS)
  const isAuthedNonAdmin = currentUser && !hasPermission(currentUser, PERMISSIONS.ADMIN_ACCESS)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setFormError('Please enter your administrator email.')
      return
    }
    if (!password) {
      setFormError('Please enter your password.')
      return
    }

    setSubmitting(true)
    try {
      const user = await login(cleanEmail, password)

      // Strict client-side gate: verify authoritative database-backed role
      if (!hasPermission(user, PERMISSIONS.ADMIN_ACCESS)) {
        await logout().catch(() => {})
        setFormError('Access denied. This account does not have administrator privileges.')
        return
      }

      toast.success(`Welcome to Admin Console, ${user.name}!`)
      navigate(safeNext(params.get('next')) ?? '/admin', { replace: true })
    } catch (err) {
      const msg = err.message || 'Authentication failed. Please verify your administrator credentials.'
      setFormError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDemoAdmin = async (role) => {
    setPendingDemo(role)
    setFormError(null)
    try {
      const user = await demoLogin(role)
      toast.success(`Signed in as demo ${user.name}!`)
      navigate(safeNext(params.get('next')) ?? '/admin', { replace: true })
    } catch (err) {
      setFormError(err.message || 'Failed to sign in with demo admin account.')
    } finally {
      setPendingDemo(null)
    }
  }

  // If already logged in as admin, redirect or provide direct dashboard link
  if (isAuthedAdmin) {
    return (
      <section className="mx-auto max-w-lg px-4 py-12 md:py-20 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-info-soft text-info mb-6">
          <ShieldCheck className="size-8" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-display text-ink">Already Signed In</h1>
        <p className="mt-2 text-ink-muted">
          You are signed in as <span className="font-semibold text-ink">{currentUser.name}</span> with administrator access.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg">
            <Link to={safeNext(params.get('next')) ?? '/admin'}>Go to Admin Console</Link>
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={async () => {
              await logout()
              navigate('/admin/login', { replace: true })
            }}
          >
            Sign out
          </Button>
        </div>
      </section>
    )
  }

  const hasConfigError = Boolean(configError)
  const isMockMode = isMockBackend && !hasConfigError

  return (
    <section className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="flex items-center gap-2">
        <Badge tone="info" size="md">
          {isMockMode ? 'Demo Mock Mode' : 'Admin Console'}
        </Badge>
        <span className="text-xs text-ink-subtle">Restricted Area</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl bg-info-soft text-info">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-display text-ink">Admin Log In</h1>
          <p className="text-sm text-ink-muted">Sign in to manage users, runners, and platform settings.</p>
        </div>
      </div>

      {/* Non-admin session warning */}
      {isAuthedNonAdmin && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-card border border-warning/40 bg-warning/10 p-4 text-sm text-ink"
        >
          <ShieldAlert className="size-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold text-warning-ink">Insufficient Privileges</p>
            <p className="mt-1 text-xs text-ink-muted">
              You are signed in as <span className="font-semibold">{currentUser.name}</span> ({currentUser.email}), but this account is not an administrator.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 text-xs"
              onClick={async () => {
                await logout()
                navigate('/admin/login', { replace: true })
              }}
            >
              Sign out to switch account
            </Button>
          </div>
        </div>
      )}

      {/* Missing configuration alert in remote mode */}
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

      {/* Form error alert */}
      {formError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger"
        >
          <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
          <p className="font-medium text-danger">{formError}</p>
        </div>
      )}

      {/* Demo admin login shortcuts (Mock Mode only) */}
      {isMockMode && (
        <Card className="mt-6 p-4 border-dashed border-info/40 bg-info-soft/20">
          <p className="text-xs font-semibold text-info uppercase tracking-wider">Demo Quick Access</p>
          <p className="mt-1 text-xs text-ink-muted">
            Test administrative permissions instantly with preconfigured accounts:
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting || Boolean(pendingDemo)}
              onClick={() => handleDemoAdmin('admin')}
              className="w-full text-xs"
            >
              {pendingDemo === 'admin' ? <Spinner size="sm" className="mr-1" /> : <ShieldCheck className="size-3.5 mr-1 text-info" />}
              Sample Admin (Carol)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting || Boolean(pendingDemo)}
              onClick={() => handleDemoAdmin('super_admin')}
              className="w-full text-xs"
            >
              {pendingDemo === 'super_admin' ? <Spinner size="sm" className="mr-1" /> : <ShieldCheck className="size-3.5 mr-1 text-fresh-ink" />}
              Sample Super Admin (Dave)
            </Button>
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="Administrator Email" hint="Enter your verified admin campus email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@campus.edu"
            icon={Mail}
            required
            disabled={submitting || hasConfigError}
          />
        </Field>

        <Field label="Password" hint="Minimum 8 characters">
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            disabled={submitting || hasConfigError}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={submitting || Boolean(pendingDemo) || hasConfigError}
          className="mt-2"
        >
          {submitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Verifying Administrator Access...
            </>
          ) : (
            'Log In to Admin Console'
          )}
        </Button>
      </form>

      <div className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-muted">
        <p>
          Need access? Administrator accounts are granted by MartIT Super Administrators.
        </p>
        <p className="mt-2">
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Go to Customer / Runner Log In
          </Link>
        </p>
      </div>
    </section>
  )
}
