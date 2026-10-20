/**
 * lightning-builder – Supabase Edge Function
 *
 * Live lightning for the Weather and All Hazards tabs: every minute, the
 * `lightning-builder` pg_cron job (migration 20261020124634_lightning_on_supabase.sql)
 * POSTs here; this reads NOAA's new GOES GLM files and rewrites
 * lightning/v1/latest.json.gz in public Storage, which browsers fetch from
 * the CDN. See README.md and builder.mjs.
 *
 * Secrets: none of its own. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * injected by Supabase; NOAA's buckets are read anonymously.
 *
 * Optional env: LIGHTNING_WINDOW_SECONDS (900), LIGHTNING_MAX_FILES (30 per
 * satellite per run), LIGHTNING_WORKERS (8 concurrent downloads).
 */

import h5wasm from 'npm:h5wasm@0.8.8';
import { LightningBuilder } from './builder.mjs';
import { createGlmReader } from './glm.mjs';
import { createHandler, createJobLock } from './handler.mjs';
import { GlmSource } from './source.mjs';
import { StorageStore } from './store.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(Deno.env.get(name) ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Never logged: flash positions. One JSON line per run, like the other Sentinel services.
function log(severity: string, message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ severity, message, component: 'lightning', ...fields }));
}

const { FS } = await h5wasm.ready;
const readFlashes = createGlmReader({ File: h5wasm.File, FS });
const lock = createJobLock({ url: SUPABASE_URL, serviceKey: SERVICE_KEY });

Deno.serve(createHandler({
  build: () => new LightningBuilder(
    new GlmSource(),
    new StorageStore({ url: SUPABASE_URL, serviceKey: SERVICE_KEY }),
    readFlashes,
    {
      windowSeconds: envInt('LIGHTNING_WINDOW_SECONDS', 900),
      maxFilesPerSatellite: envInt('LIGHTNING_MAX_FILES', 30),
      workers: envInt('LIGHTNING_WORKERS', 8),
      log,
    },
  ).run(),
  claim: lock.claim,
  release: lock.release,
  log,
}));
