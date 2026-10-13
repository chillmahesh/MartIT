import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, ShieldAlert, RefreshCw, Clock, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { orderService } from '@/services/orderService'
import { toast } from 'sonner'
import { cn } from '@/utils/cn'

/**
 * Formats milliseconds remaining into MM:SS format.
 */
function formatTimeRemaining(ms) {
  if (ms <= 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * CustomerDeliveryOtpCard Component
 * Displays the authoritative 6-digit delivery verification OTP challenge for the authenticated customer.
 * In Mock Mode, prominently displays the DEMO MODE indicator and simulated in-app delivery.
 * Enforces authoritative expiry, attempt tracking, and 5-minute security lockout.
 */
export function CustomerDeliveryOtpCard({ orderId, className }) {
  const queryClient = useQueryClient()
  const [remainingMs, setRemainingMs] = useState(0)

  const {
    data: otpData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['delivery-otp', orderId],
    queryFn: () => orderService.getDeliveryOtp(orderId),
    enabled: Boolean(orderId),
    staleTime: 5000,
    refetchInterval: 15000,
  })

  // Expiry countdown timer
  useEffect(() => {
    if (!otpData?.expiresAt) {
      setRemainingMs(0)
      return
    }

    const updateTimer = () => {
      const diff = otpData.expiresAt - Date.now()
      setRemainingMs(Math.max(0, diff))
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [otpData?.expiresAt])

  // Refresh OTP Mutation
  const refreshMutation = useMutation({
    mutationFn: () => orderService.refreshDeliveryOtp(orderId),
    onSuccess: (data) => {
      queryClient.setQueryData(['delivery-otp', orderId], data)
      toast.success('New delivery OTP generated.')
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to refresh delivery OTP.')
    },
  })

  if (isLoading) {
    return (
      <Card className={cn('p-4 space-y-3 border-line bg-surface', className)}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-surface-2 animate-pulse" />
          <div className="h-4 w-20 rounded bg-surface-2 animate-pulse" />
        </div>
        <div className="h-14 rounded-tile bg-surface-2 animate-pulse" />
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className={cn('p-4 border-danger/30 bg-danger/5 space-y-2 text-xs', className)}>
        <div className="flex items-center gap-2 text-danger font-semibold">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>Could not retrieve delivery OTP</span>
        </div>
        <p className="text-ink-muted">
          {error?.message || 'Access to OTP challenge unavailable.'}
        </p>
        <Button size="sm" tone="neutral" onClick={() => refetch()} loading={isFetching}>
          Try Again
        </Button>
      </Card>
    )
  }

  if (!otpData) return null

  const isExpired = otpData.isExpired || remainingMs <= 0
  const isLocked = otpData.isLocked
  const otpDigits = String(otpData.otp || '------').slice(0, 6).split('')

  return (
    <Card
      className={cn(
        'p-4 sm:p-5 border-2 transition-all space-y-4',
        isLocked
          ? 'border-danger/40 bg-danger/5'
          : isExpired
          ? 'border-warning/40 bg-warning/5'
          : 'border-brand/40 bg-brand-soft/10',
        className,
      )}
      data-testid={`customer-otp-card-${orderId}`}
    >
      {/* Header: Title & Demo Mode Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded bg-brand-soft text-brand">
            <KeyRound className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-ink">
              Delivery Handover OTP
            </h3>
            <p className="text-[11px] text-ink-subtle">
              Share code with your runner upon delivery
            </p>
          </div>
        </div>

        {/* DEMO MODE Badge */}
        {otpData.demoMode && (
          <span
            className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider"
            data-testid={`demo-otp-badge-${orderId}`}
          >
            <ShieldAlert className="size-3" aria-hidden="true" />
            <span>DEMO MODE</span>
          </span>
        )}
      </div>

      {/* Demo Mode Notice */}
      {otpData.demoMode && (
        <div className="rounded-tile bg-surface border border-line/70 p-2.5 text-[11px] text-ink-muted flex items-start gap-2">
          <AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <strong>Simulated Customer Interface:</strong> In production, this OTP is dispatched via an authenticated delivery channel (SMS / Email / Push Notification). For this demo, it is shown securely to the authenticated order owner.
          </p>
        </div>
      )}

      {/* Lockout Notice */}
      {isLocked ? (
        <div
          role="alert"
          className="rounded-tile bg-danger/10 border border-danger/30 p-3 text-xs text-danger space-y-1.5"
          data-testid={`otp-locked-notice-${orderId}`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>Verification Locked</span>
          </div>
          <p className="text-ink-muted">
            Too many incorrect OTP attempts were entered. Handover verification is locked for 5 minutes for your protection.
          </p>
        </div>
      ) : isExpired ? (
        <div
          role="alert"
          className="rounded-tile bg-warning/10 border border-warning/30 p-3 text-xs text-warning space-y-1.5"
          data-testid={`otp-expired-notice-${orderId}`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            <span>OTP Expired</span>
          </div>
          <p className="text-ink-muted">
            This verification code has expired. Click below to generate a new 6-digit OTP for your runner.
          </p>
        </div>
      ) : (
        /* OTP Digits Display */
        <div className="space-y-2 text-center py-1">
          <div
            className="flex items-center justify-center gap-2 sm:gap-2.5"
            aria-label={`Delivery Handover OTP: ${otpData.otp}`}
            data-testid={`customer-otp-display-${orderId}`}
          >
            {otpDigits.map((digit, idx) => (
              <span
                key={idx}
                className="grid size-11 sm:size-12 place-items-center rounded-tile border-2 border-brand/50 bg-surface font-mono text-xl sm:text-2xl font-black text-brand shadow-1"
                data-testid={`otp-digit-${orderId}-${idx}`}
              >
                {digit}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-ink-subtle pt-1">
            <Clock className="size-3.5 text-ink-muted" aria-hidden="true" />
            <span>
              Expires in{' '}
              <strong className="font-mono text-ink">
                {formatTimeRemaining(remainingMs)}
              </strong>
            </span>
            {otpData.attemptsRemaining != null && otpData.attemptsRemaining < 3 && (
              <span className="text-[11px] text-danger font-medium ml-1">
                ({otpData.attemptsRemaining} {otpData.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer / Refresh Button */}
      <div className="flex items-center justify-between border-t border-line/60 pt-3">
        <p className="text-[11px] text-ink-muted max-w-[70%]">
          Never share this code with anyone before inspecting your order.
        </p>

        <Button
          size="sm"
          tone={isExpired ? 'brand' : 'neutral'}
          onClick={() => refreshMutation.mutate()}
          loading={refreshMutation.isPending}
          disabled={isLocked || refreshMutation.isPending}
          data-testid={`refresh-otp-btn-${orderId}`}
          className="text-xs font-semibold shrink-0"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          <span>{isExpired ? 'Generate New OTP' : 'Refresh'}</span>
        </Button>
      </div>
    </Card>
  )
}
