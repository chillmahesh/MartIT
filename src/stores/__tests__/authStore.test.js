import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore, resetAuthSubscriptionForTesting } from '../authStore'
import { authService } from '@/services/authService'
import * as envConfig from '@/config/env'
import * as supabaseClientConfig from '@/config/supabaseClient'

describe('Auth Store & Session Lifecycle', () => {
  beforeEach(() => {
    resetAuthSubscriptionForTesting()
    // Reset store state
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: false,
      configError: null,
      isPasswordRecovery: false,
      recoveryEmail: null,
    })
    vi.restoreAllMocks()
  })

  it('initializes in mock mode and preserves demo user if present', async () => {
    useAuthStore.setState({
      token: 'tok_demo',
      user: { id: 'usr_demo', name: 'Demo User', roles: ['customer'] },
    })

    await useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.isInitialized).toBe(true)
    expect(state.configError).toBeNull()
    expect(state.user.id).toBe('usr_demo')
    expect(state.getToken()).toBe('tok_demo')
  })

  it('detects missing Supabase configuration in remote mode without falling back to mock auth', async () => {
    // Simulate remote mode
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'validateSupabaseConfig').mockReturnValue({
      valid: false,
      error: 'Remote API mode is enabled, but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.',
      mode: 'remote',
    })

    await useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.isInitialized).toBe(true)
    expect(state.configError).toContain('Remote API mode is enabled')
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
  })

  it('restores Supabase session and hydrates authoritative profile in remote mode', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'validateSupabaseConfig').mockReturnValue({
      valid: true,
      error: null,
      mode: 'remote',
    })

    const mockSession = {
      access_token: 'jwt_valid_supabase_token',
      user: { id: 'usr_real_cust', email: 'real@campus.edu' },
    }
    const mockProfileUser = {
      id: 'usr_real_cust',
      email: 'real@campus.edu',
      name: 'Real Customer',
      roles: ['customer'],
      runnerStatus: null,
    }

    vi.spyOn(authService, 'getSession').mockResolvedValue(mockSession)
    vi.spyOn(authService, 'me').mockResolvedValue(mockProfileUser)
    vi.spyOn(authService, 'onAuthStateChange').mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })

    await useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.isInitialized).toBe(true)
    expect(state.session).toEqual(mockSession)
    expect(state.token).toBe('jwt_valid_supabase_token')
    expect(state.user).toEqual(mockProfileUser)
    expect(state.hasRole('customer')).toBe(true)
    expect(state.hasRole('admin')).toBe(false)
  })

  it('clears session gracefully if backend me() rejects expired session with 401', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'validateSupabaseConfig').mockReturnValue({
      valid: true,
      error: null,
      mode: 'remote',
    })

    const mockSession = {
      access_token: 'jwt_expired_token',
      user: { id: 'usr_expired' },
    }

    vi.spyOn(authService, 'getSession').mockResolvedValue(mockSession)
    vi.spyOn(authService, 'me').mockRejectedValue({ statusCode: 401, code: 'UNAUTHENTICATED' })
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue(undefined)
    vi.spyOn(authService, 'onAuthStateChange').mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })

    await useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.isInitialized).toBe(true)
    expect(state.session).toBeNull()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(logoutSpy).toHaveBeenCalled()
  })

  it('signs out completely and clears tokens and user state', async () => {
    useAuthStore.setState({
      token: 'jwt_token',
      session: { access_token: 'jwt_token' },
      user: { id: 'usr_1', roles: ['customer'] },
      isInitialized: true,
    })

    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue(undefined)

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
    expect(logoutSpy).toHaveBeenCalled()
  })

  it('handles remote login and hydrates backend roles', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    const mockSession = { access_token: 'jwt_logged_in', user: { id: 'usr_alice' } }
    const mockUser = { id: 'usr_alice', name: 'Alice Cust', roles: ['customer'] }

    vi.spyOn(authService, 'login').mockResolvedValue({ session: mockSession, authUser: mockSession.user })
    vi.spyOn(authService, 'me').mockResolvedValue(mockUser)

    const user = await useAuthStore.getState().login('alice@campus.edu', 'secret1234')

    expect(user).toEqual(mockUser)
    const state = useAuthStore.getState()
    expect(state.token).toBe('jwt_logged_in')
    expect(state.user).toEqual(mockUser)
  })

  it('rejects demoLogin when in remote mode', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(authService, 'demoLogin').mockRejectedValue(new Error('Demo login is only available in mock backend mode.'))

    await expect(useAuthStore.getState().demoLogin('customer')).rejects.toThrow(
      'Demo login is only available in mock backend mode.'
    )
  })

  it('handles remote signup with active session and hydrates profile', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    const mockSession = { access_token: 'jwt_signed_up', user: { id: 'usr_bob' } }
    const mockUser = { id: 'usr_bob', name: 'Bob New', roles: ['customer'] }

    vi.spyOn(authService, 'signup').mockResolvedValue({
      session: mockSession,
      authUser: mockSession.user,
      needsConfirmation: false,
    })
    vi.spyOn(authService, 'me').mockResolvedValue(mockUser)

    const result = await useAuthStore.getState().signup('bob@campus.edu', 'secret1234', { name: 'Bob New' })

    expect(result.needsConfirmation).toBe(false)
    expect(result.user).toEqual(mockUser)
    expect(useAuthStore.getState().token).toBe('jwt_signed_up')
    expect(useAuthStore.getState().user).toEqual(mockUser)
  })

  it('handles remote signup when confirmation is required without persisting false session', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    const mockUser = { id: 'usr_unverified', email: 'pending@campus.edu' }

    vi.spyOn(authService, 'signup').mockResolvedValue({
      session: null,
      authUser: mockUser,
      needsConfirmation: true,
    })

    const result = await useAuthStore.getState().signup('pending@campus.edu', 'secret1234', { name: 'Pending User' })

    expect(result.needsConfirmation).toBe(true)
    expect(result.user).toEqual(mockUser)
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('handles signup database trigger failure gracefully without polluting session state', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    vi.spyOn(authService, 'signup').mockRejectedValue(
      new Error('Database error saving new user')
    )

    await expect(
      useAuthStore.getState().signup('error@campus.edu', 'secret1234', { name: 'Err User' })
    ).rejects.toThrow('Database error saving new user')

    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('triggers forgotPassword flow successfully via authService', async () => {
    const forgotSpy = vi.spyOn(authService, 'forgotPassword').mockResolvedValue({ ok: true })

    const res = await useAuthStore.getState().forgotPassword('reset@campus.edu')
    expect(res).toEqual({ ok: true })
    expect(forgotSpy).toHaveBeenCalledWith('reset@campus.edu')
  })

  it('rejects invalid email addresses in forgotPassword', async () => {
    await expect(
      useAuthStore.getState().forgotPassword('invalid-email-no-at')
    ).rejects.toThrow(/valid email/)
  })

  it('requests password recovery with exact /reset-password redirectTo URL in remote mode', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    const mockReset = vi.fn().mockResolvedValue({ data: {}, error: null })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { resetPasswordForEmail: mockReset },
    })

    const res = await authService.forgotPassword('student@campus.edu')
    expect(res.ok).toBe(true)
    expect(mockReset).toHaveBeenCalledWith(
      'student@campus.edu',
      expect.objectContaining({
        redirectTo: expect.stringMatching(/\/reset-password$/),
      })
    )
  })

  it('handles PASSWORD_RECOVERY event, establishing recovery session without hydrating customer profile', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'validateSupabaseConfig').mockReturnValue({
      valid: true,
      error: null,
      mode: 'remote',
    })

    let authCallback = null
    vi.spyOn(authService, 'getSession').mockResolvedValue(null)
    vi.spyOn(authService, 'onAuthStateChange').mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    const meSpy = vi.spyOn(authService, 'me')

    await useAuthStore.getState().initialize()

    // Trigger PASSWORD_RECOVERY event
    const recoverySession = {
      access_token: 'tok_recovery_token',
      user: { id: 'usr_recovering', email: 'recovery@campus.edu' },
    }
    await authCallback('PASSWORD_RECOVERY', recoverySession)

    const state = useAuthStore.getState()
    expect(state.isPasswordRecovery).toBe(true)
    expect(state.recoveryEmail).toBe('recovery@campus.edu')
    expect(state.session).toEqual(recoverySession)
    expect(state.token).toBe('tok_recovery_token')
    // Crucial: user profile is NOT hydrated; app area access is NOT granted
    expect(state.user).toBeNull()
    expect(meSpy).not.toHaveBeenCalled()
  })

  it('updates password successfully via updateUser and clears recovery state', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    const mockUpdateUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'usr_recovering', email: 'recovery@campus.edu' } },
      error: null,
    })
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: { updateUser: mockUpdateUser },
    })

    useAuthStore.setState({
      token: 'tok_recovery',
      session: { access_token: 'tok_recovery' },
      isPasswordRecovery: true,
      recoveryEmail: 'recovery@campus.edu',
    })

    const res = await useAuthStore.getState().updatePassword('BrandNewPassword123')
    expect(res.ok).toBe(true)
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'BrandNewPassword123' })

    useAuthStore.getState().clearRecoveryState()
    expect(useAuthStore.getState().isPasswordRecovery).toBe(false)
    expect(useAuthStore.getState().recoveryEmail).toBeNull()
  })

  it('validates password length and rejects too-short password in updatePassword', async () => {
    await expect(
      authService.updatePassword('123')
    ).rejects.toThrow(/at least 6 characters/)
  })

  it('propagates Supabase invalid-password or same-password error in updatePassword', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        updateUser: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'SAME_PASSWORD', message: 'New password should be different from the old password.' },
        }),
      },
    })

    await expect(
      useAuthStore.getState().updatePassword('OldPassword123')
    ).rejects.toThrow(/New password cannot be the same/)
  })

  it('handles Supabase invalid login credentials error with specific code and message', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Invalid login credentials', status: 400 },
        }),
      },
    })

    await expect(
      useAuthStore.getState().login('user@campus.edu', 'wrong-pass')
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: expect.stringContaining('Invalid email or password'),
      authStage: 'supabase_auth',
    })

    // User must remain null and token must remain null
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('handles Supabase login success followed by Render network failure (API_UNREACHABLE)', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    const mockSession = { access_token: 'jwt_valid', user: { id: 'usr_valid' } }
    vi.spyOn(authService, 'login').mockResolvedValue({ session: mockSession, authUser: mockSession.user })
    
    // Simulate Render server sleeping or network offline
    vi.spyOn(authService, 'me').mockRejectedValue({
      code: 'API_UNREACHABLE',
      message: 'Unable to reach the MartIT backend server.',
      status: 0,
      statusCode: 0,
    })

    await expect(
      useAuthStore.getState().login('user@campus.edu', 'valid-pass')
    ).rejects.toMatchObject({
      code: 'API_UNREACHABLE',
      authStage: 'profile_hydration',
    })

    const state = useAuthStore.getState()
    // Session was established by Supabase, but user profile is NOT granted
    expect(state.token).toBe('jwt_valid')
    expect(state.user).toBeNull()
    expect(state.hasRole('customer')).toBe(false)
  })

  it('provides safe retry path for profile hydration without granting app access until backend responds', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    // Existing established Supabase session
    useAuthStore.setState({
      token: 'jwt_valid_waiting',
      session: { access_token: 'jwt_valid_waiting' },
      user: null,
    })

    const mockProfileUser = {
      id: 'usr_retried',
      name: 'Recovered User',
      email: 'user@campus.edu',
      roles: ['customer'],
    }
    vi.spyOn(authService, 'me').mockResolvedValue(mockProfileUser)

    const user = await useAuthStore.getState().hydrateProfile()
    expect(user).toEqual(mockProfileUser)
    expect(useAuthStore.getState().user).toEqual(mockProfileUser)
    expect(useAuthStore.getState().hasRole('customer')).toBe(true)
  })

  it('handles Render 401, 5xx, and profile-not-found responses during profile hydration', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)

    // 1. Render 401 (UNAUTHENTICATED) - clears session
    useAuthStore.setState({ token: 'jwt_stale', session: { access_token: 'jwt_stale' }, user: null })
    vi.spyOn(authService, 'me').mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401, statusCode: 401 })
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue(undefined)

    await expect(useAuthStore.getState().hydrateProfile()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      authStage: 'profile_hydration',
    })
    expect(useAuthStore.getState().token).toBeNull()
    expect(logoutSpy).toHaveBeenCalled()

    // 2. Render 500 (DATABASE_ERROR) - does not swallow or grant access
    useAuthStore.setState({ token: 'jwt_500', session: { access_token: 'jwt_500' }, user: null })
    vi.spyOn(authService, 'me').mockRejectedValue({ code: 'DATABASE_ERROR', status: 500, statusCode: 500 })

    await expect(useAuthStore.getState().hydrateProfile()).rejects.toMatchObject({
      code: 'DATABASE_ERROR',
      authStage: 'profile_hydration',
    })
    expect(useAuthStore.getState().user).toBeNull()

    // 3. Render 403 (PROFILE_NOT_FOUND) - does not grant access
    useAuthStore.setState({ token: 'jwt_404', session: { access_token: 'jwt_404' }, user: null })
    vi.spyOn(authService, 'me').mockRejectedValue({ code: 'PROFILE_NOT_FOUND', status: 403, statusCode: 403 })

    await expect(useAuthStore.getState().hydrateProfile()).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      authStage: 'profile_hydration',
    })
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('does not silently fall back to mock mode in remote mode', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    vi.spyOn(supabaseClientConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Invalid login credentials', status: 400 },
        }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'User not found', status: 404 },
        }),
      },
    })

    await expect(
      useAuthStore.getState().login('remote@campus.edu', 'secret')
    ).rejects.toThrow()
    expect(useAuthStore.getState().user).toBeNull()

    await expect(
      useAuthStore.getState().forgotPassword('remote@campus.edu')
    ).rejects.toThrow()
  })

  it('preserves existing mock account login in mock mode', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(true)

    // Demo login for customer
    const user = await useAuthStore.getState().demoLogin('customer')
    expect(user).toBeDefined()
    expect(user.roles).toContain('customer')
    expect(useAuthStore.getState().token).toBeDefined()
    expect(useAuthStore.getState().hasRole('customer')).toBe(true)
  })
})

describe('Signup & Role Selection Enforcement in Auth Store', () => {
  beforeEach(() => {
    resetAuthSubscriptionForTesting()
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: true,
      configError: null,
    })
    vi.restoreAllMocks()
  })

  it('signs up customer and hydrates customer profile', async () => {
    const mockUser = {
      id: 'usr_new_cust',
      email: 'customer@campus.edu',
      name: 'Alice Customer',
      roles: ['customer'],
      runnerStatus: null,
    }
    const mockSession = { access_token: 'jwt_cust_token' }

    vi.spyOn(authService, 'signup').mockResolvedValue({
      session: mockSession,
      authUser: { id: 'usr_new_cust', email: 'customer@campus.edu' },
      needsConfirmation: false,
    })
    vi.spyOn(authService, 'me').mockResolvedValue(mockUser)

    const result = await useAuthStore.getState().signup('customer@campus.edu', 'secret123', {
      name: 'Alice Customer',
      phone: '9876543210',
      role: 'customer',
    })

    expect(result.needsConfirmation).toBe(false)
    expect(result.user).toEqual(mockUser)
    expect(useAuthStore.getState().token).toBe('jwt_cust_token')
    expect(useAuthStore.getState().user).toEqual(mockUser)
    expect(useAuthStore.getState().hasRole('customer')).toBe(true)
    expect(useAuthStore.getState().hasRole('runner')).toBe(false)
  })

  it('signs up runner and hydrates runner applicant profile', async () => {
    const mockApplicant = {
      id: 'usr_new_run',
      email: 'runner@campus.edu',
      name: 'Bob Runner',
      roles: ['customer'],
      runnerStatus: 'applicant',
    }
    const mockSession = { access_token: 'jwt_runner_token' }

    vi.spyOn(authService, 'signup').mockResolvedValue({
      session: mockSession,
      authUser: { id: 'usr_new_run', email: 'runner@campus.edu' },
      needsConfirmation: false,
    })
    vi.spyOn(authService, 'applyRunner').mockResolvedValue(mockApplicant)
    vi.spyOn(authService, 'me').mockResolvedValue(mockApplicant)

    const result = await useAuthStore.getState().signup('runner@campus.edu', 'secret123', {
      name: 'Bob Runner',
      phone: '9876543210',
      role: 'runner',
    })

    expect(result.user).toEqual(mockApplicant)
    expect(useAuthStore.getState().user.runnerStatus).toBe('applicant')
    expect(useAuthStore.getState().hasRole('customer')).toBe(true)
    expect(useAuthStore.getState().hasRole('runner')).toBe(false)
  })

  it('propagates errors when runner application fails during signup', async () => {
    const mockSession = { access_token: 'jwt_runner_token' }

    vi.spyOn(authService, 'signup').mockResolvedValue({
      session: mockSession,
      authUser: { id: 'usr_new_run', email: 'runner@campus.edu' },
      needsConfirmation: false,
    })
    vi.spyOn(authService, 'applyRunner').mockRejectedValue(
      new Error('Failed to submit runner application: Database error')
    )

    await expect(
      useAuthStore.getState().signup('runner@campus.edu', 'secret123', {
        name: 'Bob Runner',
        phone: '9876543210',
        role: 'runner',
      })
    ).rejects.toThrow('Failed to submit runner application: Database error')
  })

  it('submits runner application after login if email confirmation was required during signup', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    const mockSession = { access_token: 'jwt_confirmed_token' }
    const authUser = {
      id: 'usr_confirmed_run',
      email: 'runner@campus.edu',
      user_metadata: { role: 'runner' },
    }
    const initialCustomerProfile = {
      id: 'usr_confirmed_run',
      email: 'runner@campus.edu',
      name: 'Bob Runner',
      roles: ['customer'],
      runnerStatus: null,
    }
    const updatedApplicantProfile = {
      ...initialCustomerProfile,
      runnerStatus: 'applicant',
    }

    vi.spyOn(authService, 'login').mockResolvedValue({
      session: mockSession,
      authUser,
    })
    const meSpy = vi.spyOn(authService, 'me')
      .mockResolvedValueOnce(initialCustomerProfile)
      .mockResolvedValueOnce(updatedApplicantProfile)
    const applySpy = vi.spyOn(authService, 'applyRunner').mockResolvedValue(updatedApplicantProfile)

    const user = await useAuthStore.getState().login('runner@campus.edu', 'secret123')

    expect(applySpy).toHaveBeenCalledTimes(1)
    expect(user.runnerStatus).toBe('applicant')
    expect(user.roles).toEqual(['customer'])
    expect(useAuthStore.getState().hasRole('runner')).toBe(false)
  })

  it('rejects attempted admin signup and prevents privilege escalation', async () => {
    vi.spyOn(authService, 'signup').mockRejectedValue(
      new Error('Public registration cannot assign administrative roles.')
    )

    await expect(
      useAuthStore.getState().signup('hacker@campus.edu', 'secret123', {
        name: 'Hacker',
        role: 'admin',
      })
    ).rejects.toThrow('Public registration cannot assign administrative roles.')

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })
})
