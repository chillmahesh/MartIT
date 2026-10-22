import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { AlertCircle, QrCode, ShieldAlert, Smartphone } from 'lucide-react'
import { env } from '@/config/env'
import { buildUpiPayload } from '@/utils/upi'
import { formatINR } from '@/utils/currency'
import { PAYMENT_STATUS } from '@/utils/paymentMachine'
import { cn } from '@/utils/cn'

/**
 * PaymentQr Component — Generates a genuine, scannable UPI QR code.
 *
 * SAFETY GUARANTEES:
 * 1. Only generates a QR when the order payment status is pending.
 * 2. Only generates a QR when the payment window is strictly active (not expired).
 * 3. Encodes the exact authoritative total including platform fee (positive finite number).
 * 4. Uses configured UPI payee details only (never invents fake credentials).
 * 5. If payee VPA is missing, fails safely and displays a clear configuration requirement.
 * 6. Never claims that scanning a QR confirms payment, nor marks the order as paid.
 */
export function PaymentQr({
  amount,
  orderId,
  payeeVpa = env.upiPayeeVpa,
  payeeName = env.upiPayeeName,
  paymentStatus = PAYMENT_STATUS.PENDING,
  isExpired = false,
  className,
}) {
  const [svgString, setSvgString] = useState('')
  const [qrError, setQrError] = useState(null)

  // 1. Guard: Only generate QR when order payment is pending
  const isPending =
    !paymentStatus ||
    paymentStatus === PAYMENT_STATUS.PENDING ||
    paymentStatus === 'PENDING'

  if (!isPending) {
    return (
      <div
        data-testid="upi-inactive-status-notice"
        className={cn(
          'rounded-card border border-line bg-surface-2 p-5 text-center space-y-2 text-xs text-ink-muted',
          className,
        )}
      >
        <p className="font-semibold text-ink">Payment QR Inactive</p>
        <p>This order is no longer awaiting payment (current status: {paymentStatus}).</p>
      </div>
    )
  }

  // 2. Guard: Only generate QR when payment window is active
  if (isExpired) {
    return (
      <div
        data-testid="upi-expired-notice"
        className={cn(
          'rounded-card border border-red-500/30 bg-red-500/10 p-5 text-center space-y-2 text-danger text-xs',
          className,
        )}
      >
        <AlertCircle className="size-6 mx-auto text-danger" />
        <p className="font-semibold">Payment Window Expired</p>
        <p>Payment QR code cannot be generated because the payment window has expired.</p>
      </div>
    )
  }

  // 3. Amount & Payload Validation
  const upiPayload = buildUpiPayload({
    payeeVpa,
    payeeName,
    amount,
    orderId,
  })

  useEffect(() => {
    if (!upiPayload.ok) return

    let isMounted = true
    QRCode.toString(upiPayload.uri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0b1410',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (isMounted) setSvgString(svg)
      })
      .catch((err) => {
        if (isMounted) setQrError(err.message || 'Failed to render QR code')
      })

    return () => {
      isMounted = false
    }
  }, [upiPayload.ok, upiPayload.uri])

  // Safe failure: Missing UPI Payee configuration
  if (!upiPayload.ok) {
    if (upiPayload.error === 'MISSING_PAYEE_VPA') {
      return (
        <div
          data-testid="upi-unconfigured-notice"
          className={cn(
            'rounded-card border border-amber-500/40 bg-amber-500/10 p-5 text-center space-y-3',
            className,
          )}
        >
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/20 text-amber-600">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-sm font-bold text-ink">
              UPI Payee VPA Not Configured
            </h3>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              Live payment QR generation requires an approved merchant UPI address. Please configure{' '}
              <code className="font-mono font-semibold text-ink px-1 py-0.5 bg-surface-2 rounded">
                VITE_UPI_PAYEE_VPA
              </code>{' '}
              in your environment.
            </p>
          </div>
          <div className="rounded-tile bg-surface p-2.5 text-[11px] text-ink-subtle border border-line">
            Failing safely: MartIT will never hardcode fake UPI IDs or display decorative mock QRs
            as active payment codes.
          </div>
        </div>
      )
    }

    return (
      <div
        data-testid="upi-error-notice"
        className={cn(
          'rounded-card border border-red-500/30 bg-red-500/10 p-4 text-center space-y-2 text-danger',
          className,
        )}
      >
        <AlertCircle className="size-6 mx-auto" />
        <p className="text-xs font-semibold">{upiPayload.message || 'Invalid payment parameters.'}</p>
      </div>
    )
  }

  if (qrError) {
    return (
      <div
        className={cn(
          'rounded-card border border-red-500/30 bg-red-500/10 p-4 text-center text-danger text-xs',
          className,
        )}
      >
        <p>Could not render UPI QR: {qrError}</p>
      </div>
    )
  }

  return (
    <div
      data-testid="genuine-upi-qr"
      className={cn('flex flex-col items-center space-y-3 text-center', className)}
    >
      {/* QR Code Container */}
      <div className="relative rounded-card border-2 border-line bg-white p-3 shadow-2 transition-transform">
        {svgString ? (
          <div
            className="size-48 sm:size-56 [&>svg]:size-full [&>svg]:block"
            dangerouslySetInnerHTML={{ __html: svgString }}
            aria-label={`UPI QR code to pay ${formatINR(amount)} to ${payeeName}`}
          />
        ) : (
          <div className="size-48 sm:size-56 grid place-items-center text-ink-subtle animate-pulse">
            <QrCode className="size-10" />
            <span className="text-xs">Generating QR...</span>
          </div>
        )}
      </div>

      {/* Payee and Amount Confirmation */}
      <div className="space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <span>Paying to</span>
          <strong className="font-semibold text-ink">{payeeName}</strong>
          <span className="font-mono text-ink-subtle text-[11px]">({payeeVpa})</span>
        </div>
        <p className="font-display text-lg font-bold text-ink">
          Exact Payable Total:{' '}
          <span className="text-brand tabular">{formatINR(amount)}</span>
        </p>
      </div>

      {/* Deep Link Button for Mobile Users */}
      {upiPayload.uri && (
        <a
          href={upiPayload.uri}
          className="inline-flex items-center gap-1.5 rounded-tile border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-3 transition-colors sm:hidden shadow-1"
        >
          <Smartphone className="size-3.5" aria-hidden="true" />
          <span>Tap to Pay with UPI App</span>
        </a>
      )}

      {/* Non-confirmation safety disclosure */}
      <p className="text-[11px] text-ink-subtle max-w-xs leading-relaxed">
        Scan with Google Pay, PhonePe, Paytm, or any UPI app.
        <br />
        <span className="text-ink-muted font-medium">
          Scanning alone does not confirm payment.
        </span>{' '}
        Your order is placed only after server verification is received.
      </p>
    </div>
  )
}
