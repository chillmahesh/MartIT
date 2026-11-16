import { useEffect, useRef, useState } from 'react'
import { useThemeStore } from '@/stores/themeStore'

export const SUN_RAYS = [
  { deg: 0,   x1: 78,   y1: 50,   x2: 86,   y2: 50 },
  { deg: 45,  x1: 69.8, y1: 69.8, x2: 75.5, y2: 75.5 },
  { deg: 90,  x1: 50,   y1: 78,   x2: 50,   y2: 86 },
  { deg: 135, x1: 30.2, y1: 69.8, x2: 24.5, y2: 75.5 },
  { deg: 180, x1: 22,   y1: 50,   x2: 14,   y2: 50 },
  { deg: 225, x1: 30.2, y1: 30.2, x2: 24.5, y2: 24.5 },
  { deg: 270, x1: 50,   y1: 22,   x2: 50,   y2: 14 },
  { deg: 315, x1: 69.8, y1: 30.2, x2: 75.5, y2: 24.5 },
]

/**
 * Generates an SVG circular sector path starting precisely at 3 o'clock (angle 0°)
 * and progressing clockwise up to 360°.
 */
export function getSectorPath(cx, cy, r, angleDeg) {
  if (angleDeg <= 0) return ''
  if (angleDeg >= 360) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
  }
  const rad = (angleDeg * Math.PI) / 180
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  const largeArc = angleDeg > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const INTRO_MS = 140
const SWEEP_MS = 680
const OUTRO_MS = 200
const TOTAL_MS = INTRO_MS + SWEEP_MS + OUTRO_MS // 1020ms

export function ThemeTransitionOverlay({
  forceActive,
  forceDirection,
  forceTargetTheme,
  forceSweepAngle,
  forceScale,
  forceOverlayOpacity,
  forceBackdropOpacity,
} = {}) {
  const store = useThemeStore()
  const isTransitioning = forceActive !== undefined ? forceActive : store.isTransitioning
  const transitionDirection = forceDirection || store.transitionDirection
  const targetTheme = forceTargetTheme || store.targetTheme
  const {
    registerOverlay,
    unregisterOverlay,
    commitTheme,
    finishTransition,
  } = store

  // Register overlay presence so themeStore knows the cinematic animation is active
  useEffect(() => {
    registerOverlay()
    return () => unregisterOverlay()
  }, [registerOverlay, unregisterOverlay])

  const [animState, setAnimState] = useState(() => ({
    sweepAngle: forceSweepAngle ?? (forceActive ? 180 : 0),
    scale: forceScale ?? (forceActive ? 1.0 : 0.85),
    overlayOpacity: forceOverlayOpacity ?? (forceActive ? 1.0 : 0),
    backdropOpacity: forceBackdropOpacity ?? (forceActive ? 0.8 : 0),
  }))

  const animFrameRef = useRef(null)
  const committedRef = useRef(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!isTransitioning || !transitionDirection) {
      setAnimState({
        sweepAngle: 0,
        scale: 0.85,
        overlayOpacity: 0,
        backdropOpacity: 0,
      })
      committedRef.current = false
      return
    }

    committedRef.current = false
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

    const step = (now) => {
      const elapsed = Math.max(0, now - startTime)

      // Phase 1: Intro (0 to INTRO_MS)
      let currentScale = 1.0
      let currentBackdrop = 0.5
      let currentSweepAngle = 0
      let currentOverlayOpacity = 1.0

      if (elapsed < INTRO_MS) {
        const introP = elapsed / INTRO_MS
        currentScale = 0.88 + 0.12 * introP
        currentBackdrop = 0.3 + 0.3 * introP
        currentSweepAngle = 0
        currentOverlayOpacity = Math.min(1, introP * 2)
      } else if (elapsed < INTRO_MS + SWEEP_MS) {
        // Phase 2: Clockwise 360-degree sweep (INTRO_MS to INTRO_MS + SWEEP_MS)
        const rawSweep = (elapsed - INTRO_MS) / SWEEP_MS
        const easedSweep = easeInOutCubic(Math.max(0, Math.min(1, rawSweep)))
        currentSweepAngle = easedSweep * 360
        currentScale = 1.0
        currentBackdrop = 0.6 + 0.4 * easedSweep
        currentOverlayOpacity = 1.0
      } else if (elapsed < TOTAL_MS) {
        // Phase 3: Totality reached & Outro fade (INTRO_MS + SWEEP_MS to TOTAL_MS)
        if (!committedRef.current) {
          committedRef.current = true
          commitTheme(targetTheme)
        }
        const outroElapsed = elapsed - (INTRO_MS + SWEEP_MS)
        const outroP = Math.max(0, Math.min(1, outroElapsed / OUTRO_MS))
        currentSweepAngle = 360
        currentScale = 1.0 + 0.08 * outroP
        currentBackdrop = 1.0
        currentOverlayOpacity = 1.0 - outroP
      } else {
        // Completed
        if (!committedRef.current) {
          committedRef.current = true
          commitTheme(targetTheme)
        }
        finishTransition()
        return
      }

      setAnimState({
        sweepAngle: currentSweepAngle,
        scale: currentScale,
        overlayOpacity: currentOverlayOpacity,
        backdropOpacity: currentBackdrop,
      })

      animFrameRef.current = requestAnimationFrame(step)
    }

    animFrameRef.current = requestAnimationFrame(step)

    // Hard fallback timer in case requestAnimationFrame is throttled or paused
    timerRef.current = setTimeout(() => {
      if (!committedRef.current) {
        committedRef.current = true
        commitTheme(targetTheme)
      }
      finishTransition()
    }, TOTAL_MS + 250)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (!committedRef.current && isTransitioning) {
        commitTheme(targetTheme)
      }
    }
  }, [isTransitioning, transitionDirection, targetTheme, commitTheme, finishTransition])

  if (!isTransitioning || !transitionDirection) {
    return null
  }

  const isToDark = transitionDirection === 'to-dark'
  const { sweepAngle, scale, overlayOpacity, backdropOpacity } = animState

  // Destination backdrop colors from MartIT design tokens
  // Dark mode --bg: #0b1410 | Light mode --bg: #f8fafc
  const backdropBg = isToDark ? '#0b1410' : '#f8fafc'

  // Leading edge coordinates for the clockwise sweep
  const rad = (sweepAngle * Math.PI) / 180
  const leadingEdgeRadius = isToDark ? 24.5 : 38
  const leadingX = +(50 + leadingEdgeRadius * Math.cos(rad)).toFixed(2)
  const leadingY = +(50 + leadingEdgeRadius * Math.sin(rad)).toFixed(2)

  // Sector paths
  const darkMoonCoverSector = getSectorPath(50, 50, 24.5, sweepAngle)
  const sunRevealSector = getSectorPath(50, 50, 48, sweepAngle)

  return (
    <div
      data-testid="theme-transition-overlay"
      data-direction={transitionDirection}
      aria-hidden="true"
      className="fixed inset-0 z-[99999] pointer-events-auto flex items-center justify-center select-none overflow-hidden"
      style={{
        opacity: overlayOpacity,
        transition: 'opacity 0.05s linear',
      }}
    >
      {/* Dynamic Backdrop Veil */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{
          backgroundColor: backdropBg,
          opacity: backdropOpacity,
        }}
      />

      {/* Centered Celestial Artwork */}
      <div
        className="relative z-10 flex items-center justify-center transition-transform duration-75"
        style={{
          transform: `scale(${scale})`,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          className="size-44 sm:size-52 md:size-60 drop-shadow-2xl overflow-visible"
        >
          <defs>
            {/* Warm ivory sun glow */}
            <radialGradient id="martitSunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF08A" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#FEF08A" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#FEF08A" stopOpacity="0" />
            </radialGradient>

            {/* Subtle glow filter */}
            <filter id="martitWarmGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Clip path for revealing sun in Dark -> Light */}
            <clipPath id="sunSweepClip">
              <path d={sunRevealSector} />
            </clipPath>
          </defs>

          {isToDark ? (
            /* ========================================================================= */
            /* LIGHT TO DARK: Glowing warm Sun eclipsed clockwise by dark Moon cover    */
            /* ========================================================================= */
            <g id="lightToDarkGroup">
              {/* Sun radial aura */}
              <circle cx="50" cy="50" r="30" fill="url(#martitSunGlow)" />

              {/* Sun Rays: extinguish sequentially as sweep passes their angle */}
              <g id="sunRays">
                {SUN_RAYS.map((ray) => {
                  let rayOpacity = 1
                  if (ray.deg === 0) {
                    rayOpacity = Math.max(0, 1 - sweepAngle / 24)
                  } else if (sweepAngle < ray.deg) {
                    rayOpacity = 1
                  } else {
                    rayOpacity = Math.max(0, 1 - (sweepAngle - ray.deg) / 26)
                  }

                  return (
                    <line
                      key={ray.deg}
                      x1={ray.x1}
                      y1={ray.y1}
                      x2={ray.x2}
                      y2={ray.y2}
                      stroke="#FEF08A"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      filter="url(#martitWarmGlow)"
                      style={{ opacity: rayOpacity }}
                    />
                  )
                })}
              </g>

              {/* Sun Central Body */}
              <circle
                cx="50"
                cy="50"
                r="22"
                stroke="#FEF08A"
                strokeWidth="3.5"
                fill="#FEF08A"
                fillOpacity="0.18"
                filter="url(#martitWarmGlow)"
              />

              {/* Dark Moon Covering Sector: sweeps clockwise from 3 o'clock */}
              {darkMoonCoverSector && (
                <path
                  d={darkMoonCoverSector}
                  fill="#0b1410"
                />
              )}

              {/* Leading Edge Terminator Line */}
              {sweepAngle > 0 && sweepAngle < 360 && (
                <line
                  x1="50"
                  y1="50"
                  x2={leadingX}
                  y2={leadingY}
                  stroke="#334d3d"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}

              {/* Totality lunar details (soft craters visible as eclipse completes) */}
              <g opacity={Math.min(1, Math.max(0, (sweepAngle - 280) / 70))}>
                <circle cx="43" cy="44" r="3.2" fill="#14241b" opacity="0.65" />
                <circle cx="56" cy="42" r="2.2" fill="#14241b" opacity="0.55" />
                <circle cx="48" cy="57" r="3.8" fill="#14241b" opacity="0.65" />
                <circle cx="50" cy="50" r="22" stroke="#223b2d" strokeWidth="1.2" fill="none" />
              </g>
            </g>
          ) : (
            /* ========================================================================= */
            /* DARK TO LIGHT: Dark Moon revealed clockwise into warm radiant Sun        */
            /* ========================================================================= */
            <g id="darkToLightGroup">
              {/* Moon Dark Base Disk */}
              <circle
                cx="50"
                cy="50"
                r="22"
                fill="#0b1410"
                stroke="#1f3629"
                strokeWidth="1.6"
              />
              {/* Moon Base Craters */}
              <circle cx="43" cy="44" r="3.2" fill="#14241b" opacity="0.6" />
              <circle cx="56" cy="42" r="2.2" fill="#14241b" opacity="0.5" />
              <circle cx="48" cy="57" r="3.8" fill="#14241b" opacity="0.6" />

              {/* Sun Group: revealed through 360-degree sector clipPath starting at 3 o'clock */}
              <g clipPath="url(#sunSweepClip)">
                {/* Sun radial aura */}
                <circle cx="50" cy="50" r="30" fill="url(#martitSunGlow)" />

                {/* All 8 glowing rays */}
                {SUN_RAYS.map((ray) => (
                  <line
                    key={ray.deg}
                    x1={ray.x1}
                    y1={ray.y1}
                    x2={ray.x2}
                    y2={ray.y2}
                    stroke="#FEF08A"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    filter="url(#martitWarmGlow)"
                  />
                ))}

                {/* Sun Central Body */}
                <circle
                  cx="50"
                  cy="50"
                  r="22"
                  stroke="#FEF08A"
                  strokeWidth="3.5"
                  fill="#FEF08A"
                  fillOpacity="0.18"
                  filter="url(#martitWarmGlow)"
                />
              </g>

              {/* Leading Radiant Dawn Beam: traveling clockwise along sweep line */}
              {sweepAngle > 0 && sweepAngle < 360 && (
                <line
                  x1="50"
                  y1="50"
                  x2={leadingX}
                  y2={leadingY}
                  stroke="#FEF08A"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  filter="url(#martitWarmGlow)"
                  opacity="0.9"
                />
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
