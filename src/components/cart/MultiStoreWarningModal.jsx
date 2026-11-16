import { Store, ShieldCheck, AlertCircle, ShoppingBag } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useCartStore, selectMultiStoreCount } from '@/stores/cartStore'
import { MULTI_STORE_SURCHARGE } from '@/config/fees'
import { formatINR } from '@/utils/currency'

/**
 * MultiStoreWarningModal
 *
 * Displays an explicit customer warning when their cart first becomes multi-store.
 * Explains additional store surcharges, multi-stop runner pickups, and combined payment.
 * Acknowledging/dismissing the notice preserves all cart contents.
 */
export function MultiStoreWarningModal() {
  const showWarning = useCartStore((s) => s.showMultiStoreWarning)
  const dismissWarning = useCartStore((s) => s.dismissMultiStoreWarning)
  const storeCount = useCartStore(selectMultiStoreCount)

  const handleOpenChange = (open) => {
    if (!open) {
      dismissWarning()
    }
  }

  return (
    <Dialog open={showWarning} onOpenChange={handleOpenChange}>
      <DialogContent
        title="Multi-Store Order Notice"
        description="Your cart now contains items from multiple campus stores."
        className="max-w-md sm:max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-card border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs sm:text-sm text-ink">
            <Store className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-ink">
                Products from {storeCount || 2} distinct campus stores
              </p>
              <p className="text-ink-muted text-xs mt-0.5">
                Each additional store incurs an additional delivery surcharge of{' '}
                <strong className="text-ink font-semibold">{formatINR(MULTI_STORE_SURCHARGE)}</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs sm:text-sm text-ink-muted">
            <div className="flex items-start gap-2.5">
              <ShoppingBag className="size-4 shrink-0 text-fresh-ink mt-0.5" aria-hidden="true" />
              <span>
                <strong>Separate store pickups:</strong> Your assigned runner will visit each campus store to collect your items before delivering to your location.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <AlertCircle className="size-4 shrink-0 text-brand mt-0.5" aria-hidden="true" />
              <span>
                <strong>Authoritative pricing:</strong> The delivery charge combines the base campus delivery fee with the additional store surcharge.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <ShieldCheck className="size-4 shrink-0 text-accent mt-0.5" aria-hidden="true" />
              <span>
                <strong>Single combined payment:</strong> You only need to pay once for your entire multi-store order with a single handover verification OTP.
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-line/60 flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full sm:w-auto"
              onClick={dismissWarning}
            >
              I Understand & Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
