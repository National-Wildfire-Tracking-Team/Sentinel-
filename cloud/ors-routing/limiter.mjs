/**
 * limiter.mjs
 * Per-IP brake on failed auth (401/403). WAF's rate rule at the edge is the
 * main flood defence; this stops a warm instance from hammering Supabase
 * Auth for one abusive client. Keyed on CloudFront-Viewer-Address, which
 * CloudFront sets itself (X-Forwarded-For's first hop is client-supplied).
 */

export class FailureLimiter {
  constructor({ max = 20, windowMs = 600_000, maxKeys = 10_000, now = Date.now } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
    this.hits = new Map(); // ip -> timestamps[]
  }

  #recent(ip) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(ip) || []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(ip, list);
    else this.hits.delete(ip);
    return list;
  }

  blocked(ip) {
    return this.#recent(ip).length >= this.max;
  }

  record(ip) {
    const list = this.#recent(ip);
    list.push(this.now());
    this.hits.delete(ip);
    this.hits.set(ip, list);
    while (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value);
  }
}

/** "203.0.113.9:51234" or "2001:db8::1:443" → address without the port. */
export function clientIp(headers, fallback) {
  const v = String(headers?.['cloudfront-viewer-address'] || '');
  const i = v.lastIndexOf(':');
  return i > 0 ? v.slice(0, i) : fallback;
}
