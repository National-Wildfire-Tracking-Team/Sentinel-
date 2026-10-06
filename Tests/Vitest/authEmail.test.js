import { describe, it, expect } from 'vitest';
import {
  readAuthRedirect, isExistingAccountSignUp, isEmailNotConfirmedError,
} from '../../src/shared/utils/authEmail';

describe('readAuthRedirect', () => {
  it('reads a successful sign-up confirmation hash', () => {
    const r = readAuthRedirect({ hash: '#access_token=abc&refresh_token=def&type=signup', search: '' });
    expect(r).toEqual({ type: 'signup', error: null, errorCode: null, errorDescription: null });
  });

  it('reads a password recovery hash', () => {
    expect(readAuthRedirect({ hash: '#access_token=abc&type=recovery', search: '' }).type).toBe('recovery');
  });

  it('reads an expired-link error from the hash', () => {
    const r = readAuthRedirect({
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      search: '',
    });
    expect(r.error).toBe('access_denied');
    expect(r.errorCode).toBe('otp_expired');
    expect(r.errorDescription).toBe('Email link is invalid or has expired');
  });

  it('reads an error from the query string', () => {
    const r = readAuthRedirect({ hash: '', search: '?error=access_denied&error_code=otp_expired' });
    expect(r.errorCode).toBe('otp_expired');
  });

  it('returns null for an ordinary URL', () => {
    expect(readAuthRedirect({ hash: '', search: '?layer=fires' })).toBeNull();
    expect(readAuthRedirect({ hash: '#map', search: '' })).toBeNull();
  });
});

describe('isExistingAccountSignUp', () => {
  it('flags the obfuscated user Supabase returns for a taken address', () => {
    expect(isExistingAccountSignUp({ user: { identities: [] }, session: null })).toBe(true);
  });

  it('does not flag a genuine new sign-up', () => {
    expect(isExistingAccountSignUp({ user: { identities: [{ id: '1' }] }, session: null })).toBe(false);
    expect(isExistingAccountSignUp({ user: { identities: [{ id: '1' }] }, session: {} })).toBe(false);
    expect(isExistingAccountSignUp(null)).toBe(false);
  });
});

describe('isEmailNotConfirmedError', () => {
  it('matches by error code or message', () => {
    expect(isEmailNotConfirmedError({ code: 'email_not_confirmed' })).toBe(true);
    expect(isEmailNotConfirmedError({ message: 'Email not confirmed' })).toBe(true);
    expect(isEmailNotConfirmedError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isEmailNotConfirmedError(null)).toBe(false);
  });
});
