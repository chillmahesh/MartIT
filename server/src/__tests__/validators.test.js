import { describe, it, expect } from 'vitest'
import {
  validateName,
  validateEmail,
  validateIndianPhone,
  validatePassword,
} from '../utils/validators.js'

describe('Server Validators', () => {
  it('validates Indian phone numbers with exact 10 digits', () => {
    expect(validateIndianPhone('9876543210', { required: true }).isValid).toBe(true)
    expect(validateIndianPhone('+919876543210', { required: true }).isValid).toBe(true)
    expect(validateIndianPhone('', { required: false }).isValid).toBe(true)
    expect(validateIndianPhone('', { required: true }).isValid).toBe(false)
    expect(validateIndianPhone('1234567890', { required: true }).isValid).toBe(false)
    expect(validateIndianPhone('98765432101234', { required: true }).isValid).toBe(false)
    expect(validateIndianPhone('98765abcde', { required: true }).isValid).toBe(false)
  })

  it('validates email syntax strictly', () => {
    expect(validateEmail('alice@campus.edu').isValid).toBe(true)
    expect(validateEmail('user@sub.domain.co.in').isValid).toBe(true)
    expect(validateEmail('invalidemail').isValid).toBe(false)
    expect(validateEmail('alice@').isValid).toBe(false)
    expect(validateEmail('alice@campus').isValid).toBe(false)
    expect(validateEmail('alice @campus.edu').isValid).toBe(false)
    expect(validateEmail('').isValid).toBe(false)
  })

  it('validates name length and Unicode characters', () => {
    expect(validateName('Aarav Patel').isValid).toBe(true)
    expect(validateName('देव शर्मा').isValid).toBe(true)
    expect(validateName('A').isValid).toBe(false)
    expect(validateName('A'.repeat(121)).isValid).toBe(false)
    expect(validateName('12345').isValid).toBe(false)
  })

  it('validates password length bounds', () => {
    expect(validatePassword('secret123').isValid).toBe(true)
    expect(validatePassword('short').isValid).toBe(false)
    expect(validatePassword('a'.repeat(73)).isValid).toBe(false)
  })
})
