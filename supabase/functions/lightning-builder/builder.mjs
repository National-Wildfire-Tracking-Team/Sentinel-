/**
 * builder.mjs
 * Keeps a rolling file of the last 15 minutes of GOES lightning flashes over
 * North America for Sentinel's Weather and All Hazards tabs. Runs every minute
 * (pg_cron → this Edge Function).
 *
 *   s3://noaa-goes19, s3://noaa-goes18 (anonymous, us-east-1)
 *     ─▶ list the window's GLM-L2-LCFA files per satellite (source.mjs)
 *     ─▶ download each new file once ─▶ its good-quality flashes (glm.mjs)
 *     ─▶ keep those in the area and seen best from this satellite
 *     ─▶ Supabase Storage lightning/v1/latest.json.gz (public bucket, CDN)
 *
 * Each GLM file is read once, by one function, however many people are
 * watching; browsers only ever fetch latest.json.gz from the CDN.
 *
 * Window. The file holds every flash from the last `windowSeconds` (default
 * 900). The window is anchored to the clock, not to the newest file, so if GLM
 * stops publishing, flashes age out rather than old lightning passing for
 * current.
 *
 * Two satellites. GOES-East and GOES-West overlap over the western U.S. and both
 * report the same flashes there. Each flash is kept only from the satellite
 * whose sub-satellite longitude is nearest, so it's drawn once.
 *
 * State. The file also lists, per satellite, the files already read that are
 * still in the window, so the next run reads only new ones (a failed download is
 * simply retried next minute). At most `maxFilesPerSatellite` new files are
 * read per run, newest first, so a cold start shows current lightning at once.
 *
 * Failure isolation. Each satellite succeeds or fails on its own: one whose
 * listing fails keeps its flashes still inside the window and carries an `error`.
 *
 * Format (schemaVersion 1). Flashes are column arrays of integers, oldest first:
 *   lon, lat   hundredths of a degree (GLM itself is ~8 km)
 *   t          seconds after `base` (epoch seconds) of the flash's first light
 *   e          flash energy, femtojoules (1e-15 J)
 */

import { REGION, SATELLITES, SourceError, keyTime } from './source.mjs';
import { gzip } from './store.mjs';

export const SCHEMA_VERSION = 1;
export const LATEST_KEY = 'v1/latest.json.gz';
export const LATEST_CONTENT_TYPE = 'application/gzip';
// Under the builder's 1-minute cadence.
export const LATEST_CACHE = 'max-age=30';
export const FILE_SECONDS = 20;
export const COORD_SCALE = 100;
export const ENERGY_UNIT = 1e-15;

export const ATTRIBUTION = 'Lightning: NOAA GOES-East/West Geostationary Lightning Mapper (GLM), via the NOAA Open Data '
  + 'Dissemination program on AWS. Processed by Sentinel; not endorsed by NOAA.';
export const NOTICE = 'Satellite-detected flashes, in-cloud and cloud-to-ground, located to about 8 km. '
  + 'Not every flash is detected, and flashes can lag by a minute or two.';

const FIELDS = ['lon', 'lat', 't', 'energy'];

/** North America, Hawaii, the Caribbean and the western Aleutians (across the antimeridian). */
export function inArea(lat, lon) {
  return lat >= 10 && lat <= 80 && (lon <= -50 || lon >= 170);
}

const lonGap = (a, b) => Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);

/** Whether this satellite sees a flash at `lon` best: its sub-satellite longitude is the nearest one. */
export function nearestTo(sat, lon, satellites = SATELLITES) {
  const own = lonGap(lon, satellites[sat].subLon);
  return Object.entries(satellites).every(([other, cfg]) => other === sat || own <= lonGap(lon, cfg.subLon));
}

/** numpy's round(): halves go to the even neighbour, so the output matches the Python builder's. */
export function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export function iso(epochSeconds) {
  return `${new Date(Math.floor(epochSeconds) * 1000).toISOString().slice(0, 19)}Z`;
}

const emptyFlashes = () => Object.fromEntries(FIELDS.map((k) => [k, new Float64Array(0)]));

/** The file's flashes back to epoch seconds and degrees. */
export function decodeFlashes(doc) {
  if (!doc || doc.schemaVersion !== SCHEMA_VERSION) return emptyFlashes();
  const f = doc.flashes || {};
  const cols = [f.lon, f.lat, f.t, f.e];
  if (!Number.isFinite(doc.base) || !cols.every(Array.isArray) || !cols.every((c) => c.length === f.t.length)) return emptyFlashes();
  return {
    lon: Float64Array.from(f.lon, (v) => v / COORD_SCALE),
    lat: Float64Array.from(f.lat, (v) => v / COORD_SCALE),
    t: Float64Array.from(f.t, (v) => doc.base + v),
    energy: Float64Array.from(f.e, (v) => v * ENERGY_UNIT),
  };
}

const select = (cols, idx) => Object.fromEntries(FIELDS.map((k) => [k, Float64Array.from(idx, (i) => cols[k][i])]));
const startOf = (key) => (keyTime(key) ?? 0) / 1000;

export class LightningBuilder {
  /**
   * @param {{ listSince: Function, fetchFile: Function }} source
   * @param {{ getJson: Function, put: Function }} store
   * @param {(bytes: Uint8Array) => any} readFlashes
   * @param {{ clock?: () => number, satellites?: Record<string, { label: string, bucket: string, subLon: number }>,
   *   windowSeconds?: number, maxFilesPerSatellite?: number, workers?: number,
   *   log?: (severity: string, message: string, fields?: Record<string, unknown>) => void }} [options]
   */
  constructor(source, store, readFlashes, {
    clock = () => Date.now() / 1000, satellites = SATELLITES, windowSeconds = 900,
    maxFilesPerSatellite = 30, workers = 8, log = () => {},
  } = {}) {
    this.source = source;
    this.store = store;
    this.readFlashes = readFlashes;
    this.clock = clock;
    this.satellites = satellites;
    this.window = windowSeconds;
    this.maxFiles = maxFilesPerSatellite;
    this.workers = workers;
    this.log = log;
  }

  async run() {
    const now = this.clock();
    const since = now - this.window;
    const prev = await this.store.getJson(LATEST_KEY);
    const prevSources = prev?.sources || {};
    const prevRead = prev?.read || {};

    const kept = decodeFlashes(prev);
    const parts = [select(kept, [...kept.t.keys()].filter((i) => kept.t[i] >= since))];
    const sources = {};
    const read = {};
    let filesRead = 0;
    let sourceBytes = 0;
    let sourceErrors = 0;

    for (const [sat, cfg] of Object.entries(this.satellites)) {
      const already = new Set(prevRead[sat] || []);
      const info = { label: cfg.label, latest: prevSources[sat]?.latest ?? null };
      let listed;
      try {
        listed = await this.source.listSince(sat, (since - FILE_SECONDS) * 1000, now * 1000);
      } catch (err) {
        if (!(err instanceof SourceError)) throw err;
        sourceErrors += 1;
        info.error = String(err.message).slice(0, 200);
        sources[sat] = info;
        read[sat] = [...already].filter((k) => startOf(k) >= since - FILE_SECONDS).sort();
        this.log('WARNING', 'lightning_list_failed', { satellite: sat, error: info.error });
        continue;
      }

      const inWindow = new Set(listed.map(([, key]) => key));
      const fresh = listed.filter(([, key]) => !already.has(key)).slice(-this.maxFiles);
      const results = await this.#readAll(sat, fresh.map(([, key]) => key));
      const done = new Set([...already].filter((k) => inWindow.has(k)));
      for (const [key, outcome] of results) {
        if (outcome instanceof Error) {
          sourceErrors += 1;
          this.log('WARNING', 'lightning_file_failed', { satellite: sat, key, error: String(outcome.message).slice(0, 200) });
          continue;
        }
        const [bodyLength, flashes] = outcome;
        filesRead += 1;
        sourceBytes += bodyLength;
        done.add(key);
        const keep = [];
        for (let i = 0; i < flashes.t.length; i++) {
          if (inArea(flashes.lat[i], flashes.lon[i]) && nearestTo(sat, flashes.lon[i], this.satellites)
            && flashes.t[i] >= since && flashes.t[i] <= now) keep.push(i);
        }
        parts.push(select(flashes, keep));
      }

      if (done.size) info.latest = iso(Math.max(...[...done].map(startOf)) + FILE_SECONDS);
      info.files = done.size;
      sources[sat] = info;
      read[sat] = [...done].sort();
    }

    const merged = Object.fromEntries(FIELDS.map((k) => [k, parts.flatMap((p) => Array.from(p[k]))]));
    const order = merged.t.map((_, i) => i).sort((a, b) => merged.t[a] - merged.t[b] || a - b);
    const base = Math.trunc(since);

    const doc = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: iso(now),
      windowSeconds: this.window,
      base,
      attribution: ATTRIBUTION,
      notice: NOTICE,
      sources,
      count: order.length,
      flashes: {
        lon: order.map((i) => roundHalfEven(merged.lon[i] * COORD_SCALE)),
        lat: order.map((i) => roundHalfEven(merged.lat[i] * COORD_SCALE)),
        t: order.map((i) => roundHalfEven(merged.t[i] - base)),
        e: order.map((i) => roundHalfEven(merged.energy[i] / ENERGY_UNIT)),
      },
      read,
      source: { buckets: Object.values(this.satellites).map((cfg) => cfg.bucket), region: REGION },
    };
    const body = await gzip(new TextEncoder().encode(JSON.stringify(doc)));
    await this.store.put(LATEST_KEY, body, { contentType: LATEST_CONTENT_TYPE, cacheControl: LATEST_CACHE });

    const latest = Object.values(sources).map((s) => s.latest).filter(Boolean);
    const oldestLatest = latest.length === Object.keys(sources).length ? latest.sort()[0] : null;
    const latestAge = oldestLatest ? now - Date.parse(oldestLatest) / 1000 : this.window;
    return {
      filesRead,
      sourceBytes,
      sourceErrors,
      flashes: doc.count,
      bytesWritten: body.byteLength,
      latestAgeSeconds: Math.round(latestAge),
      satellites: Object.fromEntries(Object.entries(sources).map(([sat, { label: _label, ...rest }]) => [sat, rest])),
    };
  }

  /** Downloads + decodes up to `workers` files at a time; results keep the keys' order. */
  async #readAll(sat, keys) {
    const results = new Array(keys.length);
    let next = 0;
    const worker = async () => {
      while (next < keys.length) {
        const i = next++;
        results[i] = [keys[i], await this.#readOne(sat, keys[i])];
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.workers, keys.length) }, worker));
    return results;
  }

  /** [bytes, flashes], or the Error: one bad file never sinks the run. */
  async #readOne(sat, key) {
    try {
      const body = await this.source.fetchFile(sat, key);
      return [body.byteLength, this.readFlashes(body)];
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }
}
