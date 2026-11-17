/**
 * MartIT Server Validation Utilities
 *
 * Authoritative server-side input validation matching client-side rules:
 * - Names: 2–120 characters, Unicode letters, spaces, hyphens, apostrophes.
 * - Emails: RFC-compliant syntax, max 255 chars, rejection of spaces.
 * - Phone numbers: Exactly 10-digit Indian mobile numbers (starts with 6, 7, 8, 9), optional +91/91/0 prefix.
 * - Passwords: 8–72 characters.
 */

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export const NAME_REGEX = /^[\p{L}\p{M}\s.'\u2019\u02BC-]+$/u

export function validateName(raw, { required = true, minLength = 2, maxLength = 120, label = 'Full name' } = {}) {
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

  if (!/\p{L}/u.test(trimmed)) {
    return {
      isValid: false,
      error: `${label} must contain letters.`,
      value: trimmed,
    }
  }

  if (!NAME_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: `${label} contains invalid characters.`,
      value: trimmed,
    }
  }

  return {
    isValid: true,
    error: null,
    value: trimmed,
  }
}

export function validateEmail(raw, { required = true, label = 'Email address' } = {}) {
  const input = raw || ''
  const trimmed = input.trim()

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

  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      error: `${label} cannot contain spaces.`,
      value: trimmed,
    }
  }

  if (trimmed.length > 255) {
    return {
      isValid: false,
      error: `${label} cannot exceed 255 characters.`,
      value: trimmed,
    }
  }

  const parts = trimmed.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      isValid: false,
      error: 'Please enter a valid email address with a username and domain (e.g. you@campus.edu).',
      value: trimmed,
    }
  }

  const [localPart, domainPart] = parts

  if (localPart.length > 64) {
    return {
      isValid: false,
      error: 'Email username cannot exceed 64 characters.',
      value: trimmed,
    }
  }

  if (!domainPart.includes('.') || domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return {
      isValid: false,
      error: 'Please enter a valid domain with an extension (e.g. campus.edu or gmail.com).',
      value: trimmed,
    }
  }

  const domainLabels = domainPart.split('.')
  const tld = domainLabels[domainLabels.length - 1]
  if (tld.length < 2) {
    return {
      isValid: false,
      error: 'Email domain extension must be at least 2 letters.',
      value: trimmed,
    }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address (e.g. you@campus.edu).',
      value: trimmed,
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

  const clean = input.replace(/[\s\-\(\)\.]/g, '')

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

  let coreDigits = clean
  if (coreDigits.startsWith('+91')) {
    coreDigits = coreDigits.slice(3)
  } else if (coreDigits.startsWith('+')) {
    return {
      isValid: false,
      error: 'Please enter a valid Indian mobile number starting with +91 or a 10-digit number.',
      national: '',
      normalized: '',
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
      error: `${label} is too short. Please enter a 10-digit mobile number.`,
      national: '',
      normalized: '',
      raw: input,
    }
  }

  if (coreDigits.length > 10) {
    return {
      isValid: false,
      error: `${label} cannot exceed 10 digits.`,
      national: '',
      normalized: '',
      raw: input,
    }
  }

  if (coreDigits.length === 10 && !/^[6-9]/.test(coreDigits)) {
    return {
      isValid: false,
      error: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
      national: '',
      normalized: '',
      raw: input,
    }
  }

  return {
    isValid: false,
    error: `Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).`,
    national: '',
    normalized: '',
    raw: input,
  }
}

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
