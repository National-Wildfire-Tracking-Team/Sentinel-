/**
 * routingClient.js
 * Browser client for cloud/ors-routing (Route to Safety / "Navigation", Pro). The service
 * sits behind CloudFront OAC, which owns the Authorization header and needs
 * the SHA-256 of every POST body in x-amz-content-sha256 — so the Supabase
 * token travels in x-sentinel-auth instead.
 */

import { supabase } from '../../shared/api/supabaseClient';

// In `npm run dev` with no URL set, use the Vite proxy to a local service
// started by `npm run dev:routing` (see cloud/ors-routing/dev.mjs).
const DEFAULT_BASE_URL = import.meta.env.VITE_ORS_ROUTING_URL || (import.meta.env.DEV ? '/ors-routing' : '');
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

export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sessionToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

const KIND_BY_STATUS = { 400: 'invalid', 401: 'unauthenticated', 403: 'not_entitled', 413: 'invalid', 422: 'no_route', 503: 'not_configured' };

async function post(path, payload, { signal, getToken = sessionToken, fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new RoutingError('not_configured');
  const token = await getToken();
  if (!token) throw new RoutingError('unauthenticated');

  const body = JSON.stringify(payload);
  const res = await fetchImpl(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sentinel-auth': `Bearer ${token}`,
      'x-amz-content-sha256': await sha256Hex(body),
    },
    body,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status === 429) {
    // too_many_failures (the service's per-IP auth-failure block) and the WAF
    // rate rule are about this caller, not shared capacity: per-user copy.
    const perCaller = data.scope === 'user' || data.error === 'too_many_failures';
    throw new RoutingError('quota', {
      status: 429,
      scope: perCaller ? 'user' : 'global',
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
