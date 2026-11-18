import { create } from 'zustand'
import { safeStorage } from '@/utils/storage'

const KEY = 'martit-theme'

const current = () => {
  if (typeof document === 'undefined') return 'light'
  if (document.documentElement?.dataset?.theme === 'dark') return 'dark'
  if (document.documentElement?.dataset?.theme === 'light') return 'light'
  try {
    const saved = safeStorage.get(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {}
  return 'light'
}

function apply(theme) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = theme
  }
  safeStorage.set(KEY, theme)
}

export const useThemeStore = create((set, get) => ({
  theme: typeof document === 'undefined' ? 'light' : current(),
  isTransitioning: false,
  transitionDirection: null,
  targetTheme: null,
  isOverlayMounted: false,

  registerOverlay() {
    set({ isOverlayMounted: true })
  },

  unregisterOverlay() {
    set({ isOverlayMounted: false })
  },

  /**
   * Triggers a theme change.
   * If overlay is mounted and motion is allowed, starts cinematic transition.
   * Otherwise applies instantly.
   */
  setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return
    const { isTransitioning, theme: currentTheme, isOverlayMounted } = get()
    if (isTransitioning || theme === currentTheme) return

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // If reduced motion is requested or no overlay is mounted, commit instantly
    if (prefersReducedMotion || !isOverlayMounted) {
      apply(theme)
      set({
        theme,
        isTransitioning: false,
        transitionDirection: null,
        targetTheme: null,
      })
      return
    }

    // Start cinematic sun-to-moon transition
    set({
      isTransitioning: true,
      transitionDirection: theme === 'dark' ? 'to-dark' : 'to-light',
      targetTheme: theme,
    })
  },

  commitTheme(targetTheme) {
    const next = targetTheme || get().targetTheme
    if (next) {
      apply(next)
      set({ theme: next })
    }
  },

  finishTransition() {
    set({
      isTransitioning: false,
      transitionDirection: null,
      targetTheme: null,
    })
  },
}))
