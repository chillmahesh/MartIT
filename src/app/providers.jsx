import { lazy, Suspense, useEffect, useState } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router'
import { SmoothScroll } from '@/components/layout/SmoothScroll'
import { CustomCursor } from '@/components/layout/CustomCursor'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'
import { toast } from '@/components/ui/Toaster'
import { MultiStoreWarningModal } from '@/components/cart/MultiStoreWarningModal'
import { ThemeTransitionOverlay } from '@/components/theme/ThemeTransitionOverlay'
import { targetPathForAuthed } from '@/app/RouteGuards'
import { whenIdle } from '@/utils/idle'

// Toast UI isn't needed for first paint; mount it once the browser is idle.
const Toaster = lazy(() => import('@/components/ui/Toaster').then((mod) => ({ default: mod.Toaster })))

function DeferredToaster() {
  const [ready, setReady] = useState(false)
  useEffect(() => whenIdle(() => setReady(true)), [])
  return ready ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null
}

const loadMotionFeatures = () => import('@/utils/motionFeatures').then((mod) => mod.default)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

/** Re-validates a persisted session with the server on load; clears it if rejected. */
function SessionCheck() {
  const initialize = useAuthStore((s) => s.initialize)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const activeMode = useAuthStore((s) => s.activeMode)
  const navigate = useNavigate()
  const location = useLocation()

  // Track if this initial page visit was an OAuth redirect
  const [isOAuthCallback] = useState(() => {
    if (typeof window === 'undefined') return false
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    return hash.includes('access_token=') || search.includes('code=')
  })

  useEffect(() => {
    initialize()
  }, [initialize])

  const { data, error } = useQuery({
    queryKey: ['me', token],
    queryFn: authService.me,
    enabled: Boolean(token),
    retry: false,
  })
  useEffect(() => {
    if (data) useAuthStore.setState({ user: data })
    if (error?.status === 401) useAuthStore.setState({ token: null, user: null })
  }, [data, error])

  // Handle post-OAuth routing if user arrived via OAuth callback on root/landing route
  useEffect(() => {
    if (isOAuthCallback && user && location.pathname === '/') {
      const destination = targetPathForAuthed(user, activeMode)
      navigate(destination, { replace: true })
    }
  }, [isOAuthCallback, user, activeMode, location.pathname, navigate])

  // Also handle OAuth error in hash if present
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('error=')) {
      const params = new URLSearchParams(window.location.hash.substring(1))
      const errorDesc = params.get('error_description') || params.get('error')
      if (errorDesc) {
        toast.error(decodeURIComponent(errorDesc.replace(/\+/g, ' ')))
      }
    }
  }, [])

  return null
}

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user": Motion drops transform animations when the OS asks for reduced motion */}
      {/* `strict`: components must use `m.*` so the full `motion` bundle never sneaks back in */}
      <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <SmoothScroll>
          <SessionCheck />
          {children}
          <MultiStoreWarningModal />
          <ThemeTransitionOverlay />
          <DeferredToaster />
          <CustomCursor />
        </SmoothScroll>
      </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  )
}
