import { describe, it, expect } from 'vitest';
import { parseStormMotion, destinationPoint, buildStormMotionVectorsGeoJSON } from '../../src/app/utils/stormMotion';

describe('parseStormMotion', () => {
  it('parses a real-world TIME...MOT...LOC line', () => {
    const alert = {
      id: 'a1',
      sent: '2026-09-15T22:00:00Z',
      description:
        'SEVERE THUNDERSTORM WARNING FOR...\n' +
        'TIME...MOT...LOC 2247Z 268DEG 39KT 3617 9757\n' +
        'HAZARD...60 MPH WIND GUSTS AND QUARTER SIZE HAIL.',
    };
    const [vector] = parseStormMotion(alert);
    expect(vector.lat).toBeCloseTo(36.17, 5);
    expect(vector.lng).toBeCloseTo(-97.57, 5);
    // MOT is the FROM direction — heading (direction of travel) is the reverse.
    expect(vector.headingDeg).toBe((268 + 180) % 360);
    expect(vector.speedKmh).toBeCloseTo(39 * 1.852, 5);
  });

  it('parses multiple lat/lon pairs (a line of storms sharing one motion vector)', () => {
    const alert = {
      sent: '2026-09-15T22:00:00Z',
      description: 'TIME...MOT...LOC 2247Z 270DEG 40KT 3600 9700 3700 9800',
    };
    const vectors = parseStormMotion(alert);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toMatchObject({ lat: 36, lng: -97 });
    expect(vectors[1]).toMatchObject({ lat: 37, lng: -98 });
    // Both points share the same motion.
    expect(vectors[0].headingDeg).toBe(vectors[1].headingDeg);
    expect(vectors[0].speedKmh).toBe(vectors[1].speedKmh);
  });

  it('returns [] for an alert with no motion line', () => {
    expect(parseStormMotion({ sent: '2026-09-15T22:00:00Z', description: 'FLOOD WARNING...' })).toEqual([]);
  });

  it('returns [] when the alert has no sent timestamp, even with a motion line', () => {
    expect(parseStormMotion({ description: 'TIME...MOT...LOC 2247Z 268DEG 39KT 3617 9757' })).toEqual([]);
  });

  it('rolls back a day when the parsed time would otherwise land hours after `sent` (UTC midnight rollover)', () => {
    // Alert sent just after midnight UTC; the embedded report time (2350Z)
    // must refer to the previous day, not >23h in the future.
    const alert = {
      sent: '2026-09-15T00:05:00Z',
      description: 'TIME...MOT...LOC 2350Z 270DEG 30KT 3600 9700',
    };
    const [vector] = parseStormMotion(alert);
    expect(new Date(vector.reportTimeMs).toISOString()).toBe('2026-09-14T23:50:00.000Z');
  });
});

describe('destinationPoint', () => {
  it('moving due north increases latitude, longitude unchanged', () => {
    const dest = destinationPoint(0, 0, 0, 111.2); // ~1 degree of latitude
    expect(dest.lat).toBeCloseTo(1, 1);
    expect(dest.lng).toBeCloseTo(0, 5);
  });

  it('moving due east increases longitude, latitude unchanged', () => {
    const dest = destinationPoint(0, 0, 90, 111.2);
    expect(dest.lat).toBeCloseTo(0, 5);
    expect(dest.lng).toBeCloseTo(1, 1);
  });

  it('zero distance returns the same point', () => {
    const dest = destinationPoint(36.17, -97.57, 88, 0);
    expect(dest.lat).toBeCloseTo(36.17, 5);
    expect(dest.lng).toBeCloseTo(-97.57, 5);
  });
});

describe('buildStormMotionVectorsGeoJSON', () => {
  const alert = {
    id: 'a1',
    sent: '2026-09-15T22:47:00Z',
    description: 'TIME...MOT...LOC 2247Z 270DEG 40KT 3600 9700',
  };

  it('produces one center point, one vector line, and two tick lines per motion vector', () => {
    const fc = buildStormMotionVectorsGeoJSON([alert], new Date('2026-09-15T22:47:00Z').getTime());
    const byKind = (kind) => fc.features.filter((f) => f.properties.kind === kind);
    expect(byKind('center')).toHaveLength(1);
    expect(byKind('vector')).toHaveLength(1);
    expect(byKind('tick')).toHaveLength(2);
    expect(byKind('tick').map((f) => f.properties.minute).sort()).toEqual([30, 60]);
  });

  it('the vector line runs from the center point to the 60-minute tick\'s position', () => {
    const now = new Date('2026-09-15T22:47:00Z').getTime();
    const fc = buildStormMotionVectorsGeoJSON([alert], now);
    const center = fc.features.find((f) => f.properties.kind === 'center');
    const vector = fc.features.find((f) => f.properties.kind === 'vector');
    const tick60 = fc.features.find((f) => f.properties.kind === 'tick' && f.properties.minute === 60);

    expect(vector.geometry.coordinates[0]).toEqual(center.geometry.coordinates);
    // The 60-min tick is centered on the vector line's far end.
    const [tickA, tickB] = tick60.geometry.coordinates;
    const midpoint = [(tickA[0] + tickB[0]) / 2, (tickA[1] + tickB[1]) / 2];
    const vectorEnd = vector.geometry.coordinates[1];
    expect(midpoint[0]).toBeCloseTo(vectorEnd[0], 3);
    expect(midpoint[1]).toBeCloseTo(vectorEnd[1], 3);
  });

  it('the tick marks are perpendicular to the vector\'s direction of travel', () => {
    const fc = buildStormMotionVectorsGeoJSON([alert], new Date('2026-09-15T22:47:00Z').getTime());
    const vector = fc.features.find((f) => f.properties.kind === 'vector');
    const tick30 = fc.features.find((f) => f.properties.kind === 'tick' && f.properties.minute === 30);

    const angle = ([lng1, lat1], [lng2, lat2]) => Math.atan2(lng2 - lng1, lat2 - lat1);
    const vectorAngle = angle(vector.geometry.coordinates[0], vector.geometry.coordinates[1]);
    const tickAngle = angle(tick30.geometry.coordinates[0], tick30.geometry.coordinates[1]);
    const diffDeg = Math.abs(((vectorAngle - tickAngle) * 180) / Math.PI);
    // Perpendicular = 90 degrees apart (mod 180, since a line has no direction).
    expect(Math.min(diffDeg % 180, 180 - (diffDeg % 180))).toBeCloseTo(90, 0);
  });

  it('advances the center point further along the heading as more time passes since the report', () => {
    const reportMs = new Date('2026-09-15T22:47:00Z').getTime();
    const fcAtReport = buildStormMotionVectorsGeoJSON([alert], reportMs);
    const fcOneHourLater = buildStormMotionVectorsGeoJSON([alert], reportMs + 60 * 60 * 1000);

    const centerAt = (fc) => fc.features.find((f) => f.properties.kind === 'center').geometry.coordinates;
    expect(centerAt(fcOneHourLater)).not.toEqual(centerAt(fcAtReport));
  });

  it('returns an empty FeatureCollection for alerts with no motion line', () => {
    const fc = buildStormMotionVectorsGeoJSON([{ sent: '2026-09-15T22:00:00Z', description: 'no motion here' }], Date.now());
    expect(fc).toEqual({ type: 'FeatureCollection', features: [] });
  });
});
