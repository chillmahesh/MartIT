import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authService } from '../authService'
import * as envConfig from '@/config/env'
import * as supabaseModule from '@/config/supabaseClient'

describe('authService.signup - Error Classification & Registration Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Input validation & privilege escalation defense', () => {
    it('rejects attempted admin signup with 403 PRIVILEGE_ESCALATION_FORBIDDEN', async () => {
      await expect(
        authService.signup('admin@campus.edu', 'secret1234', { role: 'admin' })
      ).rejects.toMatchObject({
        code: 'PRIVILEGE_ESCALATION_FORBIDDEN',
        statusCode: 403,
      })

      await expect(
        authService.signup('super@campus.edu', 'secret1234', { role: 'super_admin' })
      ).rejects.toMatchObject({
        code: 'PRIVILEGE_ESCALATION_FORBIDDEN',
        statusCode: 403,
      })
    })

    it('rejects invalid roles with 400 INVALID_ROLE', async () => {
      await expect(
        authService.signup('user@campus.edu', 'secret1234', { role: 'manager' })
      ).rejects.toMatchObject({
        code: 'INVALID_ROLE',
        statusCode: 400,
      })
    })

    it('rejects invalid email formats before contacting server', async () => {
      await expect(
        authService.signup('invalid-email-no-at', 'secret1234', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'INVALID_EMAIL',
        statusCode: 400,
      })
    })
  })

  describe('Remote Supabase Auth signup & error classification', () => {
    beforeEach(() => {
      vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    })

    it('1. Successfully registers a completely new email (email confirmation required)', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'usr_new_123',
                email: 'brandnew@campus.edu',
                identities: [{ id: 'ident_1', provider: 'email' }],
              },
              session: null,
            },
            error: null,
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      const result = await authService.signup('brandnew@campus.edu', 'StrongPassword123!', {
        name: 'Brand New User',
        phone: '9876543210',
        role: 'customer',
      })

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'brandnew@campus.edu',
          password: 'StrongPassword123!',
          options: expect.objectContaining({
            data: {
              name: 'Brand New User',
              phone: '9876543210',
              role: 'customer',
            },
          }),
        })
      )
      expect(result.needsConfirmation).toBe(true)
      expect(result.session).toBeNull()
      expect(result.authUser.id).toBe('usr_new_123')
      expect(result.role).toBe('customer')
    })

    it('1b. Successfully registers a completely new email with active session (auto-confirm enabled)', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'usr_auto_123',
                email: 'autoconfirm@campus.edu',
                identities: [{ id: 'ident_2', provider: 'email' }],
              },
              session: { access_token: 'valid_jwt_session_token' },
            },
            error: null,
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      const result = await authService.signup('autoconfirm@campus.edu', 'StrongPassword123!', {
        name: 'Auto Confirm User',
        role: 'customer',
      })

      expect(result.needsConfirmation).toBe(false)
      expect(result.session.access_token).toBe('valid_jwt_session_token')
      expect(result.authUser.id).toBe('usr_auto_123')
    })

    it('2a. Accurately identifies duplicate email when Supabase returns user_already_exists error', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: 'user_already_exists',
              message: 'User already registered',
              status: 422,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('existing@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_EMAIL',
        statusCode: 409,
        message: 'An account with this email already exists. Please log in instead.',
      })
    })

    it('2b. Accurately identifies duplicate email via message text match', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              message: 'A user with this email address has already been registered',
              status: 400,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('existing@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_EMAIL',
        statusCode: 409,
        message: 'An account with this email already exists. Please log in instead.',
      })
    })

    it('2c. Handles email enumeration protection (empty identities array with no session)', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'existing_usr_id',
                email: 'obfuscated@campus.edu',
                identities: [], // Empty identities array signals existing user in Supabase email enumeration protection
              },
              session: null,
            },
            error: null,
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      const result = await authService.signup('obfuscated@campus.edu', 'Password123!', { role: 'customer' })
      expect(result.needsConfirmation).toBe(true)
      expect(result.isEnumerationProtected).toBe(true)
      expect(result.session).toBeNull()
    })

    it('3. Does NOT convert invalid email errors into duplicate email errors', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: 'validation_failed',
              message: 'Unable to validate email address: invalid format',
              status: 422,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('bad@invalid', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'INVALID_EMAIL',
        statusCode: 400,
        message: 'Unable to validate email address: invalid format',
      })
    })

    it('4. Does NOT convert weak password errors (status 422) into duplicate email errors', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: 'weak_password',
              message: 'Password should be at least 6 characters',
              status: 422,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('newuser@campus.edu', '123', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'WEAK_PASSWORD',
        statusCode: 422,
        message: 'Password should be at least 6 characters',
      })
    })

    it('5. Does NOT convert database trigger errors into duplicate email errors', async () => {
      // When PostgreSQL trigger handle_new_user fails, GoTrue returns "Database error saving new user"
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: 'unexpected_failure',
              message: 'Database error saving new user',
              status: 500,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('dberror@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'DATABASE_ERROR',
        statusCode: 500,
        message: 'An error occurred while setting up your account profile. Please try again later or contact support.',
      })
    })

    it('5b. Handles 422 database trigger error as database error, NOT duplicate email', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              message: 'Database error saving new user',
              status: 422,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('dberror422@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'DATABASE_ERROR',
        statusCode: 500,
      })
    })

    it('6. Does NOT convert rate limit errors into duplicate email errors', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: 'over_email_send_rate_limit',
              message: 'For security purposes, you can only request this once every 60 seconds',
              status: 429,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('ratelimit@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
        message: 'Too many signup attempts. Please wait a few minutes and try again.',
      })
    })

    it('7. Does NOT convert signups disabled error (422) into duplicate email errors', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: 'signup_disabled',
              message: 'Signups not allowed for this instance',
              status: 422,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('disabled@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'SIGNUP_DISABLED',
        statusCode: 403,
        message: 'Account registration is currently disabled. Please contact support.',
      })
    })

    it('8. Handles network errors with clear diagnostic message', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              name: 'TypeError',
              message: 'Failed to fetch',
              status: 0,
            },
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      await expect(
        authService.signup('network@campus.edu', 'Password123!', { role: 'customer' })
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        statusCode: 0,
        message: 'Unable to connect to the authentication service. Please check your internet connection.',
      })
    })

    it('9. Preserves role metadata for customer and runner signups', async () => {
      const mockSupabase = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'usr_runner_1',
                email: 'runnerapplicant@campus.edu',
                identities: [{ id: 'i1' }],
              },
              session: null,
            },
            error: null,
          }),
        },
      }
      vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue(mockSupabase)

      const result = await authService.signup('runnerapplicant@campus.edu', 'SecurePassword123!', {
        name: 'Runner Applicant',
        role: 'runner',
      })

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: {
              name: 'Runner Applicant',
              role: 'runner',
            },
          }),
        })
      )
      expect(result.role).toBe('runner')
    })
  })

  describe('Mock backend mode signup', () => {
    beforeEach(() => {
      vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(true)
    })

    it('registers brand-new customer successfully in mock mode', async () => {
      const uniqueEmail = `test_${Date.now()}@campus.edu`
      const result = await authService.signup(uniqueEmail, 'Password123!', {
        name: 'Test Customer',
        role: 'customer',
      })

      expect(result.user).toBeDefined()
      expect(result.user.email).toBe(uniqueEmail)
      expect(result.user.roles).toContain('customer')
    })

    it('registers brand-new runner applicant successfully in mock mode', async () => {
      const uniqueEmail = `runner_${Date.now()}@campus.edu`
      const result = await authService.signup(uniqueEmail, 'Password123!', {
        name: 'Test Runner',
        role: 'runner',
      })

      expect(result.user).toBeDefined()
      expect(result.user.email).toBe(uniqueEmail)
      expect(result.user.runnerStatus).toBe('applicant')
    })

    it('rejects duplicate email in mock mode with 409 DUPLICATE_EMAIL', async () => {
      // 'customer@martit.test' is in SAMPLE_USERS
      await expect(
        authService.signup('customer@martit.test', 'Password123!', {
          name: 'Duplicate Guy',
          role: 'customer',
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_EMAIL',
        statusCode: 409,
        message: 'An account with this email already exists. Please log in instead.',
      })
    })
  })
})
