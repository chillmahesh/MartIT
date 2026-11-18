import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Bike, CheckCircle2, Lock, Mail, Phone, ShoppingBag, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { GoogleIcon } from '@/components/ui/GoogleIcon'
import { Input, PasswordInput } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { isMockBackend } from '@/config/env'
import { getSupabaseClient } from '@/config/supabaseClient'
import { homePathFor } from '@/utils/permissions'
import { cn } from '@/utils/cn'
import {
  validateName,
  validateEmail,
  validateIndianPhone,
  validatePassword,
  validatePasswordConfirmation,
} from '@/utils/validators'

/** Only allow same-site relative redirects (prevents open-redirects via ?next=). */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function SignupPage() {
  const signup = useAuthStore((s) => s.signup)
  const demoLogin = useAuthStore((s) => s.demoLogin)
  const configError = useAuthStore((s) => s.configError) || useAuthStore.getState().configError
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [role, setRole] = useState('customer')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formErrorCode, setFormErrorCode] = useState(null)
  const [confirmationNotice, setConfirmationNotice] = useState(null)

  const validateSingleField = (fieldName, val, extra = {}) => {
    switch (fieldName) {
      case 'name':
        return validateName(val, { required: true, label: 'Full name', maxLength: 100 }).error
      case 'email':
        return validateEmail(val, { required: true, label: 'Campus email' }).error
      case 'phone':
        return validateIndianPhone(val, { required: false, label: 'Phone number' }).error
      case 'password':
        return validatePassword(val, { minLength: 8, maxLength: 72, label: 'Password' }).error
      case 'confirmPassword':
        return validatePasswordConfirmation(extra.password ?? password, val).error
      default:
        return null
    }
  }

  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))
    let val = ''
    if (fieldName === 'name') val = name
    else if (fieldName === 'email') val = email
    else if (fieldName === 'phone') val = phone
    else if (fieldName === 'password') val = password
    else if (fieldName === 'confirmPassword') val = confirmPassword

    const err = validateSingleField(fieldName, val)
    setFieldErrors((prev) => ({ ...prev, [fieldName]: err }))
  }

  const handleRoleChange = (newRole) => {
    if (formError) setFormError(null)
    setRole(newRole)
  }

  const handleChange = (fieldName, val) => {
    // Reset previous error messages when user modifies input
    if (formError) setFormError(null)

    if (fieldName === 'name') setName(val)
    else if (fieldName === 'email') setEmail(val)
    else if (fieldName === 'phone') setPhone(val)
    else if (fieldName === 'password') {
      setPassword(val)
      if (touched.confirmPassword) {
        setFieldErrors((prev) => ({
          ...prev,
          confirmPassword: validateSingleField('confirmPassword', confirmPassword, { password: val }),
        }))
      }
    } else if (fieldName === 'confirmPassword') {
      setConfirmPassword(val)
    }

    if (touched[fieldName]) {
      const err = validateSingleField(fieldName, val)
      setFieldErrors((prev) => ({ ...prev, [fieldName]: err }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setFormErrorCode(null)

    // Mark all fields touched
    setTouched({
      name: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
    })

    const nameRes = validateName(name, { required: true, label: 'Full name', maxLength: 100 })
    const emailRes = validateEmail(email, { required: true, label: 'Campus email' })
    const phoneRes = validateIndianPhone(phone, { required: false, label: 'Phone number' })
    const passwordRes = validatePassword(password, { minLength: 8, maxLength: 72, label: 'Password' })
    const confirmRes = validatePasswordConfirmation(password, confirmPassword)

    const errors = {}
    if (!nameRes.isValid) errors.name = nameRes.error
    if (!emailRes.isValid) errors.email = emailRes.error
    if (!phoneRes.isValid) errors.phone = phoneRes.error
    if (!passwordRes.isValid) errors.password = passwordRes.error
    if (!confirmRes.isValid) errors.confirmPassword = confirmRes.error

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setFormError('Please resolve the highlighted errors before continuing.')
      return
    }

    if (!role || (role !== 'customer' && role !== 'runner')) {
      setFormError('Please select a valid account role (Customer or Runner).')
      return
    }

    setSubmitting(true)
    try {
      const cleanEmail = emailRes.normalized || emailRes.value.trim().toLowerCase()
      const result = await signup(cleanEmail, passwordRes.value, {
        name: nameRes.value,
        phone: phoneRes.national ? phoneRes.national : undefined,
        role,
      })

      // Wipe passwords immediately
      setPassword('')
      setConfirmPassword('')

      if (result.needsConfirmation) {
        setConfirmationNotice({
          email: emailRes.value,
          isEnumerationProtected: Boolean(result.isEnumerationProtected),
        })
      } else {
        if (role === 'runner') {
          toast.success(`Runner account created! Welcome, ${result.user?.name || nameRes.value}! Review is pending.`)
        } else {
          toast.success(`Account created! Welcome, ${result.user?.name || nameRes.value}!`)
        }
        navigate(safeNext(params.get('next')) ?? homePathFor(result.user), { replace: true })
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create account. Please try again.')
      setFormErrorCode(err.code || null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setFormError(null)
    setGoogleSubmitting(true)

    try {
      if (isMockMode) {
        const result = await demoLogin(role === 'runner' ? 'runner' : 'customer')
        if (role === 'runner') {
          toast.success(`Runner account created! Welcome, ${result.name}! Review is pending.`)
        } else {
          toast.success(`Account created! Welcome, ${result.name}!`)
        }
        navigate(safeNext(params.get('next')) ?? homePathFor(result), { replace: true })
        return
      }

      const supabase = getSupabaseClient()
      if (!supabase) {
        throw new Error('Supabase client is not configured.')
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          data: {
            role,
          },
        },
      })

      if (error) {
        console.error('Google sign-in failed:', error.message)
        setFormError(error.message || 'Google sign-in failed. Please try again.')
      }
    } catch (err) {
      console.error('Google sign-in failed:', err.message)
      setFormError(err.message || 'Google sign-in failed. Please try again.')
    } finally {
      setGoogleSubmitting(false)
    }
  }

  // 1. Email Confirmation Notice View
  if (confirmationNotice) {
    const noticeEmail =
      typeof confirmationNotice === 'string' ? confirmationNotice : confirmationNotice.email
    const isEnumeration =
      typeof confirmationNotice === 'object' && Boolean(confirmationNotice.isEnumerationProtected)

    return (
      <section className="mx-auto max-w-lg px-4 py-10 md:py-16">
        <Card className="p-6 md:p-8 text-center border-brand/20 bg-surface">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-fresh-ink">
            <CheckCircle2 className="size-8" aria-hidden="true" />
          </div>

          <h1 className="mt-5 font-display text-2xl md:text-3xl font-bold tracking-display text-ink">
            Check your email
          </h1>
          <p className="mt-3 text-sm text-ink-muted leading-relaxed">
            We’ve sent verification instructions to{' '}
            <strong className="text-ink font-semibold">{noticeEmail}</strong>.
            Please check your inbox and verify your email before logging in.
          </p>
          {isEnumeration && (
            <p className="mt-2 text-xs text-ink-muted leading-relaxed">
              If an account is already associated with this email address, you can log in directly.
            </p>
          )}

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
        <Badge tone={isMockMode ? 'outline' : role === 'runner' ? 'warning' : 'brand'} size="md">
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
          <div className="flex-1">
            <p className="font-medium text-danger">{formError}</p>
            {formErrorCode === 'DUPLICATE_EMAIL' && (
              <p className="mt-1.5 text-xs text-danger/90">
                Already registered?{' '}
                <Link to="/login" className="font-semibold underline hover:text-danger-hover">
                  Go to Log in
                </Link>
              </p>
            )}
            {formErrorCode === 'WEAK_PASSWORD' && (
              <p className="mt-1.5 text-xs text-danger/90">
                Tip: Choose a stronger password with at least 8 characters, combining uppercase and lowercase letters, numbers, and symbols.
              </p>
            )}
            {formErrorCode === 'RATE_LIMITED' && (
              <p className="mt-1.5 text-xs text-danger/90">
                Please wait a few minutes before trying again to prevent temporary rate limiting.
              </p>
            )}
          </div>
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
              onClick={() => handleRoleChange('customer')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  handleRoleChange('customer')
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
              onClick={() => handleRoleChange('runner')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  handleRoleChange('runner')
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

        {/* Google Sign-up Button */}
        <div className="pt-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            block
            loading={googleSubmitting}
            disabled={Boolean(hasConfigError) || submitting}
            onClick={handleGoogleSignUp}
            className="font-medium"
          >
            <GoogleIcon className="size-5 shrink-0" />
            <span>Sign up with Google</span>
          </Button>
        </div>

        {/* Divider */}
        <div className="relative my-2 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative bg-bg px-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            or register with email
          </div>
        </div>

        <Field label="Full Name" error={touched.name ? fieldErrors.name : undefined}>
          <Input
            type="text"
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => handleChange('name', e.target.value)}
            onBlur={() => handleBlur('name')}
            placeholder="Alice Customer"
            icon={User}
            disabled={submitting}
          />
        </Field>

        <Field label="Campus Email" error={touched.email ? fieldErrors.email : undefined}>
          <Input
            type="email"
            inputMode="email"
            name="email"
            autoComplete="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            placeholder="you@campus.edu"
            icon={Mail}
            disabled={submitting}
          />
        </Field>

        <Field
          label="Phone Number"
          optional
          hint="10-digit Indian mobile number (e.g. 9876543210 or +91 98765 43210)"
          error={touched.phone ? fieldErrors.phone : undefined}
        >
          <Input
            type="tel"
            inputMode="tel"
            name="phone"
            autoComplete="tel"
            maxLength={16}
            value={phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            onBlur={() => handleBlur('phone')}
            placeholder="e.g. 9876543210"
            icon={Phone}
            disabled={submitting}
          />
        </Field>

        <Field label="Password" hint="At least 8 characters" error={touched.password ? fieldErrors.password : undefined}>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            required
            maxLength={72}
            value={password}
            onChange={(e) => handleChange('password', e.target.value)}
            onBlur={() => handleBlur('password')}
            placeholder="Create password"
            disabled={submitting}
          />
        </Field>

        <Field label="Confirm Password" error={touched.confirmPassword ? fieldErrors.confirmPassword : undefined}>
          <PasswordInput
            name="confirmPassword"
            autoComplete="new-password"
            required
            maxLength={72}
            value={confirmPassword}
            onChange={(e) => handleChange('confirmPassword', e.target.value)}
            onBlur={() => handleBlur('confirmPassword')}
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

        <p className="mt-3 text-xs text-center text-ink-subtle leading-relaxed">
          By creating an account, you agree to MartIT&apos;s{' '}
          <Link to="/terms-and-conditions" target="_blank" className="font-medium text-ink underline hover:text-brand">
            Terms &amp; Conditions
          </Link>{' '}
          and acknowledge our{' '}
          <Link to="/privacy-policy" target="_blank" className="font-medium text-ink underline hover:text-brand">
            Privacy Policy
          </Link>.
        </p>
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
