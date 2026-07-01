/**
 * Netlify Edge Function — FEMA IPAWS Alert Proxy
 *
 * Fetches CAP XML from the FEMA IPAWS OPEN EAS recent-alerts endpoint,
 * parses geometry + metadata into JSON, and returns the same { alerts: [...] }
 * format as the DEV poller server (server/ipaws-server.js).
 *
 * The FEMA endpoint does not send CORS headers, so this edge function
 * acts as a same-origin proxy with explicit CORS support.
 */

import { XMLParser } from "fast-xml-parser";

const IPAWS_RECENT_URL =
  "https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent/" +
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
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
  if (!polygonText || typeof polygonText !== "string") return null;
  const pairs = polygonText.trim().split(/\s+/).filter(Boolean);
  const ring = [];
  for (const pair of pairs) {
    const [latS, lonS] = pair.split(",").map((s) => s.trim());
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
  if (!circleText || typeof circleText !== "string") return null;
  const parts = circleText.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [latS, lonS] = parts[0].split(",").map((s) => s.trim());
  const radiusKm = Number(parts[1]);
  const lat = Number(latS);
  const lon = Number(lonS);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(radiusKm) ||
    radiusKm <= 0
  )
    return null;
  const R = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const dRad = radiusKm / R;
  const ring = [];
  for (let i = 0; i <= segments; i++) {
    const brng = (2 * Math.PI * i) / segments;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(dRad) +
        Math.cos(latRad) * Math.sin(dRad) * Math.cos(brng)
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
    if (v != null && v !== "") return typeof v === "string" ? v : String(v);
  }
  return null;
}

function parseInfoBlock(info) {
  const areas = asArray(info?.area).map((area) => {
    const polygonText = pickText(area, ["polygon"]);
    const circleText = pickText(area, ["circle"]);
    let coordinates = null;
    let geometryType = null;
    const ringPoly = parseCapPolygon(polygonText);
    if (ringPoly) {
      geometryType = "Polygon";
      coordinates = [ringPoly];
    } else {
      const ringCircle = parseCapCircle(circleText);
      if (ringCircle) {
        geometryType = "Polygon";
        coordinates = [ringCircle];
      }
    }
    return {
      areaDesc: pickText(area, ["areaDesc"]) || null,
      polygon: polygonText || null,
      circle: circleText || null,
      geometry:
        geometryType && coordinates
          ? { type: geometryType, coordinates }
          : null,
    };
  });

  return {
    headline: pickText(info, ["headline", "event"]) || null,
    description: pickText(info, ["description"]) || null,
    instruction: pickText(info, ["instruction"]) || null,
    senderName: pickText(info, ["senderName"]) || null,
    sent: pickText(info, ["effective", "onset"]) || null,
    event: pickText(info, ["event"]) || null,
    urgency: pickText(info, ["urgency"]) || null,
    severity: pickText(info, ["severity"]) || null,
    certainty: pickText(info, ["certainty"]) || null,
    expires: pickText(info, ["expires"]) || null,
    areas,
  };
}

function capXmlToAlerts(xmlString) {
  const root = xmlParser.parse(xmlString);
  const feed = root?.alerts ?? root;
  const alertNodes = asArray(feed?.alert);
  return alertNodes.map((raw) => {
    const identifier = pickText(raw, ["identifier"]) || null;
    const sent = pickText(raw, ["sent"]) || null;
    const infos = asArray(raw?.info).map(parseInfoBlock);
    return {
      identifier,
      sender: pickText(raw, ["sender"]) || null,
      sent,
      status: pickText(raw, ["status"]) || null,
      msgType: pickText(raw, ["msgType"]) || null,
      scope: pickText(raw, ["scope"]) || null,
      infos,
    };
  });
}

export default async (request) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const resp = await fetch(IPAWS_RECENT_URL, {
      headers: { Accept: "application/xml, text/xml, */*" },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const xml = await resp.text();
    const alerts = capXmlToAlerts(xml);

    return new Response(
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        sourceUrl: IPAWS_RECENT_URL,
        count: alerts.length,
        lastError: null,
        alerts,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        updatedAt: null,
        sourceUrl: IPAWS_RECENT_URL,
        count: 0,
        lastError: err instanceof Error ? err.message : String(err),
        alerts: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      }
    );
  }
};
