import { useState } from 'react'
import { Link } from 'react-router'
import { Bike, CheckCircle2, Clock, Mail, Phone, ShoppingBag, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/components/ui/Toaster'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission, PERMISSIONS } from '@/utils/permissions'

export default function ProfilePage() {
  const userFromHook = useAuthStore((s) => s.user)
  const user = userFromHook ?? useAuthStore.getState().user
  const applyForRunner = useAuthStore((s) => s.applyForRunner)
  const [applying, setApplying] = useState(false)

  const isApprovedRunner = hasPermission(user, PERMISSIONS.RUNNER_DELIVER)
  const isApplicant = user?.runnerStatus === 'applicant' || user?.runnerStatus === 'pending'
  const isSuspended = user?.runnerStatus === 'suspended'

  const handleApply = async () => {
    setApplying(true)
    try {
      await applyForRunner()
      toast.success('Runner application submitted! Our team will review your application.')
    } catch (err) {
      toast.error(err.message || 'Failed to submit application. Please try again.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <h1 className="font-display text-3xl font-bold tracking-display text-ink">My Profile</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Manage your campus account details, delivery modes, and runner status.
      </p>

      {/* Account Details Card */}
      <Card className="mt-6 p-6">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-full bg-brand-soft font-display text-xl font-bold text-fresh-ink">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">{user?.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="brand">Customer</Badge>
              {isApprovedRunner && <Badge tone="brand">Approved Runner</Badge>}
              {isApplicant && <Badge tone="warning">Runner Applicant</Badge>}
              {isSuspended && <Badge tone="danger">Runner Suspended</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-t border-line pt-4 text-sm">
          <div className="flex items-center gap-3 text-ink-muted">
            <Mail className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            <span>{user?.email}</span>
          </div>
          {user?.phone && (
            <div className="flex items-center gap-3 text-ink-muted">
              <Phone className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              <span>{user?.phone}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Mode Switching & Runner Status Card */}
      <Card className="mt-6 p-6">
        <h3 className="font-display text-lg font-bold text-ink">Runner &amp; Delivery Modes</h3>
        <p className="mt-1 text-xs text-ink-muted leading-relaxed">
          The same MartIT account allows you to switch between ordering food as a customer and delivering orders as a runner.
        </p>

        <div className="mt-4">
          {isApprovedRunner ? (
            <div className="rounded-card border border-brand/20 bg-brand-soft/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-fresh-ink" aria-hidden="true" />
                    <p className="font-semibold text-ink">Runner Privileges Active</p>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    You are verified and authorized to accept campus deliveries.
                  </p>
                </div>
                <Button asChild size="sm" variant="primary">
                  <Link to="/runner" id="profile-switch-runner-btn">
                    <Bike className="size-4 mr-1.5" aria-hidden="true" />
                    Switch to Runner Mode
                  </Link>
                </Button>
              </div>
            </div>
          ) : isApplicant ? (
            <div className="rounded-card border border-warning/30 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <Clock className="size-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-ink">Runner Application Pending Review</p>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    Your application to become a campus runner is currently being reviewed by administrators. You can continue placing orders normally as a customer.
                  </p>
                </div>
              </div>
            </div>
          ) : isSuspended ? (
            <div className="rounded-card border border-danger/30 bg-danger/10 p-4">
              <div className="flex items-start gap-3">
                <Bike className="size-5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-danger">Runner Privileges Suspended</p>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    Your runner access is currently suspended. You can still order food and essentials in Customer mode. Please contact the campus support desk if you believe this is an error.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-line bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">Earn by Delivering on Campus</p>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    Deliver food and snacks between campus locations on your own schedule.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={applying}
                  onClick={handleApply}
                >
                  <Bike className="size-4 mr-1.5" aria-hidden="true" />
                  {applying ? 'Applying...' : 'Apply as Runner'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
