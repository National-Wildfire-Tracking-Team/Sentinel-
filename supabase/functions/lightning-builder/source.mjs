/**
 * source.mjs
 * Reads GOES GLM Level 2 flashes from NOAA's public AWS Open Data buckets
 * (s3://noaa-goes19 for GOES-East, s3://noaa-goes18 for GOES-West, us-east-1)
 * with plain unsigned HTTPS: no credentials, no SDK.
 *
 * Keys look like
 *   GLM-L2-LCFA/<YYYY>/<DDD>/<HH>/OR_GLM-L2-LCFA_G19_s<YYYYDDDHHMMSSs>_e<…>_c<…>.nc
 * (DDD = day of year, one file per 20 s), so a lexical listing of an hour is a
 * chronological one, and `start-after` lists only files newer than one we've read.
 */

export const REGION = 'us-east-1';
export const PRODUCT = 'GLM-L2-LCFA';
export const USER_AGENT = 'SentinelLightning/1.0 (+https://app.nationalwildfiretrackingteam.org)';
export const TIMEOUT_MS = 20_000;
export const MAX_OBJECT_BYTES = 16 * 1024 * 1024; // a busy 20-second file is a few MB at most

// The satellites read, and where each looks from (nominal sub-satellite longitude).
export const SATELLITES = {
  goes19: { label: 'GOES-East (GOES-19)', bucket: 'noaa-goes19', subLon: -75.2 },
  goes18: { label: 'GOES-West (GOES-18)', bucket: 'noaa-goes18', subLon: -137.2 },
};

const KEY_START = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d_/;
const HOUR_MS = 3_600_000;

export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

/** Start of the 20 seconds a file covers, in epoch ms (null if the key doesn't parse). */
export function keyTime(key) {
  const m = KEY_START.exec(key);
  if (!m) return null;
  const [year, doy, hh, mm, ss] = m.slice(1).map(Number);
  return Date.UTC(year, 0, 1, hh, mm, ss) + (doy - 1) * 86_400_000;
}

export function hourPrefix(ms) {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const doy = Math.floor((ms - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  return `${PRODUCT}/${year}/${String(doy).padStart(3, '0')}/${String(d.getUTCHours()).padStart(2, '0')}/`;
}

const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlText = (xml, tag) => {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m ? unescapeXml(m[1]) : null;
};

export class GlmSource {
  constructor({ fetchImpl = fetch, baseUrlFor } = {}) {
    this.fetch = fetchImpl;
    this.base = baseUrlFor || ((sat) => `https://${SATELLITES[sat].bucket}.s3.${REGION}.amazonaws.com`);
  }

  async #get(url) {
    let res;
    let body;
    try {
      res = await this.fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`HTTP ${res.status}`);
      }
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_OBJECT_BYTES) {
        await res.body?.cancel();
        throw new SourceError('object larger than expected');
      }
      body = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (err instanceof SourceError) throw err;
      throw new SourceError(`${err?.name ?? 'Error'}: ${err?.message ?? err}`);
    }
    if (body.byteLength > MAX_OBJECT_BYTES) throw new SourceError('object larger than expected');
    return body;
  }

  async #list(sat, prefix, startAfter) {
    const keys = [];
    let token = null;
    for (;;) {
      const params = new URLSearchParams({ 'list-type': '2', prefix });
      if (startAfter && startAfter.startsWith(prefix)) params.set('start-after', startAfter);
      if (token) params.set('continuation-token', token);
      const xml = new TextDecoder().decode(await this.#get(`${this.base(sat)}/?${params}`));
      for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unescapeXml(m[1]));
      token = xmlText(xml, 'NextContinuationToken');
      if (xmlText(xml, 'IsTruncated') !== 'true' || !token) return keys;
    }
  }

  /**
   * [start ms, key] of every file with since <= start <= until (and after `afterKey`), oldest first.
   * The bucket is partitioned by UTC hour, so the window's hours are listed one by one.
   */
  async listSince(sat, sinceMs, untilMs, afterKey = null) {
    const out = [];
    for (let hour = Math.floor(sinceMs / HOUR_MS) * HOUR_MS; hour <= untilMs; hour += HOUR_MS) {
      for (const key of await this.#list(sat, hourPrefix(hour), afterKey)) {
        const t = keyTime(key);
        if (t !== null && sinceMs <= t && t <= untilMs && (!afterKey || key > afterKey)) out.push([t, key]);
      }
    }
    return out.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  }

  fetchFile(sat, key) {
    return this.#get(`${this.base(sat)}/${key.split('/').map(encodeURIComponent).join('/')}`);
  }
}
