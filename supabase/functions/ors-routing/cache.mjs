/**
 * cache.mjs
 * Worker-local TTL cache. Edge Function workers don't share it; it only saves
 * quota on repeat requests that land on a warm worker.
 */

export class TtlCache {
  constructor({ ttlMs, maxEntries = 500, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, at: this.now() });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
  }
}
