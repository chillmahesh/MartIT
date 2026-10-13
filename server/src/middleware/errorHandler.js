import { ZodError } from 'zod'
import { ApiError } from '../utils/errors.js'
import { isOriginAllowed } from '../config/cors.js'

export function errorHandler(err, req, res, next) {
  // If response has already started streaming, delegate to default Express handler
  if (res.headersSent) {
    return next(err)
  }

  // Ensure CORS headers are present on error responses for allowed origins
  const origin = req.headers?.origin
  if (origin && isOriginAllowed(origin) && !res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }

  // Known ApiError
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  // Zod request schema validation error
  if (err instanceof ZodError) {
    return res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: 'Request payload failed schema validation.',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    })
  }

  // Malformed JSON payload
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      code: 'INVALID_JSON',
      message: 'Malformed JSON in request body.',
    })
  }

  // Unhandled / Internal Server Error
  // Log server-side only; never send internal details/stacks to client
  if (process.env.NODE_ENV !== 'test') {
    console.error('[UNHANDLED_ERROR]', err)
  }

  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected internal error occurred. Please try again later.',
  })
}
