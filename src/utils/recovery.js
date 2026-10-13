/**
 * Utilities for Supabase Password Recovery callback parsing and URL sanitation.
 */

/**
 * Extracts and decodes recovery parameters and callback errors from URL hash fragments and query strings.
 * Supabase can return tokens in the hash (implicit/default) or query (PKCE),
 * and errors (e.g. expired or invalid tokens) in either format.
 *
 * @param {Location|{hash?: string, search?: string}} [loc] Optional location object, defaults to window.location
 */
export function parseRecoveryUrlParams(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) {
    return {
      hasError: false,
      isExpiredOrInvalid: false,
      error: null,
      errorCode: null,
      errorDescription: null,
      type: null,
      hasRecoveryToken: false,
    }
  }

  // Parse search params (?foo=bar)
  const searchStr = loc.search || ''
  const searchParams = new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr)

  // Parse hash params (#foo=bar or #access_token=...)
  const hashStr = loc.hash || ''
  const hashParams = new URLSearchParams(hashStr.startsWith('#') ? hashStr.slice(1) : hashStr)

  const error = hashParams.get('error') || searchParams.get('error') || null
  const errorCode = hashParams.get('error_code') || searchParams.get('error_code') || null
  const errorDescription =
    hashParams.get('error_description') || searchParams.get('error_description') || null
  const type = hashParams.get('type') || searchParams.get('type') || null
  const accessToken = hashParams.get('access_token') || searchParams.get('access_token') || null

  const decodedDescription = errorDescription
    ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
    : null

  const isExpiredOrInvalid =
    Boolean(error) ||
    errorCode === 'otp_expired' ||
    Boolean(decodedDescription?.toLowerCase().includes('expired')) ||
    Boolean(decodedDescription?.toLowerCase().includes('invalid'))

  return {
    hasError: Boolean(error || errorCode),
    isExpiredOrInvalid,
    error,
    errorCode,
    errorDescription: decodedDescription,
    type,
    hasRecoveryToken: Boolean(accessToken && type === 'recovery'),
  }
}

/**
 * Safely removes tokens and error parameters from the browser address bar without triggering a page reload.
 */
export function clearRecoveryUrlParams() {
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const cleanUrl = window.location.pathname
    window.history.replaceState(null, '', cleanUrl)
  }
}
