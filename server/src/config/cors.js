import { allowedOrigins } from './env.js'
import { ApiError } from '../utils/errors.js'

/**
 * Standard frontend origins that are always permitted:
 * - Production: https://martit.vercel.app
 * - Local development: http://localhost:5173, http://localhost:3000
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://martit.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

/**
 * Normalizes an origin by trimming whitespace, lowercasing, and stripping trailing slashes.
 */
export function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return ''
  return origin.trim().toLowerCase().replace(/\/+$/, '')
}

/**
 * Checks whether an incoming origin is permitted.
 * Matches exact origins (case-insensitive, trailing slash agnostic),
 * configured environment origins, and official MartIT Vercel preview deployments.
 */
export function isOriginAllowed(origin, customAllowedList) {
  if (!origin) return true // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
  const norm = normalizeOrigin(origin)

  const baseList =
    customAllowedList !== undefined
      ? customAllowedList
      : [...(allowedOrigins || []), ...DEFAULT_ALLOWED_ORIGINS]

  const normAllowed = baseList.map(normalizeOrigin).filter(Boolean)

  if (normAllowed.includes(norm) || normAllowed.includes('*')) {
    return true
  }

  // Permit official MartIT Vercel preview deployments (e.g. https://martit-git-feat.vercel.app)
  if (/^https:\/\/martit(-[a-z0-9-]+)?\.vercel\.app$/i.test(norm)) {
    return true
  }

  return false
}

/**
 * Centralized CORS configuration for Express.
 */
export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true)
    }
    return callback(new ApiError('CORS_FORBIDDEN', 'Origin not allowed by CORS policy.', 403))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  optionsSuccessStatus: 204,
}
