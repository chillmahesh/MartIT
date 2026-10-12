import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'
import { authService } from '@/services/authService'
import * as envConfig from '@/config/env'
import * as supabaseClientConfig from '@/config/supabaseClient'

describe('Auth Store & Session Lifecycle', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      token: null,
      session: null,
      user: null,
      isInitialized: false,
      configError: null,
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
})
