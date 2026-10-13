import { describe, it, expect } from 'vitest'
import { parseRecoveryUrlParams } from '../recovery'

describe('Recovery URL Parsing (parseRecoveryUrlParams)', () => {
  it('detects expired link in URL hash fragment', () => {
    const loc = {
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      search: '',
    }
    const res = parseRecoveryUrlParams(loc)
    expect(res.hasError).toBe(true)
    expect(res.isExpiredOrInvalid).toBe(true)
    expect(res.errorCode).toBe('otp_expired')
    expect(res.errorDescription).toBe('Email link is invalid or has expired')
  })

  it('detects invalid link in URL query string (PKCE format)', () => {
    const loc = {
      hash: '',
      search: '?error=access_denied&error_code=bad_code&error_description=Invalid+token',
    }
    const res = parseRecoveryUrlParams(loc)
    expect(res.hasError).toBe(true)
    expect(res.isExpiredOrInvalid).toBe(true)
    expect(res.errorCode).toBe('bad_code')
    expect(res.errorDescription).toBe('Invalid token')
  })

  it('detects valid recovery token in hash fragment', () => {
    const loc = {
      hash: '#access_token=valid_recovery_jwt&refresh_token=valid_refresh&type=recovery',
      search: '',
    }
    const res = parseRecoveryUrlParams(loc)
    expect(res.hasError).toBe(false)
    expect(res.isExpiredOrInvalid).toBe(false)
    expect(res.hasRecoveryToken).toBe(true)
    expect(res.type).toBe('recovery')
  })

  it('handles clean URL without errors or tokens', () => {
    const loc = {
      hash: '',
      search: '',
    }
    const res = parseRecoveryUrlParams(loc)
    expect(res.hasError).toBe(false)
    expect(res.isExpiredOrInvalid).toBe(false)
    expect(res.hasRecoveryToken).toBe(false)
  })

  it('handles null/undefined location gracefully', () => {
    const res = parseRecoveryUrlParams(null)
    expect(res.hasError).toBe(false)
    expect(res.isExpiredOrInvalid).toBe(false)
  })
})
