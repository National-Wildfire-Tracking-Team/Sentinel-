/**
 * calfire-evacuations-sync – Supabase Edge Function
 *
 * Keeps incident_evacuations current for the incidents CAL FIRE is leading
 * (CalFireIncident = true in the incidents.fire.ca.gov feed), and posts an
 * 'evacuation' incident_updates entry whenever a fire's order or warning
 * zones change.
 *
 * CAL FIRE publishes no evacuation feed (its incident pages sit behind
 * Akamai and the IncidentApi has no evacuation fields), so zones come from
 * Genasys Protect's public map server, the system most California counties
 * issue zone orders through. That GeoServer is the backend of
 * protect.genasys.com, not a documented API: if its URL or schema changes,
 * the fetch fails and this run exits without touching any rows. Zones carry
 * no incident id, so _shared/calFireEvacuations.js matches them to fires by
 * distance.
 *
 * Rows a reporter entered are never overwritten or deleted; see
 * _shared/calFireEvacuations.js for how this sync marks its own rows.
 *
 * Kept separate from incident-updates-sync so the two deploy independently.
 * Invoked every 5 minutes by the `calfire-evacuations-sync` pg_cron job (see
 * supabase/migrations/20261022000000_calfire_evacuations_sync_cron.sql) with
 * the service_role key, guarded by try_claim_sync_job/release_sync_job.
 */

import {
  AUTO_NOTES,
  assignZonesToIncidents,
  describeEvacuationChanges,
  planEvacuationWrites,
} from '../_shared/calFireEvacuations.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CAL_FIRE_URL = 'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';
const GENASYS_WFS_URL = 'https://cdngeospatialcei.zonehaven.com/geoserver/zonehavenv2/wfs';
const UPSTREAM_TIMEOUT_MS = 20_000;
const JOB_NAME = 'calfire-evacuations-sync';
const STALE_AFTER_SECONDS = 600;
const SOURCE_NAME = 'CAL FIRE / Genasys Protect';

type Incident = { id: string; name: string; lat: number; lng: number; acres: number };
type EvacRow = { incident_id: string; level: 'order' | 'warning'; zones: string[]; notes: string | null; created_by: string | null };

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

/** Active wildfires CAL FIRE is leading. */
async function fetchCalFireLedIncidents(): Promise<Incident[]> {
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
      const p = f.properties || {};
      const t = (p.Type || '').toLowerCase();
      return p.CalFireIncident === true && p.IsActive !== false && (!t || t === 'wildfire');
    })
    .map((f: any) => {
      const p = f.properties;
      return {
        id: p.UniqueId,
        name: (p.Name || 'Unknown Fire').trim(),
        lat: Number(p.Latitude),
        lng: Number(p.Longitude),
        acres: Number(p.AcresBurned) || 0,
      };
    })
    .filter((inc: Incident) => inc.id);
}

/** California Genasys zones under any non-Normal status, in WGS84. */
async function fetchGenasysZones(): Promise<any[]> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'zonehavenv2:evacuation_zone',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    CQL_FILTER: "status<>'Normal' AND identifer LIKE 'US-CA-%' AND layerName='Genasys'",
  });
  const resp = await fetch(`${GENASYS_WFS_URL}?${params}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Fetch Genasys zones failed: ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data?.features)) throw new Error('Genasys zones response has no features array');
  return data.features;
}

async function fetchExistingRows(incidentIds: string[]): Promise<EvacRow[]> {
  if (!incidentIds.length) return [];
  const list = incidentIds.map((id) => `"${id}"`).join(',');
  const params = new URLSearchParams({
    select: 'incident_id,level,zones,notes,created_by',
    incident_id: `in.(${list})`,
  });
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/incident_evacuations?${params}`, { headers: supabaseHeaders() });
  if (!resp.ok) throw new Error(`Fetch incident_evacuations failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  return resp.json();
}

/** PostgREST filter matching only this sync's own row for (incident, level). */
function ownRowFilter(incidentId: string, level: string): string {
  return new URLSearchParams({
    incident_id: `eq.${incidentId}`,
    level: `eq.${level}`,
    created_by: 'is.null',
    notes: `eq.${AUTO_NOTES}`,
  }).toString();
}

/**
 * Insert new rows (ignoring any a reporter added since the read) and patch
 * existing ones only while they're still this sync's own. Returns whether the
 * write landed, so an update is only posted for changes that took effect.
 */
async function writeRow(row: any, isNew: boolean): Promise<boolean> {
  const resp = isNew
    ? await fetch(`${SUPABASE_URL}/rest/v1/incident_evacuations?on_conflict=incident_id,level`, {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify(row),
    })
    : await fetch(`${SUPABASE_URL}/rest/v1/incident_evacuations?${ownRowFilter(row.incident_id, row.level)}`, {
      method: 'PATCH',
      headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ zones: row.zones, links: row.links }),
    });
  if (!resp.ok) {
    console.warn(`[${JOB_NAME}] write failed (${resp.status}) for ${row.incident_id}/${row.level}:`, await resp.text().catch(() => ''));
    return false;
  }
  return (await resp.json()).length > 0;
}

async function deleteRow(incidentId: string, level: string): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/incident_evacuations?${ownRowFilter(incidentId, level)}`, {
    method: 'DELETE',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
  });
  if (!resp.ok) {
    console.warn(`[${JOB_NAME}] delete failed (${resp.status}) for ${incidentId}/${level}:`, await resp.text().catch(() => ''));
    return false;
  }
  return (await resp.json()).length > 0;
}

// Same fallback as incident-updates-sync: prod may predate the update_type
// column (20261005000000_incident_update_type.sql).
let sendUpdateType = true;

async function insertEvacuationUpdate(incidentId: string, incidentName: string, content: string): Promise<boolean> {
  const post = (withType: boolean) => fetch(`${SUPABASE_URL}/rest/v1/incident_updates`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      incident_id: incidentId,
      incident_name: incidentName,
      content,
      source_type: 'automated',
      source_name: SOURCE_NAME,
      user_id: null,
      ...(withType ? { update_type: 'evacuation' } : {}),
    }),
  });

  let resp = await post(sendUpdateType);
  if (!resp.ok && sendUpdateType) {
    const body = await resp.text().catch(() => '');
    if (!(resp.status === 400 && body.includes('PGRST204') && body.includes('update_type'))) {
      console.warn(`[${JOB_NAME}] update insert failed (${resp.status}) for ${incidentId}:`, body);
      return false;
    }
    sendUpdateType = false;
    resp = await post(false);
  }
  if (!resp.ok) {
    console.warn(`[${JOB_NAME}] update insert failed (${resp.status}) for ${incidentId}:`, await resp.text().catch(() => ''));
    return false;
  }
  return true;
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
  // Either upstream failing aborts the run: writing from a partial picture
  // would lift evacuations that are still in effect.
  const [incidents, zones] = await Promise.all([fetchCalFireLedIncidents(), fetchGenasysZones()]);
  const incidentIds = incidents.map((i) => i.id);
  const assignments = assignZonesToIncidents(incidents, zones);
  const existingRows = await fetchExistingRows(incidentIds);
  const existingKeys = new Set(existingRows.map((r) => `${r.incident_id}|${r.level}`));
  const { upserts, deletes, changes } = planEvacuationWrites({ incidentIds, assignments, existingRows });

  const applied = new Set<string>();
  for (const row of upserts) {
    if (await writeRow(row, !existingKeys.has(`${row.incident_id}|${row.level}`))) {
      applied.add(`${row.incident_id}|${row.level}`);
    }
  }
  for (const { incident_id, level } of deletes) {
    if (await deleteRow(incident_id, level)) applied.add(`${incident_id}|${level}`);
  }

  const names = new Map(incidents.map((i) => [i.id, i.name]));
  let updatesPosted = 0;
  for (const incidentId of new Set(changes.map((c) => c.incidentId))) {
    const content = describeEvacuationChanges(
      changes.filter((c) => c.incidentId === incidentId && applied.has(`${incidentId}|${c.level}`)),
    );
    if (content && await insertEvacuationUpdate(incidentId, names.get(incidentId) ?? '', content)) updatesPosted++;
  }

  return {
    calFireLedIncidents: incidents.length,
    genasysZones: zones.length,
    incidentsWithEvacuations: assignments.size,
    rowsWritten: upserts.filter((r) => applied.has(`${r.incident_id}|${r.level}`)).length,
    rowsLifted: deletes.filter((d) => applied.has(`${d.incident_id}|${d.level}`)).length,
    updatesPosted,
  };
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  console.log(`[${JOB_NAME}] starting`);
  sendUpdateType = true;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500);
  }

  let claimed: boolean;
  try {
    claimed = await claimJob();
  } catch (err) {
    console.error(`[${JOB_NAME}] claim failed:`, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Internal error' }, 500);
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
    return jsonResponse({ ok: false, error: 'Internal error' }, 500);
  }
});
