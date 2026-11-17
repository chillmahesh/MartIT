import { createClient } from '@supabase/supabase-js'
import { env, isMockBackend } from './env'

let cachedClient = null

/**
 * Validates Supabase configuration for client safety.
 * Ensures the browser never receives service-role credentials.
 */
export function validateSupabaseConfig() {
  if (isMockBackend) {
    return { valid: true, error: null, mode: 'mock' }
  }

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return {
      valid: false,
      error:
        'Remote API mode is enabled (VITE_API_BASE_URL is set), but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Configure them in Vercel or .env.local.',
      mode: 'remote',
    }
  }

  // Ensure URL is a valid http/https URL
  try {
    const parsed = new URL(env.supabaseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        valid: false,
        error: 'VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.',
        mode: 'remote',
      }
    }
  } catch {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL is not a valid URL.',
      mode: 'remote',
    }
  }

  // Security check: Guard against accidental service-role key exposure in client bundles
  const anonKey = env.supabaseAnonKey
  if (anonKey.toLowerCase().includes('service_role')) {
    return {
      valid: false,
      error:
        'Security Error: Service role key detected in VITE_SUPABASE_ANON_KEY. The browser must NEVER receive service role credentials!',
      mode: 'remote',
    }
  }

  // Check if JWT payload contains service_role claim
  try {
    const parts = anonKey.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]))
      if (payload.role === 'service_role') {
        return {
          valid: false,
          error:
            'Security Error: Service role key detected in VITE_SUPABASE_ANON_KEY. The browser must NEVER receive service role credentials!',
          mode: 'remote',
        }
      }
    }
  } catch {
    // Non-JWT token (e.g. test string); continue
  }

  return { valid: true, error: null, mode: 'remote' }
}

/**
 * Returns the client-side Supabase instance.
 * In mock mode: returns null.
 * In remote mode: returns the configured client, or throws a descriptive ConfigurationError.
 */
export function getSupabaseClient() {
  if (isMockBackend) {
    return null
  }

  if (cachedClient) {
    return cachedClient
  }

  const { valid, error } = validateSupabaseConfig()
  if (!valid) {
    throw new Error(error)
  }

  cachedClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return cachedClient
}

/**
 * Resets the cached Supabase client (primarily for testing configuration switches).
 */
export function resetSupabaseClientForTesting() {
  cachedClient = null
}
