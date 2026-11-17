import { describe, expect, it } from 'vitest'
import {
  isMobilePhone,
  isTablet,
  getDeviceCategory,
} from '@/utils/deviceDetection'

describe('Capability-Based Device Detection (deviceDetection.js)', () => {
  describe('Mobile Phones', () => {
    it('detects Android phones when UA contains both Android and Mobile', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
        platform: 'Linux armv8l',
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(true)
      expect(getDeviceCategory(nav)).toBe('mobile')
    })

    it('detects iPhones from userAgent string', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5,
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(true)
      expect(getDeviceCategory(nav)).toBe('mobile')
    })

    it('detects iPod Touch from userAgent string', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(true)
      expect(getDeviceCategory(nav)).toBe('mobile')
    })

    it('detects mobile phones via navigator.userAgentData.mobile flag when available', () => {
      const nav = {
        userAgentData: { mobile: true },
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(true)
      expect(getDeviceCategory(nav)).toBe('mobile')
    })

    it('detects BlackBerry and Windows Phone legacy mobile devices', () => {
      const navBb = {
        userAgent: 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en) AppleWebKit/534.11+',
      }
      expect(isMobilePhone(navBb)).toBe(true)

      const navWp = {
        userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0; IEMobile/10.0; ARM; Touch)',
      }
      expect(isMobilePhone(navWp)).toBe(true)
    })
  })

  describe('Tablets (Preserves QR-First Experience)', () => {
    it('detects classic iPad user agent as tablet and NOT mobile phone', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        platform: 'iPad',
        maxTouchPoints: 5,
      }
      expect(isTablet(nav)).toBe(true)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('tablet')
    })

    it('detects modern iPadOS (which reports MacIntel with touch points > 1) as tablet', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }
      expect(isTablet(nav)).toBe(true)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('tablet')
    })

    it('detects Android tablets (Android without Mobile in UA) as tablet and NOT phone', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; SM-X906B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        platform: 'Linux aarch64',
      }
      expect(isTablet(nav)).toBe(true)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('tablet')
    })

    it('detects Kindle / Silk tablets as tablet', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (Linux; U; Android 9; en-us; KFTRWI Build/PSR1.180720.117) AppleWebKit/537.36 (KHTML, like Gecko) Silk/95.2.2 like Chrome/95.0.4638.74 Safari/537.36',
      }
      expect(isTablet(nav)).toBe(true)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('tablet')
    })
  })

  describe('Desktop and Laptop Browsers', () => {
    it('detects Windows PC as desktop and NOT mobile phone', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'Win32',
        userAgentData: { mobile: false },
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('desktop')
    })

    it('detects macOS desktop/laptop (MacIntel with 0 touch points) as desktop and NOT mobile', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
        userAgentData: { mobile: false },
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('desktop')
    })

    it('detects Linux PC as desktop', () => {
      const nav = {
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'Linux x86_64',
      }
      expect(isTablet(nav)).toBe(false)
      expect(isMobilePhone(nav)).toBe(false)
      expect(getDeviceCategory(nav)).toBe('desktop')
    })

    it('does not classify narrow desktop browser windows as mobile phones', () => {
      // Desktop UA even if window is narrow
      const nav = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        userAgentData: { mobile: false },
      }
      expect(isMobilePhone(nav)).toBe(false)
    })
  })

  describe('Unknown / Edge Cases / SSR Fallbacks', () => {
    it('handles null or undefined navigator gracefully (returns false and unknown category)', () => {
      expect(isMobilePhone(null)).toBe(false)
      expect(isTablet(null)).toBe(false)
      expect(getDeviceCategory(null)).toBe('unknown')

      expect(isMobilePhone(undefined)).toBe(false)
      expect(isTablet(undefined)).toBe(false)
      expect(getDeviceCategory(undefined)).toBe('unknown')
    })

    it('handles empty navigator object gracefully without throwing', () => {
      const emptyNav = {}
      expect(isMobilePhone(emptyNav)).toBe(false)
      expect(isTablet(emptyNav)).toBe(false)
      expect(getDeviceCategory(emptyNav)).toBe('unknown')
    })
  })
})
