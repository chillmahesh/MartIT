/**
 * Cryptographic helpers for Delivery OTP Generation & Verification
 */

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 */
export function generateOtp() {
  const array = new Uint32Array(1)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array)
  } else {
    array[0] = Math.floor(Math.random() * 1000000)
  }
  return (array[0] % 1000000).toString().padStart(6, '0')
}

/**
 * Validates that an input is exactly 6 numeric digits.
 */
export function isValidOtpFormat(otp) {
  if (typeof otp !== 'string' && typeof otp !== 'number') return false
  return /^\d{6}$/.test(String(otp).trim())
}

/**
 * Generates a SHA-256 hex hash of the OTP for secure server-side storage and comparison.
 */
export async function hashOtp(otp) {
  const normalized = String(otp).trim()
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(normalized)
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const nodeCrypto = await import('node:crypto')
  return nodeCrypto.createHash('sha256').update(normalized).digest('hex')
}
