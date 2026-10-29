/**
 * build-industrial-sites.mjs
 * Writes netlify/functions/kanari-fires/industrialSites.mjs: known industrial
 * heat sources outside the US — gas flares, oil/gas platforms, refineries,
 * steel mills, petrochemical plants and fuel-burning power plants.
 * Satellites detect these as permanent "fires"; the kanari-fires function
 * drops clusters on top of one.
 *
 * Sources:
 *   - NASA FIRMS VIIRS (S-NPP) yearly country archives: every detection NASA
 *     classed as type 2 ("other static land source") or 3 ("offshore"),
 *     kept where it recurred on at least FIRMS_MIN_DAYS days so a one-off
 *     misclassification doesn't mask a real fire. This is NASA's own
 *     worldwide list of industrial heat and covers flares no map has.
 *   - OpenStreetMap via Overpass (© OpenStreetMap contributors, ODbL):
 *     man_made=flare, man_made=offshore_platform,
 *     industrial=refinery|oil_refinery|steel_mill|steelmaker|petrochemical.
 *     industrial=oil is left out on purpose: it's mostly well pads (135k+),
 *     and masking them would hide real wildfires in oil country (Alberta,
 *     western Siberia). Their flares are tagged man_made=flare anyway.
 *   - WRI Global Power Plant Database v1.3 (CC BY 4.0): plants whose primary
 *     fuel is burned (coal, gas, oil, petcoke, biomass, waste, cogeneration,
 *     other). Solar, wind, hydro, nuclear and geothermal don't show as fires.
 *
 * Sites within ~300 m of each other are merged, and the result is written as
 * packed int32 lat/lon pairs (base64), which loads far faster than JSON.
 *
 *   npm run data:industrial-sites
 *   npm run data:industrial-sites -- --cache /some/dir   (reuse downloads)
 *   FIRMS_YEAR=2025 npm run data:industrial-sites        (default: last year)
 *
 * Needs the `unzip` command (the FIRMS archive is a ~330 MB zip). Overpass is
 * a shared public service and these are heavy worldwide queries, so the
 * script retries with backoff. Re-run a few times a year.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInUnitedStates } from '../netlify/functions/kanari-fires/usBorder.mjs';

const OUT = fileURLToPath(new URL('../netlify/functions/kanari-fires/industrialSites.mjs', import.meta.url));
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'SentinelWildfireTracker/1.0 (+https://app.nationalwildfiretrackingteam.org)';
const WRI_CSV = 'https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv';
const FIRMS_YEAR = process.env.FIRMS_YEAR || String(new Date().getUTCFullYear() - 1);
const FIRMS_ZIP = `https://firms.modaps.eosdis.nasa.gov/data/country/zips/viirs-snpp_${FIRMS_YEAR}_all_countries.zip`;
const FIRMS_CELL_DEG = 0.004; // ~400 m, about one VIIRS pixel
const FIRMS_MIN_DAYS = 3;
const MERGE_DEG = 0.003; // sites closer than ~300 m become one

const OSM_QUERIES = {
  flare: 'nwr["man_made"="flare"];',
  offshore_platform: 'nwr["man_made"="offshore_platform"];',
  heavy_industry: 'nwr["industrial"~"^(refinery|oil_refinery|steel_mill|steelmaker|petrochemical)$"];',
};
const BURNED_FUELS = new Set(['Coal', 'Gas', 'Oil', 'Petcoke', 'Biomass', 'Waste', 'Cogeneration', 'Other']);

const cacheArg = process.argv.indexOf('--cache');
const CACHE = cacheArg !== -1 ? process.argv[cacheArg + 1] : null;
const WORK = CACHE || join(tmpdir(), 'sentinel-industrial-sites');

async function cached(name, fetcher) {
  const path = join(WORK, name);
  if (existsSync(path)) return readFile(path, 'utf8');
  const text = await fetcher();
  await mkdir(WORK, { recursive: true });
  await writeFile(path, text);
  return text;
}

async function overpass(query) {
  const body = new URLSearchParams({ data: `[out:json][timeout:200];${query}out center;` });
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(OVERPASS, { method: 'POST', body, headers: { 'User-Agent': USER_AGENT } });
    const text = await res.text();
    if (res.ok && text.startsWith('{')) return text;
    const wait = 15 * attempt;
    console.warn(`Overpass ${res.status} (attempt ${attempt}), retrying in ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Error('Overpass kept failing — try again later');
}

/** Minimal RFC 4180 CSV parser (quoted fields may hold commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** Directory of extracted FIRMS country CSVs, downloading and unzipping once. */
async function firmsCsvDir() {
  const dir = join(WORK, `firms-${FIRMS_YEAR}`);
  const csvDir = join(dir, 'viirs-snpp', FIRMS_YEAR);
  if (existsSync(csvDir)) return csvDir;
  await mkdir(dir, { recursive: true });
  const zip = join(dir, 'all_countries.zip');
  if (!existsSync(zip)) {
    console.log(`Downloading ${FIRMS_ZIP} …`);
    const res = await fetch(FIRMS_ZIP);
    if (!res.ok) throw new Error(`FIRMS archive ${res.status} — try FIRMS_YEAR=<an earlier year>`);
    await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  }
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  return csvDir;
}

/** FIRMS type 2/3 detections, grouped per ~400 m cell, that recurred on FIRMS_MIN_DAYS+ days. */
async function firmsStaticSources() {
  const dir = await firmsCsvDir();
  const cells = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.csv') || file.includes('United_States')) continue;
    let col = null;
    for await (const line of createInterface({ input: createReadStream(join(dir, file)) })) {
      const c = line.split(',');
      if (!col) { col = Object.fromEntries(c.map((h, i) => [h, i])); continue; }
      const type = c[col.type];
      if (type !== '2' && type !== '3') continue;
      const lat = Number(c[col.latitude]);
      const lon = Number(c[col.longitude]);
      const key = `${Math.round(lat / FIRMS_CELL_DEG)}:${Math.round(lon / FIRMS_CELL_DEG)}`;
      const cell = cells.get(key) || { lat: 0, lon: 0, n: 0, days: new Set(), type };
      cell.lat += lat; cell.lon += lon; cell.n += 1; cell.days.add(c[col.acq_date]);
      cells.set(key, cell);
    }
  }
  return [...cells.values()]
    .filter((cell) => cell.days.size >= FIRMS_MIN_DAYS)
    .map((cell) => ({ lat: cell.lat / cell.n, lon: cell.lon / cell.n, type: cell.type === '3' ? 'offshore' : 'firms_static' }));
}

const counts = {};
const merged = new Map();
const add = (lat, lon, type) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || isInUnitedStates([lon, lat])) return;
  counts[type] = (counts[type] || 0) + 1;
  const key = `${Math.round(lat / MERGE_DEG)}:${Math.round(lon / MERGE_DEG)}`;
  if (!merged.has(key)) merged.set(key, [Math.round(lat * 1e4), Math.round(lon * 1e4)]);
};

for (const site of await firmsStaticSources()) add(site.lat, site.lon, `NASA FIRMS ${site.type}`);

for (const [type, query] of Object.entries(OSM_QUERIES)) {
  const { elements } = JSON.parse(await cached(`osm-${type}.json`, () => overpass(query)));
  for (const e of elements) add(e.lat ?? e.center?.lat, e.lon ?? e.center?.lon, `OSM ${type}`);
}

const plants = parseCsv(await cached('global_power_plant_database.csv', async () => {
  const res = await fetch(WRI_CSV);
  if (!res.ok) throw new Error(`WRI database ${res.status}`);
  return res.text();
}));
plants
  .filter((p) => BURNED_FUELS.has(p.primary_fuel))
  .forEach((p) => add(Number(p.latitude), Number(p.longitude), 'WRI power_plant'));

const packed = new Int32Array([...merged.values()].flat());
const base64 = Buffer.from(packed.buffer).toString('base64');
const summary = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
await writeFile(OUT, `// Generated by scripts/build-industrial-sites.mjs on ${new Date().toISOString().slice(0, 10)} — do not edit by hand.
// Known industrial heat sources outside the US: ${merged.size} sites after merging those within ~300 m.
// Inputs: ${summary}.
// Sources: NASA FIRMS VIIRS ${FIRMS_YEAR} (types 2 and 3); © OpenStreetMap contributors (ODbL 1.0,
// https://www.openstreetmap.org/copyright); WRI Global Power Plant Database v1.3 (CC BY 4.0).
// This file is a derived database of OpenStreetMap data and is available under the ODbL.
// Format: base64 of little-endian int32 pairs [lat × 1e4, lon × 1e4] (decoded in kanari-fires.mjs).
export const SITES_BASE64 = '${base64}';
`);
console.log(`Inputs: ${summary}`);
console.log(`Wrote ${merged.size} merged sites (${(base64.length / 1024).toFixed(0)} KB) to ${OUT}`);
