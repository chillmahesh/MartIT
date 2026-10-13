/**
 * Centralized API Error class for the MartIT backend.
 * Compatible with frontend ApiError handling in src/services/api.js.
 */
export class ApiError extends Error {
  /**
   * @param {string} code - Machine-readable error code (e.g. 'UNAUTHENTICATED', 'FORBIDDEN')
   * @param {string} message - Human-readable non-sensitive error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {any} [details=null] - Additional safe metadata
   */
  constructor(code, message, statusCode = 500, details = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }

  static badRequest(message, code = 'BAD_REQUEST', details = null) {
    return new ApiError(code, message, 400, details)
  }

  static unauthenticated(message = 'Please log in again.', code = 'UNAUTHENTICATED') {
    return new ApiError(code, message, 401)
  }

  static unauthorized(message = 'Please log in again.', code = 'UNAUTHENTICATED') {
    return new ApiError(code, message, 401)
  }

  static forbidden(message = "You don't have permission to do that.", code = 'FORBIDDEN') {
    return new ApiError(code, message, 403)
  }

  static notFound(message = 'Resource not found.', code = 'NOT_FOUND') {
    return new ApiError(code, message, 404)
  }

  static conflict(message = 'Conflict with current state.', code = 'CONFLICT', details = null) {
    return new ApiError(code, message, 409, details)
  }

  static unprocessable(message = 'Validation failed.', code = 'UNPROCESSABLE_ENTITY', details = null) {
    return new ApiError(code, message, 422, details)
  }

  static tooManyRequests(message = 'Too many requests.', code = 'TOO_MANY_REQUESTS', details = null) {
    return new ApiError(code, message, 429, details)
  }

  static internal(message = 'An unexpected server error occurred.', code = 'INTERNAL_ERROR') {

    return new ApiError(code, message, 500)
  }
}
