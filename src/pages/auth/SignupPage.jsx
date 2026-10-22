import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Bike, CheckCircle2, Lock, Mail, Phone, ShoppingBag, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Input, PasswordInput } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { isMockBackend } from '@/config/env'
import { homePathFor } from '@/utils/permissions'
import { cn } from '@/utils/cn'

/** Only allow same-site relative redirects (prevents open-redirects via ?next=). */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function SignupPage() {
  const signup = useAuthStore((s) => s.signup)
  const configError = useAuthStore((s) => s.configError) || useAuthStore.getState().configError
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [role, setRole] = useState('customer')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [confirmationNotice, setConfirmationNotice] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    const cleanName = name.trim()
    const cleanEmail = email.trim()
    const cleanPhone = phone.trim()

    // Client-side validations
    if (!role || (role !== 'customer' && role !== 'runner')) {
      setFormError('Please select a valid account role (Customer or Runner).')
      return
    }

    if (!cleanName || cleanName.length < 2) {
      setFormError('Please enter your full name (minimum 2 characters).')
      return
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Please enter a valid campus or personal email address.')
      return
    }

    if (!password || password.length < 8) {
      setFormError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match. Please re-enter to confirm.')
      return
    }

    setSubmitting(true)
    try {
      const result = await signup(cleanEmail, password, {
        name: cleanName,
        phone: cleanPhone || undefined,
        role,
      })

      // Wipe passwords immediately
      setPassword('')
      setConfirmPassword('')

      if (result.needsConfirmation) {
        setConfirmationNotice(cleanEmail)
      } else {
        if (role === 'runner') {
          toast.success(`Runner account created! Welcome, ${result.user?.name || cleanName}! Review is pending.`)
        } else {
          toast.success(`Account created! Welcome, ${result.user?.name || cleanName}!`)
        }
        navigate(safeNext(params.get('next')) ?? homePathFor(result.user), { replace: true })
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // 1. Email Confirmation Notice View
  if (confirmationNotice) {
    return (
      <section className="mx-auto max-w-lg px-4 py-10 md:py-16">
        <Card className="p-6 md:p-8 text-center border-brand/20 bg-surface">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-fresh-ink">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </div>

          <h1 className="mt-5 font-display text-2xl md:text-3xl font-bold tracking-display text-ink">
            Verify your email
          </h1>
          <p className="mt-3 text-sm text-ink-muted leading-relaxed">
            We’ve sent a confirmation link to{' '}
            <strong className="text-ink font-semibold">{confirmationNotice}</strong>.
            Please check your inbox and verify your email before logging in.
          </p>

          <div className="mt-8">
            <Button
              asChild
              variant="primary"
              size="lg"
              block
            >
              <Link to="/login">Go to Log in</Link>
            </Button>
          </div>
        </Card>
      </section>
    )
  }

  // 2. Signup Form View
  const hasConfigError = Boolean(configError)
  const isMockMode = isMockBackend && !hasConfigError

  return (
    <section className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="flex items-center gap-2">
        <Badge tone={isMockMode ? 'outline' : role === 'runner' ? 'warning' : 'success'} size="md">
          {isMockMode
            ? `Demo Mock Mode (${role === 'runner' ? 'Runner' : 'Customer'})`
            : role === 'runner'
              ? 'Runner Applicant'
              : 'Customer Account'}
        </Badge>
      </div>

      <h1 className="mt-4 font-display text-4xl font-bold tracking-display text-ink">
        Create an account
      </h1>
      <p className="mt-2 text-ink-muted">
        Sign up for quick campus food, stationery, and grocery delivery.
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

      <form onSubmit={handleSubmit} className="mt-8 grid gap-4" noValidate>
        {/* Account Role Selection */}
        <Field label="I want to sign up as" hint="Select whether you want to order or deliver on campus">
          <div
            role="radiogroup"
            aria-label="Account Type"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {/* Customer option */}
            <div
              role="radio"
              aria-checked={role === 'customer'}
              tabIndex={0}
              onClick={() => setRole('customer')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  setRole('customer')
                }
              }}
              className={cn(
                'relative flex flex-col p-4 rounded-card border-2 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                role === 'customer'
                  ? 'border-brand bg-brand-soft/25 text-ink shadow-1'
                  : 'border-line bg-surface hover:border-line-hover text-ink-muted'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    'grid size-9 place-items-center rounded-full',
                    role === 'customer' ? 'bg-brand text-fresh-ink' : 'bg-surface-2 text-ink-subtle'
                  )}
                >
                  <ShoppingBag className="size-4" aria-hidden="true" />
                </div>
                <span
                  className={cn(
                    'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                    role === 'customer' ? 'bg-brand/20 text-fresh-ink' : 'bg-surface-3 text-ink-subtle'
                  )}
                >
                  Instant Access
                </span>
              </div>
              <p className="font-display font-bold text-base text-ink">Customer</p>
              <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                Order meals, snacks & essentials delivered right to your campus spot.
              </p>
            </div>

            {/* Runner option */}
            <div
              role="radio"
              aria-checked={role === 'runner'}
              tabIndex={0}
              onClick={() => setRole('runner')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  setRole('runner')
                }
              }}
              className={cn(
                'relative flex flex-col p-4 rounded-card border-2 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                role === 'runner'
                  ? 'border-brand bg-brand-soft/25 text-ink shadow-1'
                  : 'border-line bg-surface hover:border-line-hover text-ink-muted'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    'grid size-9 place-items-center rounded-full',
                    role === 'runner' ? 'bg-brand text-fresh-ink' : 'bg-surface-2 text-ink-subtle'
                  )}
                >
                  <Bike className="size-4" aria-hidden="true" />
                </div>
                <span
                  className={cn(
                    'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                    role === 'runner' ? 'bg-warning/20 text-warning-ink' : 'bg-surface-3 text-ink-subtle'
                  )}
                >
                  Application
                </span>
              </div>
              <p className="font-display font-bold text-base text-ink">Runner</p>
              <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                Deliver orders on campus & earn flexible income on your schedule.
              </p>
            </div>
          </div>
        </Field>

        {role === 'runner' && (
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-card border border-warning/30 bg-warning/10 p-3 text-xs text-ink-muted"
          >
            <AlertCircle className="size-4 shrink-0 text-warning mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong className="text-ink font-semibold">Runner Verification:</strong> After registration, runner accounts require student ID verification and administrator approval before accepting delivery runs. You can still order food anytime.
            </p>
          </div>
        )}

        <Field label="Full Name">
          <Input
            type="text"
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice Customer"
            icon={User}
            disabled={submitting}
          />
        </Field>

        <Field label="Campus Email">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@campus.edu"
            icon={Mail}
            disabled={submitting}
          />
        </Field>

        <Field label="Phone Number" optional hint="Used by runners during delivery handover">
          <Input
            type="tel"
            name="phone"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            icon={Phone}
            disabled={submitting}
          />
        </Field>

        <Field label="Password" hint="At least 8 characters">
          <PasswordInput
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create password"
            disabled={submitting}
          />
        </Field>

        <Field label="Confirm Password">
          <PasswordInput
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
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
          Create account
        </Button>
      </form>

      <p className="mt-8 text-sm text-ink-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-fresh-ink underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </section>
  )
}
