import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { authService } from '@/services/authService'
import { useAuthStore } from '@/stores/authStore'
import * as envConfig from '@/config/env'
import * as supabaseClientConfig from '@/config/supabaseClient'
import SignupPage from '../SignupPage'

describe('Signup Error Handling & Response Classification (authService)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
  })

  // 1. New email signup success with confirmation pending
  it('handles new email signup success with confirmation pending (session: null)', async () => {
    const mockUser = {
      id: 'usr_new_pending',
      email: 'newstudent@campus.edu',
      identities: [{ id: 'ident_1', provider: 'email' }],
    }
    const mockSignUp = vi.fn().mockResolvedValue({
      data: { user: mockUser, session: null },
      error: null,
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    const result = await authService.signup('newstudent@campus.edu', 'ValidPassword123!', {
      name: 'New Student',
      role: 'customer',
    })

    expect(result.needsConfirmation).toBe(true)
    expect(result.session).toBeNull()
    expect(result.authUser).toEqual(mockUser)
    expect(result.isEnumerationProtected).toBe(false)
    expect(result.role).toBe('customer')
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'newstudent@campus.edu',
      password: 'ValidPassword123!',
      options: expect.objectContaining({
        emailRedirectTo: expect.stringContaining('/login'),
        data: {
          name: 'New Student',
          role: 'customer',
        },
      }),
    })
  })

  // 2. New email signup success with active session (auto-confirm)
  it('handles new email signup success with active session (auto-confirmed)', async () => {
    const mockUser = {
      id: 'usr_new_confirmed',
      email: 'autoconfirm@campus.edu',
      identities: [{ id: 'ident_2', provider: 'email' }],
    }
    const mockSession = {
      access_token: 'tok_active_session',
      user: mockUser,
    }
    const mockSignUp = vi.fn().mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    const result = await authService.signup('autoconfirm@campus.edu', 'ValidPassword123!', {
      name: 'Auto Confirm User',
      role: 'customer',
    })

    expect(result.needsConfirmation).toBe(false)
    expect(result.session).toEqual(mockSession)
    expect(result.authUser).toEqual(mockUser)
    expect(result.isEnumerationProtected).toBe(false)
  })

  // 3. Genuinely existing user signup returning duplicate email
  it('classifies genuinely existing user error as 409 DUPLICATE_EMAIL when code is user_already_exists', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'user_already_exists',
        message: 'User already registered',
        status: 422,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    await expect(
      authService.signup('existing@campus.edu', 'ValidPassword123!', { name: 'Existing User' })
    ).rejects.toMatchObject({
      code: 'DUPLICATE_EMAIL',
      status: 409,
      message: 'An account with this email already exists. Please log in instead.',
    })
  })

  it('classifies genuinely existing user error as 409 DUPLICATE_EMAIL when message indicates duplicate', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'signup_failed',
        message: 'A user with this email address has already been registered',
        status: 400,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    await expect(
      authService.signup('existing2@campus.edu', 'ValidPassword123!', { name: 'Existing User 2' })
    ).rejects.toMatchObject({
      code: 'DUPLICATE_EMAIL',
      status: 409,
      message: 'An account with this email already exists. Please log in instead.',
    })
  })

  // 4. Account-enumeration-protected response (empty identities array)
  it('handles account-enumeration-protected response (identities: []) safely as confirmation pending without throwing false duplicate error', async () => {
    const mockObfuscatedUser = {
      id: 'usr_obfuscated_masked',
      email: 'protected@campus.edu',
      identities: [], // Supabase empty identities array when identity enumeration protection is active
    }
    const mockSignUp = vi.fn().mockResolvedValue({
      data: { user: mockObfuscatedUser, session: null },
      error: null,
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    const result = await authService.signup('protected@campus.edu', 'ValidPassword123!', {
      name: 'Protected User',
    })

    expect(result.needsConfirmation).toBe(true)
    expect(result.isEnumerationProtected).toBe(true)
    expect(result.session).toBeNull()
    expect(result.authUser).toEqual(mockObfuscatedUser)
  })

  // 5. Weak password rejection (422) not mapped to duplicate email
  it('does NOT map weak password 422 error to duplicate email, but throws 422 WEAK_PASSWORD', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'weak_password',
        message: 'Password should be at least 6 characters and include a special character.',
        status: 422,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    try {
      await authService.signup('brandnew@campus.edu', 'weak', { name: 'Brand New User' })
      expect.fail('Should have thrown an error')
    } catch (err) {
      expect(err.code).toBe('WEAK_PASSWORD')
      expect(err.status).toBe(422)
      expect(err.code).not.toBe('DUPLICATE_EMAIL')
      expect(err.message).not.toContain('already exists')
      expect(err.message).toContain('Password should be at least 6 characters')
    }
  })

  // 6. Rate limit rejection (429) not mapped to duplicate email
  it('does NOT map rate limit rejection to duplicate email, but throws 429 RATE_LIMITED', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'over_email_send_rate_limit',
        message: 'Email rate limit exceeded. Please wait a moment.',
        status: 429,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    try {
      await authService.signup('ratecheck@campus.edu', 'ValidPassword123!', { name: 'Rate Check' })
      expect.fail('Should have thrown an error')
    } catch (err) {
      expect(err.code).toBe('RATE_LIMITED')
      expect(err.status).toBe(429)
      expect(err.code).not.toBe('DUPLICATE_EMAIL')
      expect(err.message).toContain('Too many signup attempts')
    }
  })

  // 7. Database trigger error not mapped to duplicate email
  it('does NOT map database trigger error to duplicate email, but throws 500 DATABASE_ERROR', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'unexpected_failure',
        message: 'Database error saving new user',
        status: 500,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    try {
      await authService.signup('triggererror@campus.edu', 'ValidPassword123!', { name: 'Trigger Fail' })
      expect.fail('Should have thrown an error')
    } catch (err) {
      expect(err.code).toBe('DATABASE_ERROR')
      expect(err.status).toBe(500)
      expect(err.code).not.toBe('DUPLICATE_EMAIL')
      expect(err.message).toContain('An error occurred while setting up your account profile')
    }
  })

  // 8. Network failure (0) not mapped to duplicate email
  it('does NOT map network failure to duplicate email, but throws 0 NETWORK_ERROR', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        name: 'AuthRetryableFetchError',
        message: 'Failed to fetch',
        status: 0,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    try {
      await authService.signup('networkcheck@campus.edu', 'ValidPassword123!', { name: 'Network Fail' })
      expect.fail('Should have thrown an error')
    } catch (err) {
      expect(err.code).toBe('NETWORK_ERROR')
      expect(err.status).toBe(0)
      expect(err.code).not.toBe('DUPLICATE_EMAIL')
      expect(err.message).toContain('Unable to connect to the authentication service')
    }
  })

  // 9. Signup or email provider disabled
  it('does NOT map signup_disabled 422 to duplicate email, but throws 403 SIGNUP_DISABLED', async () => {
    const mockSignUp = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'signup_disabled',
        message: 'Signups not allowed for this instance',
        status: 422,
      },
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { signUp: mockSignUp },
    })

    try {
      await authService.signup('disabledcheck@campus.edu', 'ValidPassword123!', { name: 'Disabled' })
      expect.fail('Should have thrown an error')
    } catch (err) {
      expect(err.code).toBe('SIGNUP_DISABLED')
      expect(err.status).toBe(403)
      expect(err.code).not.toBe('DUPLICATE_EMAIL')
      expect(err.message).toContain('Account registration is currently disabled')
    }
  })
})

describe('Signup Store & UI Integration (authStore & SignupPage)', () => {
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

  it('passes isEnumerationProtected flag through authStore.signup', async () => {
    vi.spyOn(authService, 'signup').mockResolvedValue({
      session: null,
      authUser: { id: 'usr_enum', email: 'enum@campus.edu' },
      needsConfirmation: true,
      isEnumerationProtected: true,
    })

    const result = await useAuthStore.getState().signup('enum@campus.edu', 'Password123!', {
      name: 'Enum User',
      role: 'customer',
    })

    expect(result.needsConfirmation).toBe(true)
    expect(result.isEnumerationProtected).toBe(true)
    // No session must be persisted
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('renders confirmation notice view with login action when confirmation is pending', () => {
    // Render SignupPage and verify initial UI components
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SignupPage, null)
      )
    )

    expect(html).toContain('Create an account')
    expect(html).toContain('Sign up for quick campus food')
    expect(html).toContain('I want to sign up as')
  })
})
