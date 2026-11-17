/**
 * MartIT Shared Input Validation Utilities
 *
 * Implements authoritative client-side and server-side validation rules:
 * - Names: 2–120 characters, Unicode letters, spaces, hyphens, apostrophes, dots.
 * - Emails: RFC-compliant syntax, rejection of spaces, trailing/leading whitespace normalization.
 * - Phone numbers: Exactly 10-digit Indian mobile numbers (starts with 6, 7, 8, 9), optional +91/91/0 prefix.
 *   Supports empty values when optional.
 * - Passwords: 8–72 characters (auth/signup) or 6–72 characters (recovery/reset).
 * - Text fields, addresses, search queries, and numeric inputs with safe boundaries.
 */

// Email regex enforcing user@domain.tld structure with at least 2 chars for TLD, no spaces
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

// Unicode letter regex allowing accents, Devanagari, Tamil, etc., plus spaces, hyphens, apostrophes (ASCII and curly), dots
export const NAME_REGEX = /^[\p{L}\p{M}\s.'\u2019\u02BC-]+$/u

// Indian mobile national format: exactly 10 digits starting with 6, 7, 8, or 9
export const INDIAN_MOBILE_CORE_REGEX = /^[6-9]\d{9}$/

/**
 * Validates full name.
 * - Trims leading and trailing whitespace.
 * - Minimum length: default 2 characters.
 * - Maximum length: default 120 characters (Postgres VARCHAR(120)).
 * - Permits legitimate Indian names, Unicode characters, accents, spaces.
 * - Rejects strings containing only digits or punctuation symbols without letters.
 */
export function validateName(raw, { required = true, minLength = 2, maxLength = 120, label = 'Full name' } = {}) {
  const trimmed = (raw || '').trim()

  if (!trimmed) {
    if (!required) {
      return { isValid: true, valid: true, error: null, value: '', normalized: '' }
    }
    return {
      isValid: false,
      valid: false,
      error: `Please enter your ${label.toLowerCase()}.`,
      value: '',
      normalized: '',
    }
  }

  if (trimmed.length < minLength) {
    return {
      isValid: false,
      valid: false,
      error: `${label} must be at least ${minLength} characters.`,
      value: trimmed,
      normalized: '',
    }
  }

  if (trimmed.length > maxLength) {
    return {
      isValid: false,
      valid: false,
      error: `${label} cannot exceed ${maxLength} characters.`,
      value: trimmed,
      normalized: '',
    }
  }

  // Must contain at least one letter (Unicode letter property)
  if (!/\p{L}/u.test(trimmed)) {
    return {
      isValid: false,
      valid: false,
      error: `${label} must contain letters.`,
      value: trimmed,
      normalized: '',
    }
  }

  // Must not contain forbidden symbols like < > / @ $ % etc.
  if (!NAME_REGEX.test(trimmed)) {
    return {
      isValid: false,
      valid: false,
      error: `${label} contains invalid characters.`,
      value: trimmed,
      normalized: '',
    }
  }

  return {
    isValid: true,
    valid: true,
    error: null,
    value: trimmed,
    normalized: trimmed,
  }
}

/**
 * Alias for backward compatibility with checkoutValidation.
 */
export function validateFullName(raw) {
  return validateName(raw, { required: true, minLength: 2, maxLength: 120, label: 'Full name' })
}

/**
 * Validates email address.
 * - Trims surrounding whitespace without altering internal characters.
 * - Rejects any internal spaces.
 * - Validates standard syntax (username@domain.tld with at least 2 char TLD).
 * - Enforces RFC maximum length of 255 characters.
 */
export function validateEmail(raw, { required = true, label = 'Email address' } = {}) {
  const input = raw || ''
  const trimmed = input.trim()

  if (!trimmed) {
    if (!required) {
      return { isValid: true, valid: true, error: null, value: '', normalized: '' }
    }
    return {
      isValid: false,
      valid: false,
      error: `Please enter your ${label.toLowerCase()}.`,
      value: '',
      normalized: '',
    }
  }

  // Reject internal spaces
  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      valid: false,
      error: `${label} cannot contain spaces.`,
      value: trimmed,
      normalized: '',
    }
  }

  // Check RFC length limit
  if (trimmed.length > 255) {
    return {
      isValid: false,
      valid: false,
      error: `${label} cannot exceed 255 characters.`,
      value: trimmed,
      normalized: '',
    }
  }

  // Must contain @ with parts on both sides
  const parts = trimmed.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      isValid: false,
      valid: false,
      error: 'Please enter a valid email address with a username and domain (e.g. you@campus.edu).',
      value: trimmed,
      normalized: '',
    }
  }

  const [localPart, domainPart] = parts

  if (localPart.length > 64) {
    return {
      isValid: false,
      valid: false,
      error: 'Email username cannot exceed 64 characters.',
      value: trimmed,
      normalized: '',
    }
  }

  // Domain must contain a dot, and TLD must have at least 2 characters
  if (!domainPart.includes('.') || domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return {
      isValid: false,
      valid: false,
      error: 'Please enter a valid domain with an extension (e.g. campus.edu or gmail.com).',
      value: trimmed,
      normalized: '',
    }
  }

  const domainLabels = domainPart.split('.')
  const tld = domainLabels[domainLabels.length - 1]
  if (tld.length < 2) {
    return {
      isValid: false,
      valid: false,
      error: 'Email domain extension must be at least 2 letters.',
      value: trimmed,
      normalized: '',
    }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      valid: false,
      error: 'Please enter a valid email address (e.g. you@campus.edu).',
      value: trimmed,
      normalized: '',
    }
  }

  const normalized = trimmed.toLowerCase()
  return {
    isValid: true,
    valid: true,
    error: null,
    value: normalized,
    normalized,
  }
}

/**
 * Validates and normalizes Indian mobile phone numbers.
 *
 * Rules:
 * - If required = false and raw is empty/blank -> valid, returns null error.
 * - Rejects non-digits (excluding optional leading '+' or '+91').
 * - Normalizes to 10-digit national number and E.164 (+91...).
 * - Must start with 6, 7, 8, or 9.
 * - Core digits must be exactly 10 digits (no more, no less).
 * - Does not silently truncate invalid input.
 */
export function validateIndianPhone(raw, { required = false, label = 'Phone number' } = {}) {
  const input = (raw || '').trim()

  if (!input) {
    if (!required) {
      return {
        isValid: true,
        valid: true,
        error: null,
        national: '',
        normalized: '',
        value: '',
        raw: '',
      }
    }
    return {
      isValid: false,
      valid: false,
      error: `Please enter your ${label.toLowerCase()}.`,
      national: '',
      normalized: '',
      value: '',
      raw: '',
    }
  }

  // Strip benign formatting separators (spaces, hyphens, parens, dots)
  const clean = input.replace(/[\s\-\(\)\.]/g, '')

  // Check for invalid non-digit characters (other than a single leading '+')
  if (/[^\d+]/.test(clean) || clean.slice(1).includes('+')) {
    return {
      isValid: false,
      valid: false,
      error: `${label} should only contain digits and optional +91 country code.`,
      national: '',
      normalized: '',
      value: '',
      raw: input,
    }
  }

  // Match optional prefix: +91, 91, or leading 0 followed by 10 digits
  const indianRegex = /^(?:\+91|91|0)?([6-9]\d{9})$/
  const match = clean.match(indianRegex)

  if (match) {
    const national = match[1]
    const normalized = `+91${national}`
    return {
      isValid: true,
      valid: true,
      error: null,
      national,
      normalized,
      value: normalized,
      raw: input,
    }
  }

  // Detailed error explanation: extract core mobile digits
  let coreDigits = clean
  if (coreDigits.startsWith('+91')) {
    coreDigits = coreDigits.slice(3)
  } else if (coreDigits.startsWith('+')) {
    return {
      isValid: false,
      valid: false,
      error: 'Please enter a valid Indian mobile number starting with +91 or a 10-digit number.',
      national: '',
      normalized: '',
      value: '',
      raw: input,
    }
  } else if (coreDigits.startsWith('91') && coreDigits.length > 10) {
    coreDigits = coreDigits.slice(2)
  } else if (coreDigits.startsWith('0') && coreDigits.length > 10) {
    coreDigits = coreDigits.slice(1)
  }

  if (coreDigits.length < 10) {
    return {
      isValid: false,
      valid: false,
      error: `${label} is too short. Please enter a 10-digit mobile number.`,
      national: '',
      normalized: '',
      value: '',
      raw: input,
    }
  }

  if (coreDigits.length > 10) {
    return {
      isValid: false,
      valid: false,
      error: `${label} cannot exceed 10 digits.`,
      national: '',
      normalized: '',
      value: '',
      raw: input,
    }
  }

  if (coreDigits.length === 10 && !/^[6-9]/.test(coreDigits)) {
    return {
      isValid: false,
      valid: false,
      error: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
      national: '',
      normalized: '',
      value: '',
      raw: input,
    }
  }

  return {
    isValid: false,
    valid: false,
    error: `Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).`,
    national: '',
    normalized: '',
    value: '',
    raw: input,
  }
}

/**
 * Normalizes Indian mobile number for checkout (where phone is required).
 * Alias for backward compatibility with checkoutValidation.
 */
export function normalizeIndianMobile(raw) {
  return validateIndianPhone(raw, { required: true, label: 'Mobile number' })
}

/**
 * Formats a phone input string cleanly for UI display.
 * E.g., strips non-digits while typing and limits to 10 digits, or preserves +91.
 */
export function sanitizePhoneInput(raw, maxDigits = 10) {
  if (!raw) return ''
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  // If user included 91 prefix, allow up to 12 digits (91 + 10 digits)
  if (digits.startsWith('91') && digits.length > 10) {
    const limited = digits.slice(0, 12)
    return hasPlus ? `+${limited}` : limited
  }

  const limited = digits.slice(0, maxDigits)
  return hasPlus ? `+${limited}` : limited
}

/**
 * Validates password length and format.
 * - Default minLength: 8 for account registration.
 * - Default maxLength: 72 (standard bcrypt limit / safe server boundary).
 */
export function validatePassword(raw, { minLength = 8, maxLength = 72, label = 'Password' } = {}) {
  const pwd = raw || ''

  if (!pwd) {
    return {
      isValid: false,
      error: `Please enter your ${label.toLowerCase()}.`,
      value: '',
    }
  }

  if (pwd.length < minLength) {
    return {
      isValid: false,
      error: `${label} must be at least ${minLength} characters long.`,
      value: pwd,
    }
  }

  if (pwd.length > maxLength) {
    return {
      isValid: false,
      error: `${label} cannot exceed ${maxLength} characters.`,
      value: pwd,
    }
  }

  return {
    isValid: true,
    error: null,
    value: pwd,
  }
}

/**
 * Validates matching confirmation password.
 */
export function validatePasswordConfirmation(password, confirmPassword) {
  if (!confirmPassword) {
    return {
      isValid: false,
      error: 'Please re-enter your password to confirm.',
    }
  }

  if (password !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match. Please re-enter to confirm.',
    }
  }

  return {
    isValid: true,
    error: null,
  }
}

/**
 * Validates address or custom destination text.
 */
export function validateAddress(raw, { required = true, minLength = 3, maxLength = 200, label = 'Address' } = {}) {
  const trimmed = (raw || '').trim()

  if (!trimmed) {
    if (!required) {
      return { isValid: true, error: null, value: '' }
    }
    return {
      isValid: false,
      error: `Please enter your ${label.toLowerCase()}.`,
      value: '',
    }
  }

  if (trimmed.length < minLength) {
    return {
      isValid: false,
      error: `${label} must be at least ${minLength} characters.`,
      value: trimmed,
    }
  }

  if (trimmed.length > maxLength) {
    return {
      isValid: false,
      error: `${label} cannot exceed ${maxLength} characters.`,
      value: trimmed,
    }
  }

  return {
    isValid: true,
    error: null,
    value: trimmed,
  }
}

/**
 * Validates search query input.
 * Enforces a maximum length of 100 characters to prevent layout break or regex DoS.
 */
export function validateSearchQuery(raw, maxLength = 100) {
  const trimmed = (raw || '').slice(0, maxLength).trim()
  return trimmed
}
