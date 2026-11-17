import { describe, it, expect } from 'vitest'
import {
  validateName,
  validateEmail,
  validateIndianPhone,
  sanitizePhoneInput,
  validatePassword,
  validatePasswordConfirmation,
  validateAddress,
  validateSearchQuery,
} from '../validators'

describe('Shared Validators - Phone Number Validation', () => {
  it('accepts valid 10-digit Indian mobile numbers starting with 6, 7, 8, 9', () => {
    const validNumbers = [
      '9876543210',
      '8765432109',
      '7654321098',
      '6543210987',
      '+91 98765 43210',
      '+91-9876543210',
      '919876543210',
      '09876543210',
      ' 9876543210 ',
    ]

    for (const num of validNumbers) {
      const res = validateIndianPhone(num, { required: true })
      expect(res.isValid).toBe(true)
      expect(res.error).toBeNull()
      expect(res.national).toMatch(/^[6-9]\d{9}$/)
      expect(res.normalized).toMatch(/^\+91[6-9]\d{9}$/)
    }
  })

  it('allows empty phone number when required is false (optional)', () => {
    expect(validateIndianPhone('', { required: false }).isValid).toBe(true)
    expect(validateIndianPhone('   ', { required: false }).isValid).toBe(true)
    expect(validateIndianPhone(null, { required: false }).isValid).toBe(true)
    expect(validateIndianPhone(undefined, { required: false }).isValid).toBe(true)
  })

  it('rejects empty phone number when required is true', () => {
    const res = validateIndianPhone('', { required: true })
    expect(res.isValid).toBe(false)
    expect(res.error).toContain('Please enter your phone number')
  })

  it('rejects phone numbers with non-digits or invalid symbols', () => {
    const invalidInputs = [
      '98765abcde',
      '98765-4321a',
      '+91 98765-xyz',
      'phone_number',
      '98765@4321',
      '+91+9876543210',
    ]

    for (const num of invalidInputs) {
      const res = validateIndianPhone(num)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('should only contain digits')
    }
  })

  it('rejects phone numbers that are too short', () => {
    const shortNumbers = ['98765', '987654321', '+91 98765432']
    for (const num of shortNumbers) {
      const res = validateIndianPhone(num)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('too short')
    }
  })

  it('rejects phone numbers that are overlong', () => {
    const overlongNumbers = [
      '98765432101234567890',
      '98765432101',
      '+91 9876543210999',
    ]
    for (const num of overlongNumbers) {
      const res = validateIndianPhone(num)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('cannot exceed 10 digits')
    }
  })

  it('rejects numbers not starting with 6, 7, 8, or 9', () => {
    const invalidStarts = [
      '1234567890',
      '2345678901',
      '3456789012',
      '4567890123',
      '5678901234',
      '0000000000',
    ]
    for (const num of invalidStarts) {
      const res = validateIndianPhone(num)
      expect(res.isValid).toBe(false)
      expect(res.error).toContain('must start with 6, 7, 8, or 9')
    }
  })

  it('sanitizes typed phone input without losing legitimate format', () => {
    expect(sanitizePhoneInput('9876543210')).toBe('9876543210')
    expect(sanitizePhoneInput('98765-43210')).toBe('9876543210')
    expect(sanitizePhoneInput('987654321099999')).toBe('9876543210')
    expect(sanitizePhoneInput('+91 98765 43210')).toBe('+919876543210')
  })
})

describe('Shared Validators - Email Validation', () => {
  it('accepts valid email addresses and normalizes surrounding whitespace', () => {
    const validEmails = [
      'you@campus.edu',
      'alice.student@campus.edu',
      'student+testing@campus.edu',
      'user@subdomain.campus.edu',
      'user_name@domain.co.in',
      '  user@campus.edu  ',
    ]

    for (const email of validEmails) {
      const res = validateEmail(email)
      expect(res.isValid).toBe(true)
      expect(res.error).toBeNull()
      expect(res.value).toBe(email.trim().toLowerCase())
    }
  })

  it('rejects empty or whitespace-only emails', () => {
    expect(validateEmail('').isValid).toBe(false)
    expect(validateEmail('   ').isValid).toBe(false)
    expect(validateEmail(null).isValid).toBe(false)
  })

  it('rejects emails containing internal spaces', () => {
    expect(validateEmail('you @campus.edu').isValid).toBe(false)
    expect(validateEmail('you@ campus.edu').isValid).toBe(false)
    expect(validateEmail('you @ campus.edu').isValid).toBe(false)
    expect(validateEmail('you@campus .edu').isValid).toBe(false)
  })

  it('rejects malformed email formats', () => {
    const malformed = [
      'invalidemail',
      'user@',
      '@campus.edu',
      'user@campus',
      'user@campus..edu',
      'user@@campus.edu',
      'user@.edu',
      'user@campus.',
      'user@campus.c', // TLD less than 2 chars
    ]

    for (const bad of malformed) {
      const res = validateEmail(bad)
      expect(res.isValid).toBe(false)
      expect(res.error).toBeTruthy()
    }
  })

  it('rejects emails exceeding 255 characters', () => {
    const longEmail = 'a'.repeat(250) + '@campus.edu'
    const res = validateEmail(longEmail)
    expect(res.isValid).toBe(false)
    expect(res.error).toContain('cannot exceed 255 characters')
  })
})

describe('Shared Validators - Name Validation', () => {
  it('accepts legitimate names including Indian names and Unicode characters', () => {
    const validNames = [
      'Aarav Patel',
      'Priyanjali Rao',
      'K. V. Raman',
      'Anne-Marie D’Souza',
      'Jitendra Shrivastava',
      'Aadya Müller',
      'देव शर्मा',
    ]

    for (const name of validNames) {
      const res = validateName(name)
      expect(res.isValid).toBe(true)
      expect(res.error).toBeNull()
      expect(res.value).toBe(name.trim())
    }
  })

  it('rejects blank, single-character, and overlong names', () => {
    expect(validateName('').isValid).toBe(false)
    expect(validateName('   ').isValid).toBe(false)
    expect(validateName('A').isValid).toBe(false)
    expect(validateName('A'.repeat(121)).isValid).toBe(false)
  })

  it('rejects names without any letters (e.g. Pure digits or punctuation)', () => {
    expect(validateName('12345').isValid).toBe(false)
    expect(validateName('---').isValid).toBe(false)
    expect(validateName('!@#$%').isValid).toBe(false)
  })
})

describe('Shared Validators - Password Validation', () => {
  it('accepts passwords with valid length (8 to 72 characters)', () => {
    expect(validatePassword('secret123').isValid).toBe(true)
    expect(validatePassword('12345678').isValid).toBe(true)
    expect(validatePassword('a'.repeat(72)).isValid).toBe(true)
  })

  it('rejects passwords shorter than minLength or longer than maxLength', () => {
    expect(validatePassword('1234567').isValid).toBe(false)
    expect(validatePassword('a'.repeat(73)).isValid).toBe(false)
    expect(validatePassword('').isValid).toBe(false)
  })

  it('validates password confirmation match', () => {
    expect(validatePasswordConfirmation('secret123', 'secret123').isValid).toBe(true)
    expect(validatePasswordConfirmation('secret123', 'different').isValid).toBe(false)
    expect(validatePasswordConfirmation('secret123', '').isValid).toBe(false)
  })
})

describe('Shared Validators - Address and Search Bounds', () => {
  it('validates address constraints', () => {
    expect(validateAddress('Hostel A, Room 302').isValid).toBe(true)
    expect(validateAddress('ab').isValid).toBe(false)
    expect(validateAddress('').isValid).toBe(false)
    expect(validateAddress('a'.repeat(201)).isValid).toBe(false)
  })

  it('limits search query length to 100 characters', () => {
    const longQuery = 'search term '.repeat(20)
    const result = validateSearchQuery(longQuery, 100)
    expect(result.length).toBeLessThanOrEqual(100)
  })
})
