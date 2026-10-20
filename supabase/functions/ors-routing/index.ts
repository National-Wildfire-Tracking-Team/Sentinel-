/**
 * ors-routing – Supabase Edge Function
 *
 * Route to Safety backend (Pro/Team; "Navigation" in the UI), called at
 * /functions/v1/ors-routing/<path>:
 *
 *   POST /shelters/nearest  { origin:[lng,lat], radiusKm? } → { shelters, partial }
 *   POST /route             { origin, destination, avoid, preference? } → { route, avoidedHazards }
 *   GET  /health
 *
 * Auth: Authorization: Bearer <Supabase JWT>; Pro/Team only; every ORS call
 * takes a unit from public.consume_routing_quota first. See README.md.
 *
 * Required secret (set via: supabase secrets set Routing=<ORS API key>):
 *   Routing – the OpenRouteService key, bare or JSON { "ORS_API_KEY": "…" }
 */

import { createSupabase } from './auth.mjs';
import { TtlCache } from './cache.mjs';
import { createHandlers } from './handlers.mjs';
import { createOrs } from './ors.mjs';
import { createKeyLoader } from './secret.mjs';
import { createRequestHandler } from './server.mjs';
import { fetchFemaShelters, fetchSentinelShelters } from './shelters.mjs';

// The client caps its body at ~150 KB (routingHazards MAX_AVOID_BYTES); 512 KB
// is headroom.
const MAX_BODY_BYTES = 512 * 1024;
// Supabase injects these into every Edge Function.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const ORS_SECRET_NAME = 'Routing';

// Never log headers, tokens, the ORS key or upstream bodies — only path,
// status, latency and error kinds.
function log(severity: string, message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ severity, message, component: 'ors-routing', ...fields }));
}

const loadApiKey = createKeyLoader(() => Deno.env.get(ORS_SECRET_NAME) ?? '');

const supabase = createSupabase({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
const handlers = createHandlers({
  supabase,
  ors: createOrs(loadApiKey),
  shelterSources: {
    sentinel: (origin: [number, number], radiusKm: number) => fetchSentinelShelters({ supabase, origin, radiusKm }),
    fema: (origin: [number, number], radiusKm: number) => fetchFemaShelters({ origin, radiusKm }),
  },
  nearestCache: new TtlCache({ ttlMs: 10 * 60_000 }),
  routeCache: new TtlCache({ ttlMs: 10 * 60_000 }),
  log,
});

// A stray rejection must never take the worker (and its in-memory caches) down.
globalThis.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  log('ERROR', 'unhandled_rejection', { kind: (event.reason as Error | undefined)?.name });
});

Deno.serve(createRequestHandler({
  handlers,
  log,
  config: { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, allowedOrigins: ALLOWED_ORIGINS, maxBodyBytes: MAX_BODY_BYTES },
}));
