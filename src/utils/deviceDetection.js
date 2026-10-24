/**
 * Capability-based device detection for MartIT.
 *
 * Distinguishes mobile phones from tablets, desktops, and laptops:
 * - Mobile phones: Mobile-oriented devices supported for UPI deep-link apps.
 * - Tablets: iPads, Android tablets, etc. (Preserves QR-first experience).
 * - Desktops/Laptops: Windows, macOS, Linux PCs (Preserves QR-first experience).
 *
 * Does not rely solely on viewport width or CSS media queries, because desktop browsers
 * can have narrow windows and tablets can have wide screens.
 */
import { useState, useEffect } from 'react'

/**
 * Checks whether a given navigator represents a mobile phone.
 *
 * @param {Navigator|null} [nav] - Optional navigator object (defaults to global navigator)
 * @returns {boolean} True if identified as a mobile phone, false otherwise
 */
export function isMobilePhone(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false

  // 1. Tablet check first (tablets must be excluded from phone-only UPI button)
  if (isTablet(nav)) {
    return false
  }

  // 2. High-confidence userAgentData check if available
  if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean') {
    if (nav.userAgentData.mobile) {
      return true
    }
    // If userAgentData explicitly says mobile: false, it is a desktop/laptop
    return false
  }

  // 3. User Agent string analysis
  const ua = (nav.userAgent || '').toLowerCase()
  if (!ua) return false

  // Mobile phone specific patterns
  // Note: Android phones have "Android" AND "Mobile". Android tablets have "Android" WITHOUT "Mobile".
  const isIPhoneOrIPod = /iphone|ipod/.test(ua)
  const isAndroidPhone = /android.*mobile|mobile.*android/.test(ua)
  const isOtherPhone = /blackberry|iemobile|opera mini|windows phone|wpdesktop/.test(ua)

  return isIPhoneOrIPod || isAndroidPhone || isOtherPhone
}

/**
 * Checks whether a given navigator represents a tablet.
 *
 * @param {Navigator|null} [nav] - Optional navigator object
 * @returns {boolean} True if identified as a tablet
 */
export function isTablet(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false

  // If client hints explicitly designate mobile phone (Chromium: mobile === true for phones, false for tablets/desktops), it is not a tablet
  if (nav.userAgentData && nav.userAgentData.mobile === true) {
    return false
  }

  const ua = (nav.userAgent || '').toLowerCase()

  // iPad on iOS 13+ reports as MacIntel with touch points > 1
  const isIPadOS =
    nav.platform === 'MacIntel' &&
    typeof nav.maxTouchPoints === 'number' &&
    nav.maxTouchPoints > 1

  // Classic iPad UA
  const isIPad = /ipad/.test(ua)

  // Android tablet: contains "android" but NOT "mobile"
  const isAndroidTablet = /android/.test(ua) && !/mobile/.test(ua)

  // Other known tablet identifiers
  const isOtherTablet = /tablet|silk|playbook|kindle/.test(ua)

  return isIPadOS || isIPad || isAndroidTablet || isOtherTablet
}

/**
 * Returns broad device category: 'mobile' | 'tablet' | 'desktop' | 'unknown'.
 *
 * @param {Navigator|null} [nav]
 * @returns {'mobile'|'tablet'|'desktop'|'unknown'}
 */
export function getDeviceCategory(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return 'unknown'
  if (isTablet(nav)) return 'tablet'
  if (isMobilePhone(nav)) return 'mobile'

  const ua = (nav.userAgent || '').toLowerCase()
  if (/windows|macintosh|linux|cros/.test(ua) || nav.userAgentData?.mobile === false) {
    return 'desktop'
  }

  return 'unknown'
}

/**
 * React hook to reactively detect mobile phones without SSR hydration mismatch.
 *
 * @returns {boolean}
 */
export function useIsMobilePhone() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isMobilePhone())
  }, [])

  return isMobile
}
