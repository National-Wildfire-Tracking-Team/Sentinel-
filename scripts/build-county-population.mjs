/**
 * build-county-population.mjs
 * Writes src/app/data/countyPopulation.json: total population per U.S.
 * county (and county equivalent, incl. Puerto Rico), keyed by 5-digit FIPS,
 * from the Census Bureau's ACS 5-year estimates (table B01003). The hurricane
 * panel joins it with NWS tropical alerts to count people in affected
 * counties.
 *
 * The API key is only used here, at build time; it never ships to browsers.
 *
 *   CENSUS_API_KEY=... npm run data:county-population
 *   (or put CENSUS_API_KEY in .env)
 *
 * Re-run once a year when a new ACS vintage comes out (usually December).
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const VINTAGE = process.env.ACS_VINTAGE || '2023';
const OUT = fileURLToPath(new URL('../src/app/data/countyPopulation.json', import.meta.url));

const key = process.env.CENSUS_API_KEY;
if (!key) {
  console.error('CENSUS_API_KEY is not set (add it to .env or the environment).');
  process.exit(1);
}

async function fetchRows(geo) {
  const params = new URLSearchParams({ get: 'NAME,B01003_001E', for: 'county:*', key });
  if (geo) params.set('in', geo);
  const res = await fetch(`https://api.census.gov/data/${VINTAGE}/acs/acs5?${params}`, { redirect: 'manual' });
  // An invalid or missing key redirects to an HTML "missing_key" page.
  if (res.status !== 200) throw new Error(`Census API ${res.status} — check CENSUS_API_KEY and ACS_VINTAGE`);
  const [header, ...rows] = await res.json();
  const col = (name) => header.indexOf(name);
  return rows.map((r) => ({
    fips: `${r[col('state')]}${r[col('county')]}`,
    name: r[col('NAME')],
    population: Number(r[col('B01003_001E')]),
  }));
}

const rows = await fetchRows();
const counties = {};
for (const r of rows.sort((a, b) => a.fips.localeCompare(b.fips))) {
  if (Number.isFinite(r.population) && r.population >= 0) counties[r.fips] = [r.name, r.population];
}

const data = {
  source: `U.S. Census Bureau, ACS 5-year estimates ${VINTAGE}, table B01003 (total population)`,
  vintage: VINTAGE,
  counties,
};
await writeFile(OUT, `${JSON.stringify(data)}\n`);
console.log(`Wrote ${Object.keys(counties).length} counties (ACS ${VINTAGE}) to ${OUT}`);
