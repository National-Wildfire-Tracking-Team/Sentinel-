/**
 * index.mjs
 * ors-routing — Route to Safety backend (Pro; "Navigation" in the UI). Lambda via Lambda Web Adapter,
 * behind the data-services CloudFront distribution at /ors-routing (prefix
 * stripped before it reaches us).
 *
 * POST /shelters/nearest  { origin:[lng,lat], radiusKm? } → { shelters, partial }
 * POST /route             { origin, destination, avoid }  → { route, avoidedHazards }
 * GET  /health
 *
 * Auth: x-sentinel-auth: Bearer <Supabase JWT>; Pro/Team only; every ORS call
 * takes a unit from public.consume_routing_quota first. See README.md.
 */

import { createServer } from 'node:http';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSupabase } from './auth.mjs';
import { TtlCache } from './cache.mjs';
import { createHandlers } from './handlers.mjs';
import { createOrs } from './ors.mjs';
import { FailureLimiter } from './limiter.mjs';
import { createKeyLoader } from './secret.mjs';
import { createRequestListener } from './server.mjs';
import { fetchFemaShelters, fetchSentinelShelters } from './shelters.mjs';

const PORT = process.env.PORT || 8080;
// The client caps its body at ~150 KB (routingHazards MAX_AVOID_BYTES); 512 KB
// is headroom. Lambda's own request limit is 6 MB.
const MAX_BODY_BYTES = 512 * 1024;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ORS_SECRET_ID = process.env.ORS_SECRET_ID || 'Routing';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

// Never log headers, tokens, the ORS key or upstream bodies — only path,
// status, latency and error kinds.
function log(severity, message, fields = {}) {
  console.log(JSON.stringify({ severity, message, component: 'ors-routing', ...fields }));
}

const authFailures = new FailureLimiter({ max: 20, windowMs: 10 * 60_000 });

// Local dev: ORS_API_KEY in the environment skips Secrets Manager.
const loadApiKey = createKeyLoader(async () => {
  if (process.env.ORS_API_KEY) return process.env.ORS_API_KEY;
  const sm = new SecretsManagerClient({});
  const out = await sm.send(new GetSecretValueCommand({ SecretId: ORS_SECRET_ID }));
  return out.SecretString ?? '';
});

const supabase = createSupabase({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
const handlers = createHandlers({
  supabase,
  ors: createOrs(loadApiKey),
  shelterSources: {
    sentinel: (origin, radiusKm) => fetchSentinelShelters({ supabase, origin, radiusKm }),
    fema: (origin, radiusKm) => fetchFemaShelters({ origin, radiusKm }),
  },
  nearestCache: new TtlCache({ ttlMs: 10 * 60_000 }),
  routeCache: new TtlCache({ ttlMs: 10 * 60_000 }),
  log,
});

const listener = createRequestListener({
  handlers,
  authFailures,
  log,
  config: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, allowedOrigins: ALLOWED_ORIGINS, maxBodyBytes: MAX_BODY_BYTES },
});

// A stray rejection must never take the instance (and its in-memory limiter) down.
process.on('unhandledRejection', (err) => log('ERROR', 'unhandled_rejection', { kind: err?.name }));

createServer(listener).listen(PORT, () => log('INFO', 'listening', { port: PORT }));
