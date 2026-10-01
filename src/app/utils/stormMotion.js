/**
 * stormMotion.js
 * Parses the "TIME...MOT...LOC" line NWS embeds in the text of active
 * Severe Thunderstorm/Tornado Warnings (and their Severe Weather Statement
 * updates) into a storm motion vector, and projects it forward to build the
 * Radar Settings "Storm Motion Vectors" overlay: a center point at the
 * storm's current (time-projected) position, a line to where it will be in
 * one hour, and perpendicular tick marks at the 30- and 60-minute marks.
 *
 * There is no public feed of per-storm-cell motion — NWS forecasters embed
 * this line by hand in the warning text itself
 * ("TIME...MOT...LOC 2247Z 268DEG 39KT 3617 9757"), so this only covers
 * storms currently under an active warning that includes it; it is not a
 * general radar-derived storm-cell tracker (cell detection/tracking from raw
 * reflectivity is a much larger, separate undertaking).
 */

const EARTH_RADIUS_KM = 6371;
const KM_PER_KT_HOUR = 1.852; // 1 knot = 1.852 km/h

// "TIME...MOT...LOC 2247Z 268DEG 39KT 3617 9757 3701 9822" — one or more
// trailing lat/lon pairs (multiple pairs describe a line of storms sharing
// one motion vector, e.g. a squall line); each is 3-5 digits, hundredths of
// a degree, latitude un-signed (always N in CONUS) and longitude un-signed
// but always meant as West.
const MOT_LOC_RE = /TIME\.\.\.MOT\.\.\.LOC\s+(\d{3,4})Z\s+(\d{1,3})DEG\s+(\d{1,3})KT\s+((?:\d{3,5}\s+\d{3,5}\s*)+)/;

/**
 * The UTC date the "TIME...MOT...LOC" hhmm applies to. The line only carries
 * a time, not a date, so it's assumed to be the same UTC day as the alert's
 * own `sent` timestamp — except right at a UTC-midnight rollover, where the
 * parsed hour can end up looking up to ~24h after `sent`; if so, the report
 * must actually have been the day before.
 */
function resolveReportTimeMs(hhmm, sentMs) {
  const hh = Number(hhmm.slice(0, hhmm.length - 2));
  const mm = Number(hhmm.slice(-2));
  const sentDate = new Date(sentMs);
  const candidate = Date.UTC(sentDate.getUTCFullYear(), sentDate.getUTCMonth(), sentDate.getUTCDate(), hh, mm);
  return candidate - sentMs > 6 * 60 * 60 * 1000 ? candidate - 24 * 60 * 60 * 1000 : candidate;
}

/**
 * Parse one alert's motion vector(s), or [] if it has none (most alerts —
 * only active severe convective warnings/statements carry this line).
 * @returns {{ lat: number, lng: number, headingDeg: number, speedKmh: number, reportTimeMs: number }[]}
 */
export function parseStormMotion(alert) {
  const match = alert?.description?.match(MOT_LOC_RE);
  if (!match || !alert.sent) return [];

  const [, hhmm, motDeg, speedKt, pointsRaw] = match;
  const reportTimeMs = resolveReportTimeMs(hhmm, new Date(alert.sent).getTime());
  // MOT is the meteorological direction the storm is moving FROM — heading
  // (direction of travel, for projecting forward) is the reverse of that.
  const headingDeg = (Number(motDeg) + 180) % 360;
  const speedKmh = Number(speedKt) * KM_PER_KT_HOUR;

  const numbers = pointsRaw.trim().split(/\s+/).map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ lat: numbers[i] / 100, lng: -(numbers[i + 1] / 100) });
  }
  return points.map((p) => ({ ...p, headingDeg, speedKmh, reportTimeMs }));
}

/** Great-circle destination point, given a start, bearing, and distance. */
export function destinationPoint(lat, lng, bearingDeg, distanceKm) {
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  );
  return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

// Tick marks are a fixed real-world half-length either side of the vector
// line (not a fixed pixel size) — matching how these look on real radar
// viewers, where the mark's geographic size stays constant across zoom.
const TICK_HALF_LENGTH_KM = 4;

/**
 * Build the Storm Motion Vectors overlay: one center point + one vector line
 * + two tick-mark lines (30 min, 60 min) per parsed motion vector, projected
 * forward from its NWS report time to `nowMs`.
 * @param {object[]} alerts - normalized alert objects (see noaaWeather.js)
 * @param {number} nowMs
 * @returns {GeoJSON.FeatureCollection}
 */
export function buildStormMotionVectorsGeoJSON(alerts, nowMs) {
  const features = [];

  for (const alert of alerts ?? []) {
    for (const motion of parseStormMotion(alert)) {
      const { lat, lng, headingDeg, speedKmh, reportTimeMs } = motion;
      const elapsedHoursToNow = Math.max(0, (nowMs - reportTimeMs) / (60 * 60 * 1000));
      const now = destinationPoint(lat, lng, headingDeg, speedKmh * elapsedHoursToNow);
      const at30 = destinationPoint(now.lat, now.lng, headingDeg, speedKmh * 0.5);
      const at60 = destinationPoint(now.lat, now.lng, headingDeg, speedKmh * 1);
      const perpendicularDeg = (headingDeg + 90) % 360;

      const tick = (center) => {
        const a = destinationPoint(center.lat, center.lng, perpendicularDeg, TICK_HALF_LENGTH_KM);
        const b = destinationPoint(center.lat, center.lng, perpendicularDeg + 180, TICK_HALF_LENGTH_KM);
        return [[a.lng, a.lat], [b.lng, b.lat]];
      };

      features.push({
        type: 'Feature',
        properties: { kind: 'center', alertId: alert.id },
        geometry: { type: 'Point', coordinates: [now.lng, now.lat] },
      });
      features.push({
        type: 'Feature',
        properties: { kind: 'vector', alertId: alert.id },
        geometry: { type: 'LineString', coordinates: [[now.lng, now.lat], [at60.lng, at60.lat]] },
      });
      features.push({
        type: 'Feature',
        properties: { kind: 'tick', minute: 30, alertId: alert.id },
        geometry: { type: 'LineString', coordinates: tick(at30) },
      });
      features.push({
        type: 'Feature',
        properties: { kind: 'tick', minute: 60, alertId: alert.id },
        geometry: { type: 'LineString', coordinates: tick(at60) },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}
