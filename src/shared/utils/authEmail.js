/**
 * authEmail.js
 * Helpers for Supabase's email-link flows: sign-up confirmation, resending
 * it, and password recovery.
 *
 * Every link Supabase emails points back at /auth/callback on whichever
 * subdomain the request came from (app.* or reporter.*), so the visitor
 * lands back where they started. Each origin's /auth/callback must be in the
 * project's Auth → URL Configuration → Redirect URLs allowlist, or Supabase
 * silently falls back to the Site URL.
 */

export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Absolute URL Supabase should send email-link visitors back to. */
export function authCallbackUrl() {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

/**
 * Reads what an email link carried in the URL: the success hash
 * (#access_token=…&type=signup|recovery|…) or an error
 * (#error=access_denied&error_code=otp_expired&error_description=…, which
 * Supabase may also put in the query string).
 *
 * Must run before the Supabase client is created: with
 * `detectSessionInUrl` the client consumes and clears the hash on init.
 * Returns null when the URL carries neither.
 */
export function readAuthRedirect(location) {
  const hash = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location?.search || '');
  const get = (key) => hash.get(key) ?? query.get(key);

  const error = get('error');
  if (error) {
    return {
      type: get('type'),
      error,
      errorCode: get('error_code'),
      errorDescription: (get('error_description') || '').replace(/\+/g, ' '),
    };
  }
  if (hash.get('access_token')) {
    return { type: hash.get('type'), error: null, errorCode: null, errorDescription: null };
  }
  return null;
}

/**
 * Supabase's response to signUp() for an address that already has an
 * account: a user object with no identities, no session, and no email sent
 * (it hides this to avoid leaking which addresses are registered).
 */
export function isExistingAccountSignUp(data) {
  const identities = data?.user?.identities;
  return !data?.session && Array.isArray(identities) && identities.length === 0;
}

/** Sign-in rejected because the address hasn't been confirmed yet. */
export function isEmailNotConfirmedError(err) {
  return err?.code === 'email_not_confirmed'
    || /email not confirmed/i.test(err?.message || '');
}
