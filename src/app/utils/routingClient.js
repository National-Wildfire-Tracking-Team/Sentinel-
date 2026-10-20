/**
 * routingClient.js
 * Browser client for the ors-routing Supabase Edge Function (Route to Safety /
 * "Navigation", Pro); see supabase/functions/ors-routing/README.md. Plain
 * fetch rather than supabase.functions.invoke so the service's status codes
 * and error bodies map straight onto RoutingError.
 */

import { supabase } from '../../shared/api/supabaseClient';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const DEFAULT_BASE_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ors-routing` : '';
const DEFAULT_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const DEFAULT_RADIUS_KM = 80;

export class RoutingError extends Error {
  constructor(kind, { status = 0, scope = null, window = null, retryAfterSec = null } = {}) {
    super(kind);
    this.name = 'RoutingError';
    this.kind = kind;
    this.status = status;
    this.scope = scope;
    this.window = window;
    this.retryAfterSec = retryAfterSec;
  }
}

async function sessionToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

const KIND_BY_STATUS = { 400: 'invalid', 401: 'unauthenticated', 403: 'not_entitled', 413: 'invalid', 422: 'no_route', 503: 'not_configured' };

async function post(path, payload, {
  signal, getToken = sessionToken, fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, anonKey = DEFAULT_ANON_KEY,
} = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new RoutingError('not_configured');
  const token = await getToken();
  if (!token) throw new RoutingError('unauthenticated');

  const res = await fetchImpl(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status === 429) {
    throw new RoutingError('quota', {
      status: 429,
      scope: data.scope === 'user' ? 'user' : 'global',
      window: data.window === 'day' ? 'day' : 'minute',
      retryAfterSec: Number(data.retryAfterSec) || 60,
    });
  }
  throw new RoutingError(KIND_BY_STATUS[res.status] || 'upstream', { status: res.status });
}

export function findNearestShelters({ origin, radiusKm = DEFAULT_RADIUS_KM }, opts) {
  return post('/shelters/nearest', { origin, radiusKm }, opts);
}

export function requestRoute({ origin, destination, avoid, preference }, opts) {
  return post('/route', { origin, destination, avoid: avoid ?? null, ...(preference ? { preference } : {}) }, opts);
}
