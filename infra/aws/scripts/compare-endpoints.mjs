#!/usr/bin/env node
/**
 * compare-endpoints.mjs
 * Parallel-run check: sends the same requests the frontend sends to two
 * deployments of each data service (normally Cloud Run vs. CloudFront/Lambda)
 * and reports every difference in the parts of the contract the frontend
 * depends on — status, content type, CORS, cache directives, JSON shape,
 * schema version, and feature counts per FeatureCollection.
 *
 * Both sides hit live upstreams (NIFC, NWS, FEMA, …) at slightly different
 * moments, so feature counts may drift a little between calls; counts are
 * compared with a tolerance (COUNT_TOLERANCE) and anything past it fails.
 *
 * Usage:
 *   node scripts/compare-endpoints.mjs \
 *     --left-label gcp  --left  nws-alerts=https://nws-alerts-xxxx.a.run.app --left fema-nfhl-proxy=https://… \
 *     --right-label aws --right-cloudfront https://dxxxx.cloudfront.net
 *
 * `--<side>-cloudfront URL` expands to URL/<service-dir> for every service.
 * `--only a,b` restricts to some services. Exit code 1 on any mismatch.
 */

const SERVICES = {
  'calfire-frap-proxy': [
    { name: 'perimeters ≥2016', path: '/perimeters?minYear=2016&minAcres=0' },
    { name: 'perimeters ≥2020, ≥1000 ac', path: '/perimeters?minYear=2020&minAcres=1000' },
  ],
  'california-land-ownership-proxy': [
    { name: 'SF bay viewport', path: '/land-ownership?bbox=-122.55,37.70,-122.35,37.85' },
    { name: 'oversized bbox → 400', path: '/land-ownership?bbox=-124,32,-114,42' },
  ],
  'fema-nfhl-proxy': [
    { name: 'Sacramento z12', path: '/flood-hazards?bbox=-121.55,38.52,-121.43,38.62&zoom=12' },
    { name: 'Houston z8 overview', path: '/flood-hazards?bbox=-95.8,29.5,-95.0,30.1&zoom=8' },
    { name: 'zoom too far out → 400', path: '/flood-hazards?bbox=-100,30,-90,40&zoom=5' },
  ],
  'fire-perimeters-merge': [
    { name: 'merged (app default)', path: '/merged?minAcres=0&includeInactive=false' },
    { name: 'merged ≥100 ac incl. inactive', path: '/merged?minAcres=100&includeInactive=true' },
  ],
  'nws-alerts': [
    { name: 'v1 alerts', path: '/v1/alerts' },
  ],
};
const COMMON = [
  { name: 'health', path: '/health', shapeOnly: true },
  { name: 'unknown path → 404', path: '/definitely-not-a-route' },
];

const COUNT_TOLERANCE = { relative: 0.02, absolute: 3 };
const ORIGIN = 'https://app.nationalwildfiretrackingteam.org';

function parseArgs(argv) {
  const sides = { left: { label: 'left', bases: {} }, right: { label: 'right', bases: {} } };
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    const m = flag.match(/^--(left|right)(-label|-cloudfront)?$/);
    if (m) {
      const side = sides[m[1]];
      if (m[2] === '-label') side.label = value;
      else if (m[2] === '-cloudfront') for (const svc of Object.keys(SERVICES)) side.bases[svc] = `${value.replace(/\/+$/, '')}/${svc}`;
      else {
        const eq = value.indexOf('=');
        side.bases[value.slice(0, eq)] = value.slice(eq + 1).replace(/\/+$/, '');
      }
      i++;
    } else if (flag === '--only') {
      only = new Set(value.split(','));
      i++;
    } else {
      throw new Error(`Unknown argument ${flag}`);
    }
  }
  return { sides, only };
}

async function probe(url) {
  const started = Date.now();
  const resp = await fetch(url, { headers: { Origin: ORIGIN, 'Accept-Encoding': 'gzip' } });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return {
    status: resp.status,
    ms: Date.now() - started,
    bytes: text.length,
    contentType: (resp.headers.get('content-type') || '').split(';')[0],
    cors: resp.headers.get('access-control-allow-origin'),
    cacheDirectives: (resp.headers.get('cache-control') || '')
      .split(',').map((d) => d.trim().split('=')[0]).filter(Boolean).sort().join(','),
    etag: Boolean(resp.headers.get('etag')),
    json,
  };
}

/** Structural fingerprint: key paths down to depth 2, plus FeatureCollection sizes. */
function describe(json, prefix = '', depth = 0, out = { keys: new Set(), counts: {}, schemaVersion: undefined }) {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    if (prefix === '' && 'schemaVersion' in json) out.schemaVersion = json.schemaVersion;
    if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
      out.counts[prefix || '(root)'] = json.features.length;
      const sample = json.features[0];
      if (sample?.properties) for (const k of Object.keys(sample.properties)) out.keys.add(`${prefix}.features[].properties.${k}`);
      if (sample?.geometry?.type) out.keys.add(`${prefix}.features[].geometry:${sample.geometry.type}`);
    }
    for (const [k, v] of Object.entries(json)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.keys.add(p);
      if (depth < 2 && k !== 'features') describe(v, p, depth + 1, out);
      if (Array.isArray(v)) out.counts[p] ??= v.length;
    }
  }
  return out;
}

function withinTolerance(a, b) {
  const diff = Math.abs(a - b);
  return diff <= COUNT_TOLERANCE.absolute || diff <= Math.max(a, b) * COUNT_TOLERANCE.relative;
}

function compare(check, a, b) {
  const problems = [];
  for (const field of ['status', 'contentType', 'cors']) {
    if (a[field] !== b[field]) problems.push(`${field}: ${a[field]} ≠ ${b[field]}`);
  }
  if (a.cacheDirectives !== b.cacheDirectives) problems.push(`cache-control directives: [${a.cacheDirectives}] ≠ [${b.cacheDirectives}]`);
  if (a.etag !== b.etag) problems.push(`ETag present: ${a.etag} ≠ ${b.etag}`);
  if (a.json && b.json && !check.shapeOnly) {
    const da = describe(a.json);
    const db = describe(b.json);
    if (da.schemaVersion !== db.schemaVersion) problems.push(`schemaVersion: ${da.schemaVersion} ≠ ${db.schemaVersion}`);
    const onlyA = [...da.keys].filter((k) => !db.keys.has(k));
    const onlyB = [...db.keys].filter((k) => !da.keys.has(k));
    // Keys that only appear in a non-empty collection's sample feature are
    // data-dependent, not contract — ignore them when one side is empty.
    const meaningful = (keys, other) => keys.filter((k) => {
      const coll = k.split('.features[]')[0];
      return !(k.includes('.features[]') && (other.counts[coll || '(root)'] ?? 0) === 0);
    });
    const ka = meaningful(onlyA, db);
    const kb = meaningful(onlyB, da);
    if (ka.length) problems.push(`keys only in left: ${ka.slice(0, 8).join(', ')}`);
    if (kb.length) problems.push(`keys only in right: ${kb.slice(0, 8).join(', ')}`);
    for (const key of new Set([...Object.keys(da.counts), ...Object.keys(db.counts)])) {
      const [ca, cb] = [da.counts[key] ?? 0, db.counts[key] ?? 0];
      if (!withinTolerance(ca, cb)) problems.push(`count ${key}: ${ca} ≠ ${cb}`);
    }
  } else if (a.json && b.json && check.shapeOnly) {
    if (a.json.ok !== b.json.ok) problems.push(`health ok: ${a.json.ok} ≠ ${b.json.ok}`);
  }
  return problems;
}

async function main() {
  const { sides, only } = parseArgs(process.argv.slice(2));
  const { left, right } = sides;
  let failures = 0;
  let compared = 0;

  for (const [svc, checks] of Object.entries(SERVICES)) {
    if (only && !only.has(svc)) continue;
    const [baseA, baseB] = [left.bases[svc], right.bases[svc]];
    if (!baseA || !baseB) {
      console.log(`- ${svc}: skipped (no ${!baseA ? left.label : right.label} URL)`);
      continue;
    }
    console.log(`\n## ${svc}\n   ${left.label}: ${baseA}\n   ${right.label}: ${baseB}`);
    for (const check of [...checks, ...COMMON]) {
      compared++;
      let a, b;
      try {
        [a, b] = await Promise.all([probe(baseA + check.path), probe(baseB + check.path)]);
      } catch (err) {
        failures++;
        console.log(`  ✖ ${check.name}: request failed — ${err.message}`);
        continue;
      }
      const problems = compare(check, a, b);
      const timing = `${left.label} ${a.status} ${a.ms}ms ${(a.bytes / 1024).toFixed(0)}KB | ${right.label} ${b.status} ${b.ms}ms ${(b.bytes / 1024).toFixed(0)}KB`;
      if (problems.length) {
        failures++;
        console.log(`  ✖ ${check.name} (${timing})`);
        for (const p of problems) console.log(`      ${p}`);
      } else {
        console.log(`  ✔ ${check.name} (${timing})`);
      }
    }
  }

  console.log(`\n${compared - failures}/${compared} checks match.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
