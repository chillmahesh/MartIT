import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { request, setTokenProvider, ApiError } from '../api'
import * as envConfig from '@/config/env'

describe('API Transport & Error Handling (src/services/api.js)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    setTokenProvider(() => 'test_jwt_token')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('normalizes trailing slashes on apiBaseUrl and formats POST path correctly', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    envConfig.env.apiBaseUrl = 'https://martit-api.onrender.com/'

    let calledUrl = null
    let calledOptions = null
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      calledUrl = url
      calledOptions = options
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    })

    const res = await request('auth.me', {})
    expect(res).toEqual({ success: true })
    expect(calledUrl).toBe('https://martit-api.onrender.com/auth/me')
    expect(calledOptions.method).toBe('POST')
    expect(calledOptions.headers.Authorization).toBe('Bearer test_jwt_token')
  })

  it('catches network errors / failed to fetch and throws structured API_UNREACHABLE ApiError', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    envConfig.env.apiBaseUrl = 'https://martit-api.onrender.com'

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(request('auth.me')).rejects.toMatchObject({
      code: 'API_UNREACHABLE',
      status: 0,
      statusCode: 0,
      message: expect.stringContaining('Unable to reach the MartIT backend server'),
      details: expect.objectContaining({
        url: 'https://martit-api.onrender.com/auth/me',
        endpoint: 'auth.me',
      }),
    })
  })

  it('preserves server 401 unauthenticated response with status and message', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    envConfig.env.apiBaseUrl = 'https://martit-api.onrender.com'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ code: 'UNAUTHENTICATED', message: 'Invalid or expired session.' }),
    })

    await expect(request('auth.me')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
      statusCode: 401,
      message: 'Invalid or expired session.',
    })
  })

  it('preserves server 500 database error without swallowing', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    envConfig.env.apiBaseUrl = 'https://martit-api.onrender.com'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ code: 'DATABASE_ERROR', message: 'Database error retrieving profile.' }),
    })

    await expect(request('auth.me')).rejects.toMatchObject({
      code: 'DATABASE_ERROR',
      status: 500,
      statusCode: 500,
      message: 'Database error retrieving profile.',
    })
  })

  it('resolves orders.create to POST /orders/create with JSON payload and authorization', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(false)
    envConfig.env.apiBaseUrl = 'https://martit-backend.onrender.com'

    let calledUrl = null
    let calledOptions = null
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      calledUrl = url
      calledOptions = options
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'ord_123', status: 'AWAITING_PAYMENT' }),
      })
    })

    const orderPayload = {
      storeId: 'store_campus_mart',
      locationId: 'loc_hostel_a',
      lines: [{ productId: 'p_milk', quantity: 1 }],
    }
    const res = await request('orders.create', orderPayload)
    expect(res.id).toBe('ord_123')
    expect(calledUrl).toBe('https://martit-backend.onrender.com/orders/create')
    expect(calledOptions.method).toBe('POST')
    expect(JSON.parse(calledOptions.body)).toEqual(orderPayload)
    expect(calledOptions.headers.Authorization).toBe('Bearer test_jwt_token')
  })

  it('uses mock backend handler when isMockBackend is true', async () => {
    vi.spyOn(envConfig, 'isMockBackend', 'get').mockReturnValue(true)

    const res = await request('auth.demoLogin', { role: 'customer' })
    expect(res).toBeDefined()
    expect(res.user.roles).toContain('customer')
  })
})
