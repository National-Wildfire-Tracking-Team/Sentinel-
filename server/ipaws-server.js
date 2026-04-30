/**
 * IPAWS OPEN EAS recent-alerts poller: fetches CAP XML, parses to JSON,
 * keeps the latest batch in memory, and serves GET /api/alerts.
 */

import http from 'node:http';
import { XMLParser } from 'fast-xml-parser';

const PORT = Number(process.env.IPAWS_SERVER_PORT || 3847);
const POLL_MS = Number(process.env.IPAWS_POLL_MS || 120_000);
const IPAWS_RECENT_URL =
  process.env.IPAWS_RECENT_URL ||
  'https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent/2020-08-21T11:40:43Z';

/** @type {{ updatedAt: string | null, sourceUrl: string, alerts: object[], lastError: string | null }} */
let store = {
  updatedAt: null,
  sourceUrl: IPAWS_RECENT_URL,
  alerts: [],
  lastError: null,
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
});

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * CAP polygon: space-separated "lat,lon" pairs (closed ring implied).
 * @returns {number[][] | null} GeoJSON ring [lon, lat][]
 */
function parseCapPolygon(polygonText) {
  if (!polygonText || typeof polygonText !== 'string') return null;
  const pairs = polygonText.trim().split(/\s+/).filter(Boolean);
  const ring = [];
  for (const pair of pairs) {
    const [latS, lonS] = pair.split(',').map((s) => s.trim());
    const lat = Number(latS);
    const lon = Number(lonS);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return ring;
}

/** CAP circle: "lat,lon radiusKm" — approximate as a GeoJSON polygon ring */
function parseCapCircle(circleText, segments = 32) {
  if (!circleText || typeof circleText !== 'string') return null;
  const parts = circleText.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [latS, lonS] = parts[0].split(',').map((s) => s.trim());
  const radiusKm = Number(parts[1]);
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm) || radiusKm <= 0)
    return null;
  const R = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const dRad = radiusKm / R;
  const ring = [];
  for (let i = 0; i <= segments; i++) {
    const brng = (2 * Math.PI * i) / segments;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(dRad) + Math.cos(latRad) * Math.sin(dRad) * Math.cos(brng)
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(dRad) * Math.cos(latRad),
        Math.cos(dRad) - Math.sin(latRad) * Math.sin(lat2)
      );
    ring.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return ring;
}

function pickText(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== '') return typeof v === 'string' ? v : String(v);
  }
  return null;
}

function parseInfoBlock(info) {
  const areas = asArray(info?.area).map((area) => {
    const polygonText = pickText(area, ['polygon']);
    const circleText = pickText(area, ['circle']);
    let coordinates = null;
    let geometryType = null;
    const ringPoly = parseCapPolygon(polygonText);
    if (ringPoly) {
      geometryType = 'Polygon';
      coordinates = [ringPoly];
    } else {
      const ringCircle = parseCapCircle(circleText);
      if (ringCircle) {
        geometryType = 'Polygon';
        coordinates = [ringCircle];
      }
    }
    return {
      areaDesc: pickText(area, ['areaDesc']) || null,
      polygon: polygonText || null,
      circle: circleText || null,
      geometry:
        geometryType && coordinates
          ? { type: geometryType, coordinates }
          : null,
    };
  });

  const sent = pickText(info, ['effective', 'onset']) || null;
  const headline = pickText(info, ['headline', 'event']) || null;
  const description = pickText(info, ['description']) || null;
  const instruction = pickText(info, ['instruction']) || null;
  const senderName = pickText(info, ['senderName']) || null;

  return {
    headline,
    description,
    instruction,
    senderName,
    sent,
    event: pickText(info, ['event']) || null,
    urgency: pickText(info, ['urgency']) || null,
    severity: pickText(info, ['severity']) || null,
    certainty: pickText(info, ['certainty']) || null,
    expires: pickText(info, ['expires']) || null,
    areas,
  };
}

function capXmlToAlerts(xmlString) {
  const root = xmlParser.parse(xmlString);
  const feed = root?.alerts ?? root;
  const alertNodes = asArray(feed?.alert);
  return alertNodes.map((raw) => {
    const identifier = pickText(raw, ['identifier']) || null;
    const sent = pickText(raw, ['sent']) || null;
    const infos = asArray(raw?.info).map(parseInfoBlock);
    return {
      identifier,
      sender: pickText(raw, ['sender']) || null,
      sent,
      status: pickText(raw, ['status']) || null,
      msgType: pickText(raw, ['msgType']) || null,
      scope: pickText(raw, ['scope']) || null,
      infos,
    };
  });
}

async function refreshAlerts() {
  try {
    const res = await fetch(IPAWS_RECENT_URL, {
      headers: { Accept: 'application/xml, text/xml, */*' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const xml = await res.text();
    const alerts = capXmlToAlerts(xml);
    store = {
      ...store,
      updatedAt: new Date().toISOString(),
      alerts,
      lastError: null,
    };
  } catch (err) {
    store = {
      ...store,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/api/alerts' || url.pathname === '/alerts') {
    json(res, 200, {
      updatedAt: store.updatedAt,
      sourceUrl: store.sourceUrl,
      count: store.alerts.length,
      lastError: store.lastError,
      alerts: store.alerts,
    });
    return;
  }
  if (url.pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }
  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`IPAWS server listening on http://127.0.0.1:${PORT}`);
  console.log(`  GET /api/alerts or /alerts — polling every ${POLL_MS / 1000}s`);
});

void refreshAlerts();
setInterval(refreshAlerts, POLL_MS);
