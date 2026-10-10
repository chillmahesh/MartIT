import { lazy, Suspense, useEffect, useState } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { SmoothScroll } from '@/components/layout/SmoothScroll'
import { CustomCursor } from '@/components/layout/CustomCursor'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'
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
          <DeferredToaster />
          <CustomCursor />
        </SmoothScroll>
      </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  )
}
