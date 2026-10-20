/**
 * auth.mjs
 * Caller identity, Pro entitlement and ORS quota — all checked against
 * Supabase with the caller's own JWT (RLS "subscriptions self read"), so the
 * function never needs the service-role key.
 */

// Must match src/shared/hooks/usePlan.js (PLANS.*.evacuationRoutes + paidStatuses).
export const ENTITLED_PLANS = new Set(['pro', 'team']);
export const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export class HttpError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** The caller's Supabase access token, from Authorization (headers keyed lower-case). */
export function bearerFrom(headers) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(headers?.authorization || '').trim());
  return m ? m[1] : null;
}

export function createSupabase({ url, anonKey, fetchImpl = fetch }) {
  const base = String(url || '').replace(/\/+$/, '');
  const headers = (jwt) => ({ apikey: anonKey, Authorization: `Bearer ${jwt || anonKey}` });
  const timeout = () => AbortSignal.timeout(5000);

  return {
    async getUser(jwt) {
      const res = await fetchImpl(`${base}/auth/v1/user`, { headers: headers(jwt), signal: timeout() });
      // Any 4xx but 429 means the token itself is bad (malformed JWTs get 400/422),
      // so it is an auth failure (401). 429/5xx
      // mean GoTrue is unavailable, which is not the caller's fault.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return null;
      if (!res.ok) throw new HttpError(502, { error: 'auth_unavailable' });
      return res.json();
    },
    async getSubscription(jwt, userId) {
      const res = await fetchImpl(
        `${base}/rest/v1/subscriptions?select=plan,status&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        { headers: headers(jwt), signal: timeout() },
      );
      if (!res.ok) throw new HttpError(502, { error: 'subscription_lookup_failed' });
      const rows = await res.json();
      return rows[0] ?? null;
    },
    async consumeQuota(jwt, endpoint) {
      const res = await fetchImpl(`${base}/rest/v1/rpc/consume_routing_quota`, {
        method: 'POST',
        headers: { ...headers(jwt), 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_endpoint: endpoint }),
        signal: timeout(),
      });
      // PostgREST answers 403 for SQLSTATE 42501 (plan not entitled).
      if (res.status === 403) throw new HttpError(403, { error: 'not_entitled' });
      if (!res.ok) throw new HttpError(502, { error: 'quota_check_failed' });
      return res.json();
    },
    /** Anon-key read of a public table, e.g. incident_shelters. */
    async restGet(pathAndQuery) {
      const res = await fetchImpl(`${base}/rest/v1/${pathAndQuery}`, { headers: headers(null), signal: timeout() });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      return res.json();
    },
  };
}

export async function authorize(supabase, headers) {
  const jwt = bearerFrom(headers);
  if (!jwt) throw new HttpError(401, { error: 'unauthenticated' });
  const user = await supabase.getUser(jwt);
  if (!user?.id) throw new HttpError(401, { error: 'unauthenticated' });
  const sub = await supabase.getSubscription(jwt, user.id);
  if (!sub || !ENTITLED_PLANS.has(sub.plan) || !PAID_STATUSES.has(sub.status)) {
    throw new HttpError(403, { error: 'not_entitled' });
  }
  return { jwt, userId: user.id };
}

/** One unit per ORS HTTP request; throws 429 when any bucket is full. */
export async function takeQuota(supabase, jwt, endpoint) {
  const r = await supabase.consumeQuota(jwt, endpoint);
  if (r?.ok === true) return;
  throw new HttpError(429, {
    error: 'quota',
    scope: r?.scope === 'user' ? 'user' : 'global',
    window: r?.window === 'day' ? 'day' : 'minute',
    retryAfterSec: Number.isFinite(r?.retry_after_sec) ? r.retry_after_sec : 60,
  });
}
