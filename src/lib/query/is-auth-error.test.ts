import { isAuthError } from './is-auth-error'

describe('isAuthError', () => {
  it('returns true for an HTTP 401 (numeric status)', () => {
    expect(isAuthError({ status: 401, message: 'Unauthorized' })).toBe(true)
  })

  it('returns true for a 401 reported via statusCode', () => {
    expect(isAuthError({ statusCode: 401 })).toBe(true)
  })

  it('returns true for a PostgREST "JWT expired" error', () => {
    expect(
      isAuthError({ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }),
    ).toBe(true)
  })

  it('returns true when the message mentions JWT expiry (case-insensitive)', () => {
    expect(isAuthError(new Error('JWT expired'))).toBe(true)
    expect(isAuthError({ message: 'jwt expired' })).toBe(true)
  })

  it('returns false for an ordinary PostgREST data error', () => {
    expect(
      isAuthError({ code: 'PGRST116', message: 'No rows found', details: null, hint: null }),
    ).toBe(false)
  })

  it('returns false for a generic validation/server error', () => {
    expect(isAuthError(new Error('Something went wrong'))).toBe(false)
    expect(isAuthError({ status: 500, message: 'Internal Server Error' })).toBe(false)
  })

  it('returns false for null/undefined/non-object inputs', () => {
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
    expect(isAuthError('JWT expired')).toBe(false)
    expect(isAuthError(401)).toBe(false)
  })
})
