import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PROXY = 'https://fema-nfhl-proxy.example.run.app';
const BOUNDS = { west: -121.52, south: 38.56, east: -121.48, north: 38.60 };

function okResponse(body) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

const SAMPLE = {
  level: 'detail',
  zones: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 1, geometry: null, properties: { id: 1, zone: 'AE', category: 'pct_1' } }] },
  panels: { type: 'FeatureCollection', features: [] },
  attribution: 'Flood hazard data: FEMA National Flood Hazard Layer (NFHL)',
  truncated: false,
};

async function loadModule(proxyUrl = PROXY) {
  vi.resetModules();
  vi.stubEnv('VITE_FEMA_NFHL_PROXY_URL', proxyUrl);
  return import('../../src/app/api/femaFloodHazards');
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(okResponse(SAMPLE));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('femaFloodHazards API client', () => {
  it('calls only the Sentinel proxy — never FEMA directly', async () => {
    const api = await loadModule();
    await api.fetchFloodHazardsInBounds(BOUNDS, 13);
    const [url] = global.fetch.mock.calls[0];
    expect(url.startsWith(`${PROXY}/flood-hazards?`)).toBe(true);
    expect(url).not.toMatch(/fema\.gov|arcgis/i);
    expect(url).toMatch(/zoom=13/);
  });

  it('reports not-configured instead of falling back to FEMA when the proxy URL is unset', async () => {
    const api = await loadModule('');
    expect(api.isFloodHazardServiceConfigured()).toBe(false);
    await expect(api.fetchFloodHazardsInBounds(BOUNDS, 13)).rejects.toThrow(/not configured/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns empty data without a request below the minimum zoom', async () => {
    const api = await loadModule();
    const data = await api.fetchFloodHazardsInBounds(BOUNDS, 5);
    expect(data.zones.features).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('snaps nearby viewports to the same tile-aligned request (cache hit, no second fetch)', async () => {
    const api = await loadModule();
    const a = api.snapFloodRequest(BOUNDS, 13.1);
    const b = api.snapFloodRequest({ west: -121.519, south: 38.561, east: -121.481, north: 38.599 }, 13.6);
    expect(a.key).toBe(b.key);

    await api.fetchFloodHazardsInBounds(BOUNDS, 13.1);
    await api.fetchFloodHazardsInBounds({ west: -121.519, south: 38.561, east: -121.481, north: 38.599 }, 13.6);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(api.peekFloodHazards(BOUNDS, 13.1).fresh).toBe(true);
  });

  it('uses a different cache key per detail level', async () => {
    const api = await loadModule();
    expect(api.snapFloodRequest(BOUNDS, 9)).toBeNull();
    expect(api.snapFloodRequest(BOUNDS, 12.5).key).toMatch(/^detail:/);
    expect(api.snapFloodRequest(BOUNDS, 15).key).toMatch(/^fine:/);
  });

  it('caps a huge-screen request at MAX_TILES_PER_AXIS per axis, centered', async () => {
    const api = await loadModule();
    const snapped = api.snapFloodRequest({ west: -122.5, south: 38.0, east: -120.5, north: 39.0 }, 12);
    const [, , xs, ys] = snapped.key.split(':');
    const span = (r) => { const [lo, hi] = r.split('-').map(Number); return hi - lo + 1; };
    expect(span(xs)).toBe(api.MAX_TILES_PER_AXIS);
    expect(span(ys)).toBe(api.MAX_TILES_PER_AXIS);
  });

  it('force bypasses a fresh cache entry (manual refresh / retry)', async () => {
    const api = await loadModule();
    await api.fetchFloodHazardsInBounds(BOUNDS, 13);
    await api.fetchFloodHazardsInBounds(BOUNDS, 13, { force: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent identical requests', async () => {
    const api = await loadModule();
    await Promise.all([api.fetchFloodHazardsInBounds(BOUNDS, 13), api.fetchFloodHazardsInBounds(BOUNDS, 13)]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('shows the proxy validation message on 4xx', async () => {
    const api = await loadModule();
    global.fetch.mockResolvedValueOnce({ ok: false, status: 413, json: () => Promise.resolve({ error: 'Requested area is too large for this zoom level — zoom in further' }) });
    await expect(api.fetchFloodHazardsInBounds(BOUNDS, 13)).rejects.toThrow(/too large/);
  });

  it('shows a generic message on 5xx and network errors (no internal detail)', async () => {
    const api = await loadModule();
    global.fetch.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.resolve({ error: 'FEMA responded HTTP 503 at hazards.fema.gov' }) });
    await expect(api.fetchFloodHazardsInBounds(BOUNDS, 13)).rejects.toThrow('Flood hazard data is temporarily unavailable.');

    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.fetchFloodHazardsInBounds(BOUNDS, 13.01, { force: true })).rejects.toThrow('Flood hazard data is temporarily unavailable.');
  });

  it('does not cache a server stale-fallback response', async () => {
    const api = await loadModule();
    global.fetch.mockResolvedValueOnce(okResponse({ ...SAMPLE, stale: true }));
    const data = await api.fetchFloodHazardsInBounds(BOUNDS, 13);
    expect(data.stale).toBe(true);
    expect(api.peekFloodHazards(BOUNDS, 13)).toBeNull();
  });
});
