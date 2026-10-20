/**
 * handler.mjs
 * The HTTP side of the builder, with every dependency injected so it is
 * testable without Deno, Supabase or NOAA. index.ts only wires it up.
 *
 * Only the lightning-builder pg_cron job calls this, with the service-role
 * key. The Functions gateway verifies the JWT (verify_jwt stays on); this
 * also requires its role to be service_role, so a signed-in user's token
 * can't trigger builds. The sync_job_locks claim keeps runs from overlapping.
 */

export const JOB_NAME = 'lightning-builder';
// A run takes seconds; a claim older than this is a crashed run, so take it over.
export const STALE_AFTER_SECONDS = 120;

/** The `role` claim of a bearer JWT (the gateway has already checked its signature). */
export function bearerRole(authorization) {
  const m = /^Bearer\s+([^.\s]+)\.([^.\s]+)\.[^.\s]*$/i.exec(String(authorization || '').trim());
  if (!m) return null;
  try {
    const json = atob(m[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(m[2].length / 4) * 4, '='));
    return JSON.parse(json)?.role ?? null;
  } catch {
    return null;
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export function createHandler({ build, claim, release, log }) {
  return async function handleRequest(req) {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (bearerRole(req.headers.get('authorization')) !== 'service_role') return json({ error: 'Forbidden' }, 403);

    let claimed;
    try {
      claimed = await claim(JOB_NAME, STALE_AFTER_SECONDS);
    } catch (err) {
      log('ERROR', 'lightning_claim_failed', { error: String(err?.message ?? err).slice(0, 300) });
      return json({ ok: false, error: 'claim_failed' }, 500);
    }
    if (!claimed) {
      log('INFO', 'lightning_skipped', { reason: 'previous run still in progress' });
      return json({ ok: true, skipped: true });
    }

    const started = performance.now();
    try {
      const summary = await build();
      await release(JOB_NAME, true).catch(() => {});
      log('INFO', 'lightning_run', {
        lightning_build_seconds: Math.round((performance.now() - started) / 100) / 10,
        lightning_files_read: summary.filesRead,
        lightning_source_bytes: summary.sourceBytes,
        lightning_flashes: summary.flashes,
        lightning_bytes_written: summary.bytesWritten,
        lightning_source_errors: summary.sourceErrors,
        lightning_latest_age_seconds: summary.latestAgeSeconds,
        lightning_build_errors: 0,
        satellites: summary.satellites,
      });
      return json({ ok: true, ...summary });
    } catch (err) {
      // A store failure or a bug: nothing new was written, the previous file stays.
      const detail = String(err?.message ?? err).slice(0, 300);
      await release(JOB_NAME, false, detail).catch(() => {});
      log('ERROR', 'lightning_failed', { lightning_build_errors: 1, error: err?.name, detail });
      return json({ ok: false, error: 'build_failed' }, 500);
    }
  };
}

/** try_claim_sync_job / release_sync_job (migration 20260915000000) over PostgREST, as the service role. */
export function createJobLock({ url, serviceKey, fetchImpl = fetch }) {
  const rpc = (fn, args) => fetchImpl(`${String(url).replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });
  return {
    async claim(jobName, staleAfterSeconds) {
      const res = await rpc('try_claim_sync_job', { p_job_name: jobName, p_stale_after_seconds: staleAfterSeconds });
      if (!res.ok) throw new Error(`try_claim_sync_job failed: HTTP ${res.status}`);
      return (await res.json()) === true;
    },
    async release(jobName, success, error = null) {
      const res = await rpc('release_sync_job', { p_job_name: jobName, p_success: success, p_error: error });
      await res.body?.cancel();
    },
  };
}
