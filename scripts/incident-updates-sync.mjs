/**
 * incident-updates-sync.mjs
 * Generates automated incident_updates entries ("New fire reported...",
 * containment/acreage/status/personnel change notices) for WFIGS (IRWIN)
 * and CAL FIRE incidents. Run on a schedule by
 * .github/workflows/incident-updates-sync.yml, mirroring
 * scripts/notification-sync.mjs's pattern (plain Node, raw REST calls to
 * Supabase with the service-role key, no @supabase/supabase-js client).
 *
 * This used to be done client-side (useIncidents.js/useCalFireIncidents.js
 * diffing each poll against an in-memory snapshot kept in the browser), which
 * only worked while some tab stayed open and foregrounded. This script is
 * stateless between runs, so it diffs against a durable snapshot kept in
 * public.incident_source_snapshot instead.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const WFIGS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';
const CAL_FIRE_URL = 'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';
const MIN_ACRES = 0.1;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/** Same normalization as useMergedFireData.js's getFireMatchKey, used here
 * only to collapse WFIGS's occasional duplicate records for one fire. */
function getFireMatchKey(name) {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (upper === 'UNKNOWN' || upper === 'UNKNOWN FIRE' || upper === 'UNNAMED' || upper === '') return null;
  let key = upper;
  if (key.includes('/')) key = key.split('/').pop().trim();
  key = key
    .replace(/FIRE PERIMETER/g, '')
    .replace(/PERIMETER/g, '')
    .replace(/INCIDENT/g, '')
    .replace(/\bFIRE\b/g, '')
    .replace(/\s+/g, '');
  return key || null;
}

function dedupeByName(incidents) {
  const byKey = new Map();
  const unkeyed = [];
  for (const inc of incidents) {
    const key = getFireMatchKey(inc.name);
    if (!key) {
      unkeyed.push(inc);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || new Date(inc.updated) > new Date(existing.updated)) {
      byKey.set(key, inc);
    }
  }
  return [...byKey.values(), ...unkeyed];
}

async function fetchWfigsIncidents() {
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
  const resp = await fetch(`${WFIGS_URL}?${params}`);
  if (!resp.ok) throw new Error(`Fetch WFIGS incidents failed: ${resp.status}`);
  const data = await resp.json();
  const incidents = (data.features || [])
    .map((f) => {
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
    .filter((inc) => inc.id);
  return dedupeByName(incidents);
}

async function fetchCalFireIncidents() {
  const resp = await fetch(`${CAL_FIRE_URL}?inactive=false`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
      Referer: 'https://incidents.fire.ca.gov/',
    },
  });
  if (!resp.ok) throw new Error(`Fetch CAL FIRE incidents failed: ${resp.status}`);
  const data = await resp.json();
  return (data.features || [])
    .filter((f) => {
      const t = (f.properties?.Type || '').toLowerCase();
      return !t || t === 'wildfire';
    })
    .map((f) => {
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
    .filter((inc) => inc.id);
}

async function fetchSnapshot(source) {
  const params = new URLSearchParams({
    select: 'incident_id,incident_name,contained,acres,status,personnel',
    source: `eq.${source}`,
  });
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/incident_source_snapshot?${params}`, {
    headers: supabaseHeaders(),
  });
  if (!resp.ok) throw new Error(`Fetch snapshot (${source}) failed: ${resp.status}`);
  const rows = await resp.json();
  return new Map(rows.map((r) => [r.incident_id, r]));
}

async function writeSnapshot(source, incidents) {
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

async function insertIncidentUpdate({ incidentId, incidentName, content, sourceName, dedupKey }) {
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
    console.warn(`[incident-updates-sync] insert failed (${resp.status}) for ${incidentId}:`, await resp.text().catch(() => ''));
  }
}

function formatNewFireContent(inc, sourceLabel) {
  const discoveryDate = inc.started ? new Date(inc.started) : new Date();
  const timeStr = discoveryDate.toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  });
  const weekday = discoveryDate.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const monthDay = discoveryDate.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ordinal = (d) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = d % 100;
    return d + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const day = discoveryDate.getUTCDate();
  return `New fire reported by ${sourceLabel} at ${timeStr} ${weekday} ${monthDay.split(' ')[0]} ${ordinal(day)} (UTC).`;
}

/**
 * Diff current incidents against the durable snapshot for one source and
 * write "new fire" / field-change entries to incident_updates. Skipped
 * entirely on the very first run for a source (empty snapshot) so bringing
 * this table online doesn't retroactively announce every currently-active
 * fire as "new".
 */
async function syncSource({ source, newFireLabel, newFireDedupSuffix, fieldChangeLabel, incidents, hasPersonnel }) {
  const snapshot = await fetchSnapshot(source);
  const isBootstrap = snapshot.size === 0;

  for (const inc of incidents) {
    const old = snapshot.get(inc.id);

    if (!old) {
      if (!isBootstrap) {
        await insertIncidentUpdate({
          incidentId: inc.id,
          incidentName: inc.name,
          content: formatNewFireContent(inc, newFireLabel),
          sourceName: newFireLabel,
          dedupKey: `${inc.id}:${newFireDedupSuffix}`,
        });
      }
      continue;
    }

    const changes = [];
    if (Number(old.contained) !== inc.contained)
      changes.push(`Containment: ${old.contained}% → ${inc.contained}%`);
    if (Number(old.acres) !== inc.acres)
      changes.push(`Acres: ${Number(old.acres).toLocaleString()} → ${inc.acres.toLocaleString()}`);
    if (old.status !== inc.status)
      changes.push(`Status: ${old.status} → ${inc.status}`);
    if (hasPersonnel && Number(old.personnel) !== inc.personnel && inc.personnel > 0)
      changes.push(`Personnel: ${Number(old.personnel).toLocaleString()} → ${inc.personnel.toLocaleString()}`);

    if (changes.length > 0) {
      await insertIncidentUpdate({
        incidentId: inc.id,
        incidentName: inc.name,
        content: changes.join('\n'),
        sourceName: fieldChangeLabel,
      });
    }
  }

  await writeSnapshot(source, incidents);
}

async function main() {
  console.log('[incident-updates-sync] starting');

  const [wfigs, calFire] = await Promise.all([
    fetchWfigsIncidents().catch((err) => {
      console.warn('[incident-updates-sync] WFIGS fetch failed:', err.message);
      return [];
    }),
    fetchCalFireIncidents().catch((err) => {
      console.warn('[incident-updates-sync] CAL FIRE fetch failed:', err.message);
      return [];
    }),
  ]);
  console.log(`[incident-updates-sync] ${wfigs.length} WFIGS incident(s), ${calFire.length} CAL FIRE incident(s)`);

  // 'WildCAD' + 'wildcad-new-fire' match what useIncidents.js previously used
  // for the "new fire" notice specifically (kept for continuity with existing
  // dedup_key rows); field-change notices use 'IRWIN / WFIGS', also as before.
  await syncSource({
    source: 'wfigs', newFireLabel: 'WildCAD', newFireDedupSuffix: 'wildcad-new-fire',
    fieldChangeLabel: 'IRWIN / WFIGS', incidents: wfigs, hasPersonnel: true,
  });
  await syncSource({
    source: 'calfire', newFireLabel: 'CAL FIRE', newFireDedupSuffix: 'calfire-new-fire',
    fieldChangeLabel: 'CAL FIRE', incidents: calFire, hasPersonnel: false,
  });

  console.log('[incident-updates-sync] done');
}

main().catch((err) => {
  console.error('[incident-updates-sync] fatal:', err);
  process.exit(1);
});
