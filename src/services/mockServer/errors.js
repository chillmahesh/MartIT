export class ApiError extends Error {
  constructor(code, message, status = 400, details) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.statusCode = status
    this.details = details
  }
}
