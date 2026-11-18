import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import * as themeStoreModule from '@/stores/themeStore'
import { useThemeStore } from '@/stores/themeStore'
import {
  ThemeTransitionOverlay,
  getSectorPath,
  easeInOutCubic,
  SUN_RAYS,
  INTRO_MS,
  SWEEP_MS,
  OUTRO_MS,
  TOTAL_MS,
} from '@/components/theme/ThemeTransitionOverlay'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { safeStorage } from '@/utils/storage'

describe('Theme Transition System — Sun to Moon Animated Eclipse', () => {
  const storeMap = new Map()

  beforeEach(() => {
    storeMap.clear()
    globalThis.localStorage = {
      getItem: (key) => storeMap.get(key) ?? null,
      setItem: (key, val) => storeMap.set(key, String(val)),
      removeItem: (key) => storeMap.delete(key),
      clear: () => storeMap.clear(),
    }

    // Provide DOM document and window mocks in Node test environment
    globalThis.document = {
      documentElement: {
        dataset: { theme: 'light' },
      },
    }

    globalThis.window = {
      matchMedia: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    }

    safeStorage.set('martit-theme', 'light')

    // Reset store state
    useThemeStore.setState({
      theme: 'light',
      isTransitioning: false,
      transitionDirection: null,
      targetTheme: null,
      isOverlayMounted: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.document
    delete globalThis.window
    delete globalThis.localStorage
  })

  describe('1. Circular Sector Geometry & 3 O\'Clock Starting Point', () => {
    it('returns an empty string when angle is 0 degrees', () => {
      expect(getSectorPath(50, 50, 25, 0)).toBe('')
      expect(getSectorPath(50, 50, 25, -10)).toBe('')
    })

    it('returns a complete closed circle when angle is 360 degrees or higher', () => {
      const path360 = getSectorPath(50, 50, 25, 360)
      expect(path360).toContain('M 25 50')
      expect(path360).toContain('A 25 25 0 1 0 75 50')
      expect(path360).toContain('A 25 25 0 1 0 25 50 Z')

      const pathOver360 = getSectorPath(50, 50, 25, 375)
      expect(pathOver360).toBe(path360)
    })

    it('starts exactly at 3 o\'clock (cx + r, cy) for any intermediate angle', () => {
      const cx = 50
      const cy = 50
      const r = 24.5

      // At 45 degrees:
      const path45 = getSectorPath(cx, cy, r, 45)
      expect(path45.startsWith(`M ${cx} ${cy} L ${cx + r} ${cy}`)).toBe(true)

      // At 180 degrees:
      const path180 = getSectorPath(cx, cy, r, 180)
      expect(path180.startsWith(`M ${cx} ${cy} L ${cx + r} ${cy}`)).toBe(true)

      // At 270 degrees:
      const path270 = getSectorPath(cx, cy, r, 270)
      expect(path270.startsWith(`M ${cx} ${cy} L ${cx + r} ${cy}`)).toBe(true)
    })

    it('sweeps clockwise: 90° hits 6 o\'clock, 180° hits 9 o\'clock, 270° hits 12 o\'clock', () => {
      const cx = 50
      const cy = 50
      const r = 40

      // 90° = 6 o'clock (x = cx, y = cy + r = 90)
      const path90 = getSectorPath(cx, cy, r, 90)
      expect(path90).toContain('50.000 90.000 Z')
      expect(path90).toContain('0 0 1') // largeArc=0, sweep=1 (clockwise)

      // 180° = 9 o'clock (x = cx - r = 10, y = cy = 50)
      const path180 = getSectorPath(cx, cy, r, 180)
      expect(path180).toContain('10.000 50.000 Z')
      expect(path180).toContain('0 0 1') // largeArc=0, sweep=1

      // 270° = 12 o'clock (x = cx = 50, y = cy - r = 10)
      const path270 = getSectorPath(cx, cy, r, 270)
      expect(path270).toContain('50.000 10.000 Z')
      expect(path270).toContain('0 1 1') // largeArc=1, sweep=1
    })

    it('generates valid non-NaN path coordinates throughout a complete 0 to 360 degree sweep', () => {
      for (let angle = 0; angle <= 360; angle += 15) {
        const path = getSectorPath(50, 50, 24.5, angle)
        expect(path).not.toContain('NaN')
        expect(path).not.toContain('undefined')
      }
    })
  })

  describe('2. Sun Rays Array & 8 Spokes Specifications', () => {
    it('defines exactly 8 evenly spaced rays at 45 degree intervals', () => {
      expect(SUN_RAYS).toHaveLength(8)
      const degrees = SUN_RAYS.map((r) => r.deg)
      expect(degrees).toEqual([0, 45, 90, 135, 180, 225, 270, 315])
    })

    it('positions spokes at the 8 required clock positions', () => {
      const labels = SUN_RAYS.map((r) => r.label)
      expect(labels).toContain('12 o\'clock')
      expect(labels).toContain('1:30')
      expect(labels).toContain('3 o\'clock')
      expect(labels).toContain('4:30')
      expect(labels).toContain('6 o\'clock')
      expect(labels).toContain('7:30')
      expect(labels).toContain('9 o\'clock')
      expect(labels).toContain('10:30')
    })

    it('places 12 o\'clock straight up and 6 o\'clock straight down', () => {
      const ray12 = SUN_RAYS.find((r) => r.label === '12 o\'clock')
      expect(ray12).toBeDefined()
      expect(ray12.x1).toBe(50)
      expect(ray12.x2).toBe(50)
      expect(ray12.y1).toBeLessThan(50)
      expect(ray12.y2).toBeLessThan(ray12.y1)

      const ray6 = SUN_RAYS.find((r) => r.label === '6 o\'clock')
      expect(ray6).toBeDefined()
      expect(ray6.x1).toBe(50)
      expect(ray6.x2).toBe(50)
      expect(ray6.y1).toBeGreaterThan(50)
      expect(ray6.y2).toBeGreaterThan(ray6.y1)
    })

    it('places 3 o\'clock straight right and 9 o\'clock straight left', () => {
      const ray3 = SUN_RAYS.find((r) => r.label === '3 o\'clock')
      expect(ray3).toBeDefined()
      expect(ray3.y1).toBe(50)
      expect(ray3.y2).toBe(50)
      expect(ray3.x1).toBeGreaterThan(50)
      expect(ray3.x2).toBeGreaterThan(ray3.x1)

      const ray9 = SUN_RAYS.find((r) => r.label === '9 o\'clock')
      expect(ray9).toBeDefined()
      expect(ray9.y1).toBe(50)
      expect(ray9.y2).toBe(50)
      expect(ray9.x1).toBeLessThan(50)
      expect(ray9.x2).toBeLessThan(ray9.x1)
    })

    it('maintains uniform spoke length and prevents collision with sun outline', () => {
      // Sun outline radius = 19, strokeWidth = 3.2 -> outer edge is 20.6
      const sunOuterRadius = 20.6

      SUN_RAYS.forEach((ray) => {
        const length = Math.hypot(ray.x2 - ray.x1, ray.y2 - ray.y1)
        // Consistent prominent ray length ~14.0 units
        expect(length).toBeCloseTo(14.0, 1)

        // Distance from center to ray start is 26.0 units (clear 5.4 unit gap from sun body)
        const startDist = Math.hypot(ray.x1 - 50, ray.y1 - 50)
        expect(startDist).toBeCloseTo(26.0, 1)
        expect(startDist).toBeGreaterThan(sunOuterRadius + 4)

        // Distance from center to ray end is 40.0 units
        const endDist = Math.hypot(ray.x2 - 50, ray.y2 - 50)
        expect(endDist).toBeCloseTo(40.0, 1)
      })
    })

    it('ensures diagonal spokes (1:30, 4:30, 7:30, 10:30) are clearly spaced and do not collide', () => {
      const diagonals = ['1:30', '4:30', '7:30', '10:30']
      diagonals.forEach((label) => {
        const ray = SUN_RAYS.find((r) => r.label === label)
        expect(ray).toBeDefined()
        const startDist = Math.hypot(ray.x1 - 50, ray.y1 - 50)
        expect(startDist).toBeCloseTo(26.0, 1)
        const length = Math.hypot(ray.x2 - ray.x1, ray.y2 - ray.y1)
        expect(length).toBeCloseTo(14.0, 1)
      })
    })
  })

  describe('3. Easing Function & 0.75x Animation Speed Refinement', () => {
    it('starts at 0 and ends at 1 with symmetry at 0.5', () => {
      expect(easeInOutCubic(0)).toBe(0)
      expect(easeInOutCubic(1)).toBe(1)
      expect(easeInOutCubic(0.5)).toBe(0.5)
    })

    it('is strictly monotonic over the [0, 1] range', () => {
      let previous = -1
      for (let t = 0; t <= 1; t += 0.05) {
        const value = easeInOutCubic(t)
        expect(value).toBeGreaterThanOrEqual(previous)
        previous = value
      }
    })

    it('multiplies durations by 1.3333 (0.75x playback speed) consistently across phases', () => {
      // Baseline durations before 0.75x speed refinement:
      // INTRO: 140ms, SWEEP: 680ms, OUTRO: 200ms, TOTAL: 1020ms
      expect(INTRO_MS).toBe(Math.round(140 * 1.3333))
      expect(SWEEP_MS).toBe(Math.round(680 * 1.3333))
      expect(OUTRO_MS).toBe(Math.round(200 * 1.3333))
      expect(TOTAL_MS).toBe(INTRO_MS + SWEEP_MS + OUTRO_MS)
      expect(TOTAL_MS).toBeGreaterThan(1300)
    })
  })

  describe('4. Theme Store Lifecycle & Protection', () => {
    it('initializes with current document or storage theme', () => {
      expect(useThemeStore.getState().theme).toBe('light')
      expect(useThemeStore.getState().isTransitioning).toBe(false)
    })

    it('triggers transition when overlay is mounted and target theme differs', () => {
      const store = useThemeStore.getState()
      store.registerOverlay()

      store.setTheme('dark')

      const state = useThemeStore.getState()
      expect(state.isTransitioning).toBe(true)
      expect(state.transitionDirection).toBe('to-dark')
      expect(state.targetTheme).toBe('dark')
    })

    it('ignores clicks while transition is already active (rapid click protection)', () => {
      const store = useThemeStore.getState()
      store.registerOverlay()

      store.setTheme('dark')
      expect(useThemeStore.getState().isTransitioning).toBe(true)

      // Attempt rapid second click while transitioning
      store.setTheme('light')

      // Should remain transitioning to dark, ignoring the conflicting click
      expect(useThemeStore.getState().isTransitioning).toBe(true)
      expect(useThemeStore.getState().transitionDirection).toBe('to-dark')
      expect(useThemeStore.getState().targetTheme).toBe('dark')
    })

    it('commits theme to DOM dataset, localStorage, and store state at totality', () => {
      const store = useThemeStore.getState()
      store.registerOverlay()
      store.setTheme('dark')

      // Totality is reached: commitTheme executes
      store.commitTheme('dark')

      expect(useThemeStore.getState().theme).toBe('dark')
      expect(globalThis.document.documentElement.dataset.theme).toBe('dark')
      expect(safeStorage.get('martit-theme')).toBe('dark')
    })

    it('resets transitioning state upon finishTransition', () => {
      const store = useThemeStore.getState()
      store.registerOverlay()
      store.setTheme('dark')
      store.commitTheme('dark')

      store.finishTransition()

      const state = useThemeStore.getState()
      expect(state.isTransitioning).toBe(false)
      expect(state.transitionDirection).toBe(null)
      expect(state.targetTheme).toBe(null)
      expect(state.theme).toBe('dark')
    })

    it('executes reverse transition to-light cleanly', () => {
      useThemeStore.setState({
        theme: 'dark',
        isOverlayMounted: true,
      })
      globalThis.document.documentElement.dataset.theme = 'dark'

      const store = useThemeStore.getState()
      store.setTheme('light')

      expect(useThemeStore.getState().isTransitioning).toBe(true)
      expect(useThemeStore.getState().transitionDirection).toBe('to-light')
      expect(useThemeStore.getState().targetTheme).toBe('light')

      store.commitTheme('light')
      store.finishTransition()

      expect(useThemeStore.getState().theme).toBe('light')
      expect(globalThis.document.documentElement.dataset.theme).toBe('light')
      expect(safeStorage.get('martit-theme')).toBe('light')
    })

    it('bypasses transition immediately when prefers-reduced-motion is true', () => {
      globalThis.window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const store = useThemeStore.getState()
      store.registerOverlay()

      store.setTheme('dark')

      // Should be committed immediately with NO transition
      expect(useThemeStore.getState().isTransitioning).toBe(false)
      expect(useThemeStore.getState().theme).toBe('dark')
      expect(globalThis.document.documentElement.dataset.theme).toBe('dark')
      expect(safeStorage.get('martit-theme')).toBe('dark')
    })

    it('applies theme immediately if overlay is not mounted (SSR/unit-test resilience)', () => {
      useThemeStore.setState({
        isOverlayMounted: false,
        theme: 'light',
      })

      const store = useThemeStore.getState()
      store.setTheme('dark')

      expect(useThemeStore.getState().isTransitioning).toBe(false)
      expect(useThemeStore.getState().theme).toBe('dark')
      expect(globalThis.document.documentElement.dataset.theme).toBe('dark')
    })
  })

  describe('5. ThemeToggle Button Accessibility & State', () => {
    it('renders with appropriate accessible label in light mode', () => {
      useThemeStore.setState({ theme: 'light', isTransitioning: false })
      const html = renderToString(React.createElement(ThemeToggle))
      expect(html).toContain('aria-label="Switch to dark mode"')
      expect(html).not.toContain('disabled=""')
      expect(html).toContain('aria-busy="false"')
    })

    it('renders with disabled and aria-busy attributes during active transition', () => {
      useThemeStore.setState({
        theme: 'light',
        isTransitioning: true,
        transitionDirection: 'to-dark',
      })

      // Spy on store hook for renderToString in Node environment
      vi.spyOn(themeStoreModule, 'useThemeStore').mockImplementation((selector) => {
        const state = useThemeStore.getState()
        return selector ? selector(state) : state
      })

      const html = renderToString(React.createElement(ThemeToggle))
      expect(html).toContain('disabled=""')
      expect(html).toContain('aria-busy="true"')
      expect(html).toContain('Switch to dark mode')
    })
  })

  describe('6. ThemeTransitionOverlay Component Markup', () => {
    it('returns null when transition is not active', () => {
      useThemeStore.setState({ isTransitioning: false, transitionDirection: null })
      const html = renderToString(React.createElement(ThemeTransitionOverlay))
      expect(html).toBe('')
    })

    it('renders full-screen overlay with sun rays and dark moon cover in to-dark mode', () => {
      useThemeStore.setState({
        isTransitioning: true,
        transitionDirection: 'to-dark',
        targetTheme: 'dark',
      })

      // Spy on store hook for renderToString in Node environment
      vi.spyOn(themeStoreModule, 'useThemeStore').mockImplementation((selector) => {
        const state = useThemeStore.getState()
        return selector ? selector(state) : state
      })

      const html = renderToString(
        React.createElement(ThemeTransitionOverlay, {
          forceActive: true,
          forceDirection: 'to-dark',
          forceTargetTheme: 'dark',
        })
      )
      expect(html).toContain('data-testid="theme-transition-overlay"')
      expect(html).toContain('data-direction="to-dark"')
      expect(html).toContain('id="lightToDarkGroup"')
      expect(html).toContain('id="sunRays"')
      expect(html).toContain('filter="url(#martitWarmGlow)"')
      expect(html).toContain('filterUnits="userSpaceOnUse"')
      expect(html).toContain('id="martitSunGlow"')

      // Verify all 4 cardinal spokes are present
      expect(html).toContain('x1="50" y1="24" x2="50" y2="10"') // 12 o'clock
      expect(html).toContain('x1="76" y1="50" x2="90" y2="50"') // 3 o'clock
      expect(html).toContain('x1="50" y1="76" x2="50" y2="90"') // 6 o'clock
      expect(html).toContain('x1="24" y1="50" x2="10" y2="50"') // 9 o'clock

      // Verify all 4 diagonal spokes are present
      expect(html).toContain('x1="68.38" y1="31.62" x2="78.28" y2="21.72"') // 1:30
      expect(html).toContain('x1="68.38" y1="68.38" x2="78.28" y2="78.28"') // 4:30
      expect(html).toContain('x1="31.62" y1="68.38" x2="21.72" y2="78.28"') // 7:30
      expect(html).toContain('x1="31.62" y1="31.62" x2="21.72" y2="21.72"') // 10:30
    })

    it('renders full-screen overlay with moon disk and sun sweep clipPath in to-light mode', () => {
      useThemeStore.setState({
        isTransitioning: true,
        transitionDirection: 'to-light',
        targetTheme: 'light',
      })

      // Spy on store hook for renderToString in Node environment
      vi.spyOn(themeStoreModule, 'useThemeStore').mockImplementation((selector) => {
        const state = useThemeStore.getState()
        return selector ? selector(state) : state
      })

      const html = renderToString(
        React.createElement(ThemeTransitionOverlay, {
          forceActive: true,
          forceDirection: 'to-light',
          forceTargetTheme: 'light',
        })
      )
      expect(html).toContain('data-testid="theme-transition-overlay"')
      expect(html).toContain('data-direction="to-light"')
      expect(html).toContain('id="darkToLightGroup"')
      expect(html).toContain('clip-path="url(#sunSweepClip)"')
    })
  })
})
