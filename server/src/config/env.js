import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Validates environment variables according to NODE_ENV mode.
 * In production: strictly enforces HTTPS URLs, non-placeholder secrets, and safe CORS origins.
 * In test: provides safe in-memory test defaults without network calls.
 * In development: permits local development defaults.
 *
 * Security: NEVER prints credential values in error messages.
 */
export function validateEnv(raw = process.env) {
  const nodeEnv = raw.NODE_ENV || 'development'

  if (nodeEnv === 'test') {
    return {
      PORT: Number(raw.PORT) || 4000,
      NODE_ENV: 'test',
      SUPABASE_URL: raw.SUPABASE_URL || 'http://localhost:54321',
      SUPABASE_ANON_KEY: raw.SUPABASE_ANON_KEY || 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key',
      FRONTEND_ORIGINS: raw.FRONTEND_ORIGINS || 'https://martit.vercel.app,http://localhost:5173,http://localhost:3000',
      FEATURE_MULTI_STORE_CHECKOUT: raw.FEATURE_MULTI_STORE_CHECKOUT === 'true',
      ROUTING_PROVIDER: raw.ROUTING_PROVIDER || '',
      ROUTING_MODE: raw.ROUTING_MODE || 'walking',
      MAKE_VERIFICATION_WEBHOOK_URL: raw.MAKE_VERIFICATION_WEBHOOK_URL || '',
      MAKE_WEBHOOK_SECRET: raw.MAKE_WEBHOOK_SECRET || 'test-make-webhook-secret-min-16-chars',
    }
  }

  if (nodeEnv === 'production') {
    const isPlaceholder = (val) => {
      if (!val || typeof val !== 'string') return true
      const lower = val.toLowerCase()
      const blockedTokens = [
        'placeholder',
        'test',
        'your-project',
        'your-supabase',
        'example',
        'dummy',
        'sample',
        'secret',
        'changeme',
        'change-me',
        'dev-anon',
        'dev-service',
      ]
      return blockedTokens.some((token) => lower.includes(token))
    }

    const prodSchema = z
      .object({
        PORT: z.coerce.number().default(10000),
        NODE_ENV: z.literal('production'),
        SUPABASE_URL: z
          .string({ required_error: 'SUPABASE_URL is required in production' })
          .url('SUPABASE_URL must be a valid URL')
          .refine((url) => url.startsWith('https://'), {
            message: 'SUPABASE_URL must use HTTPS in production',
          })
          .refine((url) => !isPlaceholder(url), {
            message: 'SUPABASE_URL cannot be a placeholder or template URL in production',
          }),
        SUPABASE_ANON_KEY: z
          .string({ required_error: 'SUPABASE_ANON_KEY is required in production' })
          .min(20, 'SUPABASE_ANON_KEY appears too short')
          .refine((k) => !isPlaceholder(k), {
            message: 'SUPABASE_ANON_KEY cannot be a placeholder in production',
          }),
        SUPABASE_SERVICE_ROLE_KEY: z
          .string({ required_error: 'SUPABASE_SERVICE_ROLE_KEY is required in production' })
          .min(20, 'SUPABASE_SERVICE_ROLE_KEY appears too short')
          .refine((k) => !isPlaceholder(k), {
            message: 'SUPABASE_SERVICE_ROLE_KEY cannot be a placeholder in production',
          }),
        FRONTEND_ORIGINS: z
          .string()
          .default('https://martit.vercel.app')
          .refine(
            (origins) => {
              const list = origins.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
              return (
                list.length > 0 &&
                !list.includes('*') &&
                list.every((o) => o.startsWith('https://') && !o.includes('localhost') && !o.includes('127.0.0.1'))
              );
            },
            {
              message: 'FRONTEND_ORIGINS must be explicit HTTPS production URLs (no wildcard or localhost allowed)',
            },
          ),
        FEATURE_MULTI_STORE_CHECKOUT: z.coerce.boolean().default(false),
        ROUTING_PROVIDER: z.string().optional().default(''),
        ROUTING_MODE: z.string().default('walking'),
        MAKE_VERIFICATION_WEBHOOK_URL: z.string().optional().default(''),
        MAKE_WEBHOOK_SECRET: z
          .string()
          .optional()
          .default('')
          .refine((s) => !s || (!isPlaceholder(s) && s.length >= 16), {
            message: 'MAKE_WEBHOOK_SECRET must be at least 16 characters and not a placeholder in production',
          }),
      })
      .refine((data) => data.SUPABASE_ANON_KEY !== data.SUPABASE_SERVICE_ROLE_KEY, {
        message: 'SUPABASE_SERVICE_ROLE_KEY must not be identical to SUPABASE_ANON_KEY',
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
      })

    return prodSchema.parse(raw)
  }

  // Development schema
  const devSchema = z.object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.literal('development').default('development'),
    SUPABASE_URL: z.string().url().default('http://localhost:54321'),
    SUPABASE_ANON_KEY: z.string().default('dev-anon-key'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default('dev-service-role-key'),
    FRONTEND_ORIGINS: z.string().default('https://martit.vercel.app,http://localhost:5173,http://localhost:3000'),
    FEATURE_MULTI_STORE_CHECKOUT: z.coerce.boolean().default(false),
    ROUTING_PROVIDER: z.string().optional().default(''),
    ROUTING_MODE: z.string().default('walking'),
    MAKE_VERIFICATION_WEBHOOK_URL: z.string().optional().default(''),
    MAKE_WEBHOOK_SECRET: z.string().optional().default('dev-make-webhook-secret-min-16-chars'),
  })

  return devSchema.parse(raw)
}

let parsedEnv
try {
  parsedEnv = validateEnv(process.env)
} catch (err) {
  if (process.env.NODE_ENV !== 'test') {
    console.error('❌ Environment validation failed:')
    if (err instanceof z.ZodError) {
      for (const issue of err.issues) {
        // Log field path and message only; NEVER log raw input values
        console.error(`   - [${issue.path.join('.') || 'config'}]: ${issue.message}`)
      }
    } else {
      console.error(`   - ${err.message}`)
    }
    process.exit(1)
  }

  // Fallback in test
  parsedEnv = validateEnv({ NODE_ENV: 'test' })
}

export const env = parsedEnv
export const allowedOrigins = parsedEnv.FRONTEND_ORIGINS
  ? parsedEnv.FRONTEND_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
  : []
