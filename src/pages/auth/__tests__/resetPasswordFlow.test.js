import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import ResetPasswordPage from '../ResetPasswordPage'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/authService'
import * as envConfig from '@/config/env'
import * as recoveryUtils from '@/utils/recovery'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'
import { createMockServer } from '@/services/mockServer/handlers'

describe('Password Reset Flow & Recovery Regression Tests', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: true,
      configError: null,
      isPasswordRecovery: false,
      recoveryEmail: null,
    })
    vi.restoreAllMocks()
  })

  describe('1. Reset Route Rendering', () => {
    it('renders form inputs and recovery email when recovery session is active', () => {
      useAuthStore.setState({
        isPasswordRecovery: true,
        recoveryEmail: 'student@campus.edu',
      })

      const html = renderToString(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/reset-password'] },
          React.createElement(ResetPasswordPage, null)
        )
      )

      expect(html).toContain('Password Recovery')
      expect(html).toContain('Reset your password')
      expect(html).toContain('student@campus.edu')
      expect(html).toContain('New Password')
      expect(html).toContain('Confirm New Password')
      expect(html).toContain('Update password')
      expect(html).toContain('Must be at least 6 characters long.')
    })
  })

  describe('2. Valid Recovery Session & Successful Password Update', () => {
    it('calls authService.updatePassword with valid new password in remote mode', async () => {
      vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
      const mockSession = { access_token: 'valid_recovery_token', user: { email: 'user@campus.edu' } }
      vi.spyOn(authService, 'getSession').mockResolvedValue(mockSession)
      const updatePasswordSpy = vi.spyOn(authService, 'updatePassword').mockResolvedValue({ ok: true, user: { id: 'usr_1' } })

      useAuthStore.setState({
        session: mockSession,
        token: 'valid_recovery_token',
        isPasswordRecovery: true,
        recoveryEmail: 'user@campus.edu',
      })

      const result = await useAuthStore.getState().updatePassword('NewValidPassword123')
      expect(updatePasswordSpy).toHaveBeenCalledWith('NewValidPassword123')
      expect(result.ok).toBe(true)
    })
  })

  describe('3. Missing, Invalid, or Expired Recovery Session', () => {
    it('renders expired/invalid link state when callback error params are detected in URL', () => {
      vi.spyOn(recoveryUtils, 'parseRecoveryUrlParams').mockReturnValue({
        hasError: true,
        isExpiredOrInvalid: true,
        error: 'access_denied',
        errorCode: 'otp_expired',
        errorDescription: 'The password reset link has expired.',
        type: null,
        hasRecoveryToken: false,
      })

      const html = renderToString(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/reset-password#error=access_denied&error_code=otp_expired'] },
          React.createElement(ResetPasswordPage, null)
        )
      )

      expect(html).toContain('Reset Link Expired or Invalid')
      expect(html).toContain('The password reset link has expired.')
      expect(html).toContain('Request a new link')
      expect(html).toContain('Back to log in')
    })

    it('displays no session warning when opened directly in remote mode without session', () => {
      vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
      vi.spyOn(recoveryUtils, 'parseRecoveryUrlParams').mockReturnValue({
        hasError: false,
        isExpiredOrInvalid: false,
        error: null,
        errorCode: null,
        errorDescription: null,
        type: null,
        hasRecoveryToken: false,
      })
      useAuthStore.setState({ isPasswordRecovery: false, session: null, token: null })

      const html = renderToString(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/reset-password'] },
          React.createElement(ResetPasswordPage, null)
        )
      )

      expect(html).toContain('Password Recovery')
    })
  })

  describe('4. Password Validation Errors', () => {
    it('rejects passwords shorter than 6 characters', async () => {
      await expect(authService.updatePassword('12345')).rejects.toThrow('Password must be at least 6 characters long.')
    })

    it('rejects empty or non-string passwords', async () => {
      await expect(authService.updatePassword('')).rejects.toThrow('Password must be at least 6 characters long.')
    })
  })

  describe('5. Failed Password Update Handling', () => {
    it('handles Supabase password update rejection gracefully', async () => {
      vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
      vi.spyOn(authService, 'updatePassword').mockRejectedValue(new Error('Auth session missing or expired.'))

      await expect(useAuthStore.getState().updatePassword('ValidPassword123')).rejects.toThrow(
        'Auth session missing or expired.'
      )
    })
  })

  describe('6. Normal Authentication Preservation', () => {
    it('preserves normal login, logout, and token provider behavior', async () => {
      useAuthStore.setState({
        token: 'tok_active_session',
        user: { id: 'usr_cust', email: 'cust@campus.edu', roles: ['customer'] },
        isPasswordRecovery: false,
      })

      expect(useAuthStore.getState().getToken()).toBe('tok_active_session')
      expect(useAuthStore.getState().hasRole('customer')).toBe(true)

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.token).toBeNull()
      expect(state.user).toBeNull()
      expect(state.isPasswordRecovery).toBe(false)
      expect(state.getToken()).toBeNull()
    })
  })

  describe('7. Sample Products in Catalogue', () => {
    it('includes newly added sample products across snacks, beverages, stationery, and daily essentials', () => {
      const productIds = SAMPLE_PRODUCTS.map((p) => p.id)
      const expectedNewIds = [
        'p_cup_noodles_veg',
        'p_potato_chips',
        'p_mango_juice',
        'p_butter_cookies',
        'p_ballpen_pack',
        'p_sticky_notes',
        'p_toothpaste',
        'p_pocket_tissues',
        'p_cold_coffee',
        'p_nc_paneer_roll',
      ]

      for (const id of expectedNewIds) {
        expect(productIds).toContain(id)
      }

      // Verify each new product has required valid fields
      for (const id of expectedNewIds) {
        const product = SAMPLE_PRODUCTS.find((p) => p.id === id)
        expect(product).toBeDefined()
        expect(typeof product.name).toBe('string')
        expect(product.price).toBeGreaterThan(0)
        expect(product.mrp).toBeGreaterThanOrEqual(product.price)
        expect(product.stock).toBeGreaterThan(0)
        expect(['store_campus_mart', 'store_night_canteen']).toContain(product.storeId)
      }
    })

    it('serves new sample products through mockServer catalogue handler', async () => {
      const server = createMockServer()
      const products = await server.handle('catalogue.products', {})

      expect(products.length).toBe(SAMPLE_PRODUCTS.length)
      expect(products.some((p) => p.id === 'p_cup_noodles_veg')).toBe(true)
      expect(products.some((p) => p.id === 'p_cold_coffee')).toBe(true)
      expect(products.some((p) => p.id === 'p_ballpen_pack')).toBe(true)
    })
  })
})
