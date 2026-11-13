import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { PasswordInput, Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { isMockBackend } from '@/config/env'
import { parseRecoveryUrlParams, clearRecoveryUrlParams } from '@/utils/recovery'
import { authService } from '@/services/authService'
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@/utils/validators'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery) || useAuthStore.getState().isPasswordRecovery
  const recoveryEmail = useAuthStore((s) => s.recoveryEmail) || useAuthStore.getState().recoveryEmail
  const updatePassword = useAuthStore((s) => s.updatePassword)
  const forgotPassword = useAuthStore((s) => s.forgotPassword)
  const logout = useAuthStore((s) => s.logout)
  const clearRecoveryState = useAuthStore((s) => s.clearRecoveryState)

  // Page status: 'checking' | 'ready' | 'callback_error' | 'no_session' | 'success'
  const [status, setStatus] = useState(() => {
    const urlParams = parseRecoveryUrlParams()
    if (urlParams.hasError || urlParams.isExpiredOrInvalid) {
      return 'callback_error'
    }
    if (isMockBackend || isPasswordRecovery) {
      return 'ready'
    }
    return 'checking'
  })

  const [callbackError, setCallbackError] = useState(() => {
    const urlParams = parseRecoveryUrlParams()
    if (urlParams.hasError || urlParams.isExpiredOrInvalid) {
      return (
        urlParams.errorDescription ||
        (urlParams.errorCode === 'otp_expired'
          ? 'The password reset link has expired. Password reset links are valid for single-use only.'
          : 'The password reset link is invalid or has expired.')
      )
    }
    return null
  })

  // Form state
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // Request new link state
  const [requestLinkEmail, setRequestLinkEmail] = useState('')
  const [requestLinkTouched, setRequestLinkTouched] = useState(false)
  const [requestLinkError, setRequestLinkError] = useState(null)
  const [requestLinkSubmitting, setRequestLinkSubmitting] = useState(false)
  const [requestLinkSuccess, setRequestLinkSuccess] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)

  useEffect(() => {
    // 1. Check for URL callback errors (e.g. otp_expired, access_denied)
    const urlParams = parseRecoveryUrlParams()
    if (urlParams.hasError || urlParams.isExpiredOrInvalid) {
      setCallbackError(
        urlParams.errorDescription ||
          (urlParams.errorCode === 'otp_expired'
            ? 'The password reset link has expired. Password reset links are valid for single-use only.'
            : 'The password reset link is invalid or has expired.')
      )
      setStatus('callback_error')
      return
    }

    // 2. Mock mode: always ready for testing/demo
    if (isMockBackend) {
      setStatus('ready')
      return
    }

    // 3. Remote mode: check if recovery session is already established
    if (isPasswordRecovery) {
      setStatus('ready')
      return
    }

    let isCancelled = false

    // Listen for auth state transitions (e.g. Supabase async parsing of URL fragment)
    const { data: authSub } = authService.onAuthStateChange((event, newSession) => {
      if (isCancelled) return
      if (
        (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') &&
        newSession?.access_token
      ) {
        setStatus('ready')
      }
    })

    // Check existing session via authService
    authService
      .getSession()
      .then((session) => {
        if (isCancelled) return
        if (session?.access_token) {
          setStatus('ready')
        } else {
          // If a recovery token is in the URL hash, allow sufficient time for Supabase to parse
          const waitMs = urlParams.hasRecoveryToken ? 3000 : 1000
          const timer = setTimeout(() => {
            if (!isCancelled && !useAuthStore.getState().isPasswordRecovery) {
              setStatus('no_session')
            }
          }, waitMs)
          return () => clearTimeout(timer)
        }
      })
      .catch(() => {
        if (!isCancelled) setStatus('no_session')
      })

    return () => {
      isCancelled = true
      if (authSub?.subscription?.unsubscribe) {
        authSub.subscription.unsubscribe()
      }
    }
  }, [isPasswordRecovery])

  const validatePasswordFields = (pwd, confirmPwd) => {
    const errors = {}
    const pwdRes = validatePassword(pwd, { minLength: 6, maxLength: 72 })
    if (!pwdRes.valid) {
      errors.password = pwdRes.error
    }
    const confirmRes = validatePasswordConfirmation(pwd, confirmPwd)
    if (!confirmRes.valid) {
      errors.confirmPassword = confirmRes.error
    }
    return errors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    setTouched({ password: true, confirmPassword: true })
    const errors = validatePasswordFields(password, confirmPassword)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setFormError(errors.password || errors.confirmPassword)
      return
    }

    setSubmitting(true)
    try {
      // Validate that an active Supabase recovery session exists before attempting password update
      if (!isMockBackend) {
        const session = await authService.getSession()
        if (!session?.access_token) {
          throw new Error('Your password recovery session is invalid or has expired. Please request a new link.')
        }
      }

      await updatePassword(password)
      setStatus('success')
      toast.success('Password updated successfully!')

      // Clear recovery state safely
      await logout().catch(() => {})
      clearRecoveryState()
      clearRecoveryUrlParams()

      // Navigate to login with notice
      navigate('/login', {
        state: {
          notice: 'Your password has been successfully reset. Please log in with your new password.',
        },
        replace: true,
      })
    } catch (err) {
      setFormError(err.message || 'Failed to update password. Please try again or request a new link.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestNewLink = async (e) => {
    e.preventDefault()
    setRequestLinkTouched(true)
    setRequestLinkError(null)

    const emailRes = validateEmail(requestLinkEmail)
    if (!emailRes.valid) {
      setRequestLinkError(emailRes.error || 'Please enter a valid campus email address.')
      return
    }

    setRequestLinkSubmitting(true)
    try {
      await forgotPassword(emailRes.normalized)
      setRequestLinkSuccess(true)
      toast.success('New password reset link sent!')
    } catch (err) {
      setRequestLinkError(err.message || 'Failed to send reset link. Please try again.')
    } finally {
      setRequestLinkSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="flex items-center gap-2">
        <Badge tone="brand" size="md">
          Password Recovery
        </Badge>
      </div>

      <h1 className="mt-4 font-display text-4xl font-bold tracking-display text-ink">
        {status === 'success' ? 'Password updated' : 'Reset your password'}
      </h1>

      <p className="mt-2 text-ink-muted">
        {status === 'ready' && 'Enter and confirm your new password below.'}
        {status === 'checking' && 'Verifying your recovery link...'}
        {status === 'callback_error' && 'This password reset link is invalid or has expired.'}
        {status === 'no_session' && 'No active password recovery session was found.'}
        {status === 'success' && 'Your password has been changed. Redirecting to login...'}
      </p>

      {/* 1. Checking / Loading State */}
      {status === 'checking' && (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 py-10 text-ink-muted">
          <Spinner className="size-8" />
          <p className="text-sm">Validating recovery session...</p>
        </div>
      )}

      {/* 2. Expired or Invalid Link Error */}
      {status === 'callback_error' && (
        <div className="mt-6 space-y-6">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
          >
            <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Reset Link Expired or Invalid</p>
              <p className="mt-1 text-ink">{callbackError}</p>
              <p className="mt-2 text-xs text-ink-muted">
                For security reasons, recovery links are single-use and expire after 1 hour.
              </p>
            </div>
          </div>

          {!showRequestForm ? (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="primary"
                size="lg"
                block
                onClick={() => setShowRequestForm(true)}
              >
                Request a new link
              </Button>
              <Button as={Link} to="/login" variant="ghost" size="md" block>
                Back to log in
              </Button>
            </div>
          ) : (
            <Card className="p-5">
              <h2 className="text-base font-semibold text-ink">Request a new recovery link</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Enter your campus email to receive a fresh password reset link.
              </p>

              {requestLinkSuccess ? (
                <div
                  role="status"
                  className="mt-4 flex items-start gap-3 rounded-card border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
                >
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Check your email</p>
                    <p className="mt-1 text-xs text-ink">
                      If an account exists for {requestLinkEmail}, a new link was sent.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestNewLink} className="mt-4 space-y-3" noValidate>
                  {requestLinkError && (
                    <div role="alert" className="text-xs text-danger">
                      {requestLinkError}
                    </div>
                  )}
                  <Field label="Campus Email" error={requestLinkTouched ? requestLinkError : undefined}>
                    <Input
                      type="email"
                      value={requestLinkEmail}
                      onChange={(e) => {
                        setRequestLinkEmail(e.target.value)
                        if (requestLinkTouched) {
                          const res = validateEmail(e.target.value)
                          setRequestLinkError(res.valid ? null : res.error)
                        }
                      }}
                      onBlur={() => {
                        setRequestLinkTouched(true)
                        const res = validateEmail(requestLinkEmail)
                        setRequestLinkError(res.valid ? null : res.error)
                      }}
                      placeholder="you@campus.edu"
                      icon={Mail}
                      required
                      maxLength={255}
                      disabled={requestLinkSubmitting}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="primary"
                    block
                    loading={requestLinkSubmitting}
                  >
                    Send fresh link
                  </Button>
                </form>
              )}
            </Card>
          )}
        </div>
      )}

      {/* 3. Missing Recovery Session State */}
      {status === 'no_session' && (
        <div className="mt-6 space-y-6">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
          >
            <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">No Active Recovery Session</p>
              <p className="mt-1 text-ink">
                To reset your password, you must use the recovery link sent to your registered campus email address.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              block
              onClick={() => {
                navigate('/login')
              }}
            >
              Go to login & request link
            </Button>
            <Button as={Link} to="/signup" variant="ghost" size="md" block>
              Create a new account
            </Button>
          </div>
        </div>
      )}

      {/* 4. Valid Session: Password Reset Form */}
      {status === 'ready' && (
        <form onSubmit={handleSubmit} className="mt-8 grid gap-4" noValidate>
          {recoveryEmail && (
            <div className="rounded-card border border-line bg-surface-subtle p-3 text-xs text-ink-muted">
              Updating password for account: <span className="font-medium text-ink">{recoveryEmail}</span>
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger"
            >
              <AlertCircle className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
              <p className="font-medium text-danger">{formError}</p>
            </div>
          )}

          <div className="grid gap-1.5">
            <label htmlFor="reset-new-password" className="text-sm font-medium text-ink">
              New Password
            </label>
            <PasswordInput
              id="reset-new-password"
              name="newPassword"
              autoComplete="new-password"
              required
              maxLength={72}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (touched.password) {
                  const errs = validatePasswordFields(e.target.value, confirmPassword)
                  setFieldErrors(errs)
                }
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, password: true }))
                const errs = validatePasswordFields(password, confirmPassword)
                setFieldErrors(errs)
              }}
              aria-invalid={touched.password && !!fieldErrors.password}
              aria-describedby={touched.password && fieldErrors.password ? 'reset-new-password-error' : undefined}
              placeholder="Enter new password (min. 6 characters)"
              disabled={submitting}
            />
            {touched.password && fieldErrors.password ? (
              <p id="reset-new-password-error" className="text-xs text-danger">
                {fieldErrors.password}
              </p>
            ) : (
              <p className="text-xs text-ink-subtle">Must be at least 6 characters long.</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="reset-confirm-password" className="text-sm font-medium text-ink">
              Confirm New Password
            </label>
            <PasswordInput
              id="reset-confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              maxLength={72}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (touched.confirmPassword) {
                  const errs = validatePasswordFields(password, e.target.value)
                  setFieldErrors(errs)
                }
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, confirmPassword: true }))
                const errs = validatePasswordFields(password, confirmPassword)
                setFieldErrors(errs)
              }}
              aria-invalid={touched.confirmPassword && !!fieldErrors.confirmPassword}
              aria-describedby={touched.confirmPassword && fieldErrors.confirmPassword ? 'reset-confirm-password-error' : undefined}
              placeholder="Re-enter new password"
              disabled={submitting}
            />
            {touched.confirmPassword && fieldErrors.confirmPassword && (
              <p id="reset-confirm-password-error" className="text-xs text-danger">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={submitting}
            className="mt-2"
          >
            Update password
          </Button>

          <p className="mt-4 text-center text-sm text-ink-muted">
            Remember your credentials?{' '}
            <Link to="/login" className="font-medium text-fresh-ink hover:underline">
              Return to log in
            </Link>
          </p>
        </form>
      )}

      {/* 5. Success State */}
      {status === 'success' && (
        <div className="mt-8 space-y-4">
          <div
            role="status"
            className="flex items-start gap-3 rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300"
          >
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Password updated successfully!</p>
              <p className="mt-1 text-ink">
                Your password has been changed. Navigating you back to the login page...
              </p>
            </div>
          </div>
          <Button as={Link} to="/login" variant="primary" block>
            Proceed to log in
          </Button>
        </div>
      )}
    </section>
  )
}
