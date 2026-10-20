/**
 * store.mjs
 * Where the flashes file is written: the public Supabase Storage bucket
 * "lightning" in production, memory in tests. Both take the same object keys.
 *
 * latest.json.gz is the only object. It's stored gzipped (Content-Type
 * application/gzip; the browser gunzips it, see src/app/api/lightning.js) with
 * a lifetime under the builder's 1-minute cadence. It's also the builder's
 * state: each run reads it back to know which files it has already read.
 */

export const BUCKET = 'lightning';
const TIMEOUT_MS = 15_000;

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export const gzip = (bytes) => pipe(bytes, new CompressionStream('gzip'));
export const gunzip = (bytes) => pipe(bytes, new DecompressionStream('gzip'));

/** JSON from bytes that may or may not be gzipped. */
export async function parseJson(bytes) {
  const plain = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
  return JSON.parse(new TextDecoder().decode(plain));
}

export class MemoryStore {
  constructor() {
    this.objects = new Map();
  }

  async put(key, body, meta = {}) {
    this.objects.set(key, { body, ...meta });
  }

  async getJson(key) {
    const hit = this.objects.get(key);
    return hit ? parseJson(hit.body) : null;
  }
}

/** Supabase Storage over its REST API, with the service-role key (never sent to browsers). */
export class StorageStore {
  constructor({ url, serviceKey, bucket = BUCKET, fetchImpl = fetch }) {
    this.base = `${String(url).replace(/\/+$/, '')}/storage/v1/object/${bucket}`;
    this.headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    this.fetch = fetchImpl;
  }

  async put(key, body, { contentType, cacheControl }) {
    const res = await this.fetch(`${this.base}/${key}`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': contentType, 'Cache-Control': cacheControl, 'x-upsert': 'true' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Storage write failed: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    await res.body?.cancel();
  }

  /** Reads from origin (authenticated), not the CDN, so state is never a cached copy. */
  async getJson(key) {
    const res = await this.fetch(`${this.base}/${key}`, { headers: this.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404) {
      await res.body?.cancel();
      return null; // first run: nothing written yet
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Older Storage versions answer a missing object with 400 + {"statusCode":"404","error":"not_found"}.
      if (res.status === 400 && /not.?found/i.test(text)) return null;
      throw new Error(`Storage read failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    try {
      return await parseJson(new Uint8Array(await res.arrayBuffer()));
    } catch {
      return null; // unreadable state: start the window over rather than stall
    }
  }
}
