import { Link } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { useAuthStore } from '@/stores/authStore'

const COPY = {
  runner: {
    title: 'Runner access is by approval',
    body: "Runner accounts require MartIT team verification before accepting deliveries. If you registered as a runner, your application is currently under review and we'll let you know once you're approved.",
  },
  admin: { title: 'Admins only', body: 'The admin console is for the MartIT team. Admin access is granted by a super admin.' },
  customer: { title: 'Not available for this account', body: 'This area needs a customer account.' },
}

export function ForbiddenPage({ role }) {
  const userFromHook = useAuthStore((s) => s.user)
  const user = userFromHook ?? useAuthStore.getState().user

  let copy = COPY[role] ?? COPY.customer
  if (role === 'runner') {
    if (user?.runnerStatus === 'applicant' || user?.runnerStatus === 'pending') {
      copy = {
        title: 'Runner application pending',
        body: 'Your runner application has been received and is currently under review by campus administrators. In the meantime, you can browse stores and place orders in customer mode.',
      }
    } else if (user?.runnerStatus === 'suspended') {
      copy = {
        title: 'Runner access suspended',
        body: 'Your runner delivery privileges are currently suspended. Please contact platform administrators for assistance. You can still use customer mode to place orders.',
      }
    } else if (user?.roles?.includes('runner') && user?.runnerStatus !== 'approved') {
      copy = {
        title: 'Runner role unapproved',
        body: 'Your account has the runner role assigned in the database, but your profile status is unapproved (runner_status is missing or not approved). An administrator must approve your runner status in the profiles table before delivery access is granted.',
      }
    }
  }

  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-lg content-center px-4 py-16">
      <Link to="/" aria-label="MartIT home" className="mb-10 w-fit rounded-tile">
        <Logo />
      </Link>
      <span className="grid size-14 place-items-center rounded-card bg-warning-soft text-warning">
        <ShieldAlert className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 font-display text-4xl font-bold tracking-display">{copy.title}</h1>
      <p className="mt-3 text-ink-muted">{copy.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/app">Go to shopping</Link>
        </Button>
        {role === 'admin' && (
          <Button asChild variant="outline">
            <Link to="/admin/login">Admin login</Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link to="/">Home</Link>
        </Button>
      </div>
    </main>
  )
}
