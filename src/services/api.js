/**
 * Single transport for all services. Components never call this directly — they use
 * the domain services (authService, deliveryService, …) so the backend can be swapped
 * without touching UI code.
 */
import { env, isMockBackend } from '@/config/env'
import { ApiError } from './mockServer/errors'

let getToken = () => null
export function setTokenProvider(fn) {
  getToken = fn
}

let onUnauthorizedHandler = null
export function setOnUnauthorizedHandler(fn) {
  onUnauthorizedHandler = fn
}

let mockServerPromise = null
function mockServer() {
  mockServerPromise ??= import('./mockServer/handlers').then((m) => m.createMockServer())
  return mockServerPromise
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function request(name, payload = {}) {
  const token = await getToken()

  if (isMockBackend) {
    const server = await mockServer()
    await wait(180 + Math.random() * 220) // realistic latency so loading states are visible
    // Clone in both directions to mimic a network boundary (no shared references).
    const result = await server.handle(name, structuredClone(payload), { token })
    return structuredClone(result)
  }

  const baseUrl = (env.apiBaseUrl || '').replace(/\/+$/, '')
  const endpoint = name.replaceAll('.', '/').replace(/^\/+/, '')
  const fullUrl = `${baseUrl}/${endpoint}`

  let res
  try {
    res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })
  } catch (networkErr) {
    throw new ApiError(
      'API_UNREACHABLE',
      'Unable to reach the MartIT backend server. The server may be waking up from sleep (Render free tier can take up to 60s) or unreachable. Please check your network connection and server status.',
      0,
      {
        endpoint: name,
        url: fullUrl,
        originalMessage: networkErr.message,
      }
    )
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !isMockBackend && typeof onUnauthorizedHandler === 'function') {
      try {
        onUnauthorizedHandler()
      } catch {
        // Prevent interceptor errors from obscuring API error
      }
    }
    throw new ApiError(
      body.code || (res.status === 401 ? 'UNAUTHENTICATED' : res.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR'),
      body.message || (res.status === 401 ? 'Session expired. Please log in again.' : 'Something went wrong. Please try again.'),
      res.status,
      body.details || { endpoint: name, status: res.status }
    )
  }
  return body
}

export { ApiError }
