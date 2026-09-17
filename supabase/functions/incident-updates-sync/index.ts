/**
 * incident-updates-sync – Supabase Edge Function
 *
 * Deno port of scripts/incident-updates-sync.mjs, which previously ran on
 * GitHub Actions (.github/workflows/incident-notification-sync.yml, every 5
 * minutes). Moved here because this workload is pure `fetch` + Node builtins
 * (no npm deps, no native binaries, seconds-scale runtime) and needs no
 * GitHub Actions runner — unlike MRMS (needs a native wgrib2 binary) and
 * NEXRAD (full-volume decode already documented to exceed Edge Function
 * memory limits, see supabase/functions/nexrad-heartbeat/index.ts), both of
 * which now run on Google Cloud Run Jobs instead (see
 * cloud/nexrad-sync/README.md and cloud/mrms-sync/README.md).
 *
 * Generates automated incident_updates entries ("New fire reported...",
 * containment/acreage/status/personnel change notices) for WFIGS (IRWIN)
 * and CAL FIRE incidents, diffed against the durable
 * public.incident_source_snapshot table so state survives between
 * invocations (this function has no in-memory state of its own).
 *
 * Invoked every 5 minutes by the `incident-updates-sync` pg_cron job (see
 * supabase/migrations/20260915000000_scheduled_sync_infrastructure.sql) via
 * pg_net, authenticated with the project's service_role key — which is only
 * ever read from Supabase Vault inside Postgres and from this function's own
 * environment, never sent to the browser or committed to git.
 *
 * The try_claim_sync_job/release_sync_job pair (also from that migration)
 * guards against overlapping runs: if a previous invocation is still
 * processing (or crashed without releasing, in which case the claim is
 * reclaimable after 600s), this invocation exits immediately instead of
 * doing duplicate work.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const WFIGS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';
const CAL_FIRE_URL = 'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';
const MIN_ACRES = 0.1;
const UPSTREAM_TIMEOUT_MS = 20_000;
const JOB_NAME = 'incident-updates-sync';
const STALE_AFTER_SECONDS = 600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function supabaseHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/** Same normalization as src/app/utils/useMergedFireData.js's getFireMatchKey,
 * used here only to collapse WFIGS's occasional duplicate records for one fire. */
function getFireMatchKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (upper === 'UNKNOWN' || upper === 'UNKNOWN FIRE' || upper === 'UNNAMED' || upper === '') return null;
  let key = upper;
  if (key.includes('/')) key = key.split('/').pop()!.trim();
  key = key
    .replace(/FIRE PERIMETER/g, '')
    .replace(/PERIMETER/g, '')
    .replace(/INCIDENT/g, '')
    .replace(/\bFIRE\b/g, '')
    .replace(/\s+/g, '');
  return key || null;
}

type Incident = {
  id: string;
  name: string;
  acres: number;
  contained: number;
  personnel?: number;
  status: string;
  started?: string | null;
  updated?: string | null;
};

function dedupeByName(incidents: Incident[]): Incident[] {
  const byKey = new Map<string, Incident>();
  const unkeyed: Incident[] = [];
  for (const inc of incidents) {
    const key = getFireMatchKey(inc.name);
    if (!key) {
      unkeyed.push(inc);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || new Date(inc.updated ?? 0) > new Date(existing.updated ?? 0)) {
      byKey.set(key, inc);
    }
  }
  return [...byKey.values(), ...unkeyed];
}

async function fetchWfigsIncidents(): Promise<Incident[]> {
  const where = [
    `IncidentTypeCategory='WF'`,
    `IncidentSize>=${MIN_ACRES}`,
    `ControlDateTime IS NULL`,
  ].join(' AND ');
  const params = new URLSearchParams({
    where,
    outFields: [
      'UniqueFireIdentifier', 'IncidentName', 'IncidentSize', 'PercentContained',
      'ModifiedOnDateTime_dt', 'FireDiscoveryDateTime', 'TotalIncidentPersonnel',
    ].join(','),
    f: 'json',
    outSR: '4326',
    returnGeometry: 'false',
  });
  const resp = await fetch(`${WFIGS_URL}?${params}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Fetch WFIGS incidents failed: ${resp.status}`);
  const data = await resp.json();
  const incidents = (data.features || [])
    .map((f: any) => {
      const p = f.attributes || {};
      return {
        id: p.UniqueFireIdentifier,
        name: p.IncidentName || 'Unknown Fire',
        acres: Math.round(p.IncidentSize || 0),
        contained: p.PercentContained ?? 0,
        personnel: p.TotalIncidentPersonnel || 0,
        status: (p.PercentContained ?? 0) >= 100 ? 'controlled' : 'active',
        started: p.FireDiscoveryDateTime ? new Date(p.FireDiscoveryDateTime).toISOString() : null,
        updated: p.ModifiedOnDateTime_dt ? new Date(p.ModifiedOnDateTime_dt).toISOString() : null,
      };
    })
    .filter((inc: Incident) => inc.id);
  return dedupeByName(incidents);
}

async function fetchCalFireIncidents(): Promise<Incident[]> {
  const resp = await fetch(`${CAL_FIRE_URL}?inactive=false`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
      Referer: 'https://incidents.fire.ca.gov/',
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Fetch CAL FIRE incidents failed: ${resp.status}`);
  const data = await resp.json();
  return (data.features || [])
    .filter((f: any) => {
      const t = (f.properties?.Type || '').toLowerCase();
      return !t || t === 'wildfire';
    })
    .map((f: any) => {
      const p = f.properties || {};
      const acres = Math.round(Number(p.AcresBurned) || 0);
      const contained = Number(p.PercentContained ?? 0) || 0;
      return {
        id: p.UniqueId,
        name: p.Name || 'Unknown Fire',
        acres,
        contained,
        status: contained >= 100 ? 'controlled' : 'active',
      };
    })
    .filter((inc: Incident) => inc.id);
}

async function fetchSnapshot(source: string): Promise<Map<string, any>> {
  const params = new URLSearchParams({
    select: 'incident_id,incident_name,contained,acres,status,personnel',
    source: `eq.${source}`,
  });
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/incident_source_snapshot?${params}`, {
    headers: supabaseHeaders(),
  });
  if (!resp.ok) throw new Error(`Fetch snapshot (${source}) failed: ${resp.status}`);
  const rows = await resp.json();
  return new Map(rows.map((r: any) => [r.incident_id, r]));
}

async function writeSnapshot(source: string, incidents: Incident[]): Promise<void> {
  if (!incidents.length) return;
  const rows = incidents.map((inc) => ({
    source,
    incident_id: inc.id,
    incident_name: inc.name,
    contained: inc.contained,
    acres: inc.acres,
    status: inc.status,
    personnel: inc.personnel ?? null,
    updated_at: new Date().toISOString(),
  }));
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/incident_source_snapshot?on_conflict=source,incident_id`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      }),
      body: JSON.stringify(rows),
    },
  );
  if (!resp.ok) {
    throw new Error(`Snapshot upsert (${source}) failed (${resp.status}): ${await resp.text().catch(() => '')}`);
  }
}

async function insertIncidentUpdate({ incidentId, incidentName, content, sourceName, dedupKey }: {
  incidentId: string; incidentName: string | null; content: string; sourceName: string; dedupKey?: string | null;
}): Promise<boolean> {
  const resp = await fetch(
    dedupKey
      ? `${SUPABASE_URL}/rest/v1/incident_updates?on_conflict=dedup_key`
      : `${SUPABASE_URL}/rest/v1/incident_updates`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        ...(dedupKey ? { Prefer: 'resolution=ignore-duplicates' } : {}),
      }),
      body: JSON.stringify({
        incident_id: incidentId,
        incident_name: incidentName ?? null,
        content,
        source_type: 'automated',
        source_name: sourceName,
        user_id: null,
        dedup_key: dedupKey ?? null,
      }),
    },
  );
  if (!resp.ok) {
    console.warn(`[${JOB_NAME}] insert failed (${resp.status}) for ${incidentId}:`, await resp.text().catch(() => ''));
    return false;
  }
  return true;
}

function formatNewFireContent(inc: Incident, sourceLabel: string): string {
  const discoveryDate = inc.started ? new Date(inc.started) : new Date();
  const timeStr = discoveryDate.toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  });
  const weekday = discoveryDate.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const monthDay = discoveryDate.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ordinal = (d: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = d % 100;
    return d + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const day = discoveryDate.getUTCDate();
  return `New fire reported by ${sourceLabel} at ${timeStr} ${weekday} ${monthDay.split(' ')[0]} ${ordinal(day)} (UTC).`;
}

type SyncCounts = { newFires: number; fieldChanges: number };

/**
 * Diff current incidents against the durable snapshot for one source and
 * write "new fire" / field-change entries to incident_updates. Skipped
 * entirely on the very first run for a source (empty snapshot) so bringing
 * this table online doesn't retroactively announce every currently-active
 * fire as "new".
 */
async function syncSource({ source, newFireLabel, newFireDedupSuffix, fieldChangeLabel, incidents, hasPersonnel }: {
  source: string; newFireLabel: string; newFireDedupSuffix: string; fieldChangeLabel: string;
  incidents: Incident[]; hasPersonnel: boolean;
}): Promise<SyncCounts> {
  const snapshot = await fetchSnapshot(source);
  const isBootstrap = snapshot.size === 0;
  const counts: SyncCounts = { newFires: 0, fieldChanges: 0 };

  for (const inc of incidents) {
    const old = snapshot.get(inc.id);

    if (!old) {
      if (!isBootstrap) {
        const inserted = await insertIncidentUpdate({
          incidentId: inc.id,
          incidentName: inc.name,
          content: formatNewFireContent(inc, newFireLabel),
          sourceName: newFireLabel,
          dedupKey: `${inc.id}:${newFireDedupSuffix}`,
        });
        if (inserted) counts.newFires++;
      }
      continue;
    }

    const changes: string[] = [];
    if (Number(old.contained) !== inc.contained)
      changes.push(`Containment: ${old.contained}% → ${inc.contained}%`);
    if (Number(old.acres) !== inc.acres)
      changes.push(`Acres: ${Number(old.acres).toLocaleString()} → ${inc.acres.toLocaleString()}`);
    if (old.status !== inc.status)
      changes.push(`Status: ${old.status} → ${inc.status}`);
    if (hasPersonnel && Number(old.personnel) !== inc.personnel && (inc.personnel ?? 0) > 0)
      changes.push(`Personnel: ${Number(old.personnel).toLocaleString()} → ${(inc.personnel ?? 0).toLocaleString()}`);

    if (changes.length > 0) {
      const inserted = await insertIncidentUpdate({
        incidentId: inc.id,
        incidentName: inc.name,
        content: changes.join('\n'),
        sourceName: fieldChangeLabel,
      });
      if (inserted) counts.fieldChanges++;
    }
  }

  await writeSnapshot(source, incidents);
  return counts;
}

async function claimJob(): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/try_claim_sync_job`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_job_name: JOB_NAME, p_stale_after_seconds: STALE_AFTER_SECONDS }),
  });
  if (!resp.ok) throw new Error(`try_claim_sync_job failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  return (await resp.json()) === true;
}

async function releaseJob(success: boolean, error?: string): Promise<void> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/release_sync_job`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_job_name: JOB_NAME, p_success: success, p_error: error ? String(error).slice(0, 500) : null }),
  });
  if (!resp.ok) console.warn(`[${JOB_NAME}] release_sync_job failed: ${resp.status}`);
}

async function runSync() {
  const [wfigs, calFire] = await Promise.all([
    fetchWfigsIncidents().catch((err) => {
      console.warn(`[${JOB_NAME}] WFIGS fetch failed:`, err.message);
      return [] as Incident[];
    }),
    fetchCalFireIncidents().catch((err) => {
      console.warn(`[${JOB_NAME}] CAL FIRE fetch failed:`, err.message);
      return [] as Incident[];
    }),
  ]);
  console.log(`[${JOB_NAME}] ${wfigs.length} WFIGS incident(s), ${calFire.length} CAL FIRE incident(s)`);

  // 'WildCAD' + 'wildcad-new-fire' match what useIncidents.js previously used
  // for the "new fire" notice specifically (kept for continuity with existing
  // dedup_key rows); field-change notices use 'IRWIN / WFIGS', also as before.
  const wfigsCounts = await syncSource({
    source: 'wfigs', newFireLabel: 'WildCAD', newFireDedupSuffix: 'wildcad-new-fire',
    fieldChangeLabel: 'IRWIN / WFIGS', incidents: wfigs, hasPersonnel: true,
  });
  const calFireCounts = await syncSource({
    source: 'calfire', newFireLabel: 'CAL FIRE', newFireDedupSuffix: 'calfire-new-fire',
    fieldChangeLabel: 'CAL FIRE', incidents: calFire, hasPersonnel: false,
  });

  return {
    wfigsIncidentCount: wfigs.length,
    calFireIncidentCount: calFire.length,
    wfigsNewFires: wfigsCounts.newFires,
    wfigsFieldChanges: wfigsCounts.fieldChanges,
    calFireNewFires: calFireCounts.newFires,
    calFireFieldChanges: calFireCounts.fieldChanges,
  };
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  console.log(`[${JOB_NAME}] starting`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500);
  }

  let claimed: boolean;
  try {
    claimed = await claimJob();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB_NAME}] claim failed:`, message);
    return jsonResponse({ ok: false, error: message }, 500);
  }

  if (!claimed) {
    console.log(`[${JOB_NAME}] skipped: previous run still in progress`);
    return jsonResponse({ ok: true, skipped: true, reason: 'already running' });
  }

  try {
    const summary = await runSync();
    await releaseJob(true);
    const durationMs = Date.now() - startedAt;
    console.log(`[${JOB_NAME}] done in ${durationMs}ms`, summary);
    return jsonResponse({ ok: true, durationMs, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${JOB_NAME}] fatal:`, message);
    await releaseJob(false, message).catch(() => {});
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
