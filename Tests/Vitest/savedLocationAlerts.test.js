import { describe, it, expect, vi } from 'vitest';
import {
  runNotificationSync,
  nwsAlertKey,
  normalizeNwsAlert,
  isAlertActive,
  parseVtec,
  fireDistanceWithinRadius,
  locationRadiusMiles,
  validateSavedLocationFields,
  DEFAULT_RADIUS_MILES,
} from '../../supabase/functions/_shared/savedLocationAlerts.js';
import { haversineMiles } from '../../src/app/utils/radiusFilter';

const NOW = Date.parse('2026-10-04T15:00:00Z');
const MI_PER_DEG_LAT = 69.05; // close enough for placing test points

// Boise-ish
const HOME = {
  id: 'loc-home', user_id: 'user-1', name: 'Home', latitude: 43.6, longitude: -116.2,
  notify_radius_miles: 25, notify_new_fires: true, email: 'u1@example.com', nws_alert_types: [],
};
const PROPERTY = { ...HOME, id: 'loc-property', name: 'Property', latitude: 43.7 };
const WORK = { ...HOME, id: 'loc-work', name: 'Work', latitude: 45.5 }; // ~130 mi north

const fireNorthOf = (loc, miles, id = 'FIRE-1') => ({
  id, name: 'Test Fire', lat: loc.latitude + miles / MI_PER_DEG_LAT, lng: loc.longitude,
});

function square(lat, lng, halfDeg) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - halfDeg, lat - halfDeg], [lng + halfDeg, lat - halfDeg],
      [lng + halfDeg, lat + halfDeg], [lng - halfDeg, lat + halfDeg], [lng - halfDeg, lat - halfDeg],
    ]],
  };
}

function nwsFeature({
  id = 'urn:oid:1', event = 'Severe Thunderstorm Warning', geometry = null,
  vtec = '/O.NEW.KBOI.SV.W.0045.261004T1500Z-261004T1600Z/', ends = '2026-10-04T16:00:00Z',
  messageType = 'Alert',
} = {}) {
  return {
    id,
    geometry,
    properties: {
      id, event, headline: `${event} issued`, messageType, sent: '2026-10-04T15:00:00Z',
      ends, expires: ends, parameters: vtec ? { VTEC: [vtec] } : {},
    },
  };
}

/** In-memory notification_log with the (user, location, kind, subject) unique index. */
function makeHarness({
  locations, fires = [], regionalAlerts = [], pointAlerts = {}, sendEmail,
} = {}) {
  const log = new Map();
  let nextId = 1;
  const sent = [];
  const events = [];
  const deps = {
    fetchMonitoredLocations: vi.fn(async () => locations),
    fetchActiveFires: vi.fn(async () => fires),
    fetchActiveAlerts: vi.fn(async () => regionalAlerts),
    fetchPointAlerts: vi.fn(async (lat, lng) => {
      const loc = locations.find((l) => l.latitude === lat && l.longitude === lng);
      return pointAlerts[loc?.id] || [];
    }),
    claimNotification: vi.fn(async (row) => {
      const key = [row.user_id, row.saved_location_id, row.kind, row.subject_key].join('|');
      if (log.has(key)) return { isNew: false, id: null };
      const id = `log-${nextId++}`;
      log.set(key, { ...row, id });
      return { isNew: true, id };
    }),
    releaseNotification: vi.fn(async (id) => {
      for (const [k, v] of log) if (v.id === id) log.delete(k);
    }),
    sendEmail: sendEmail || vi.fn(async (msg) => { sent.push(msg); }),
    log: (event, fields) => events.push({ event, ...fields }),
    appUrl: 'https://app.example',
    now: NOW,
  };
  return { deps, log, sent, events, run: () => runNotificationSync(deps) };
}

describe('fire radius matching', () => {
  it('matches a fire inside the radius', () => {
    expect(fireDistanceWithinRadius(fireNorthOf(HOME, 10), HOME)).toBeCloseTo(10, 0);
  });

  it('rejects a fire outside the radius', () => {
    expect(fireDistanceWithinRadius(fireNorthOf(HOME, 30), HOME)).toBeNull();
  });

  it('is inclusive at exactly the radius', () => {
    const fire = fireNorthOf(HOME, 20);
    const exact = haversineMiles(HOME.latitude, HOME.longitude, fire.lat, fire.lng);
    expect(fireDistanceWithinRadius(fire, { ...HOME, notify_radius_miles: exact })).toBe(exact);
    expect(fireDistanceWithinRadius(fire, { ...HOME, notify_radius_miles: exact - 0.01 })).toBeNull();
  });

  it('uses each location\'s own radius', () => {
    const fire = fireNorthOf(HOME, 40);
    expect(fireDistanceWithinRadius(fire, HOME)).toBeNull();
    expect(fireDistanceWithinRadius(fire, { ...HOME, notify_radius_miles: 50 })).not.toBeNull();
  });

  it('falls back to the default radius when missing or invalid', () => {
    expect(locationRadiusMiles({ ...HOME, notify_radius_miles: null })).toBe(DEFAULT_RADIUS_MILES);
    expect(locationRadiusMiles({ ...HOME, notify_radius_miles: 0 })).toBe(DEFAULT_RADIUS_MILES);
    expect(locationRadiusMiles({ ...HOME, notify_radius_miles: 500 })).toBe(DEFAULT_RADIUS_MILES);
  });

  it('ignores fires with invalid coordinates', () => {
    expect(fireDistanceWithinRadius({ id: 'x', lat: NaN, lng: 0 }, HOME)).toBeNull();
    expect(fireDistanceWithinRadius({ id: 'x', lat: 95, lng: 0 }, HOME)).toBeNull();
  });
});

describe('runNotificationSync — wildfires', () => {
  it('sends a "Wildfire near <location>" email for a fire inside the radius', async () => {
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 10)] });
    const counts = await h.run();
    expect(counts.sent).toBe(1);
    expect(h.sent[0].to).toBe('u1@example.com');
    expect(h.sent[0].subject).toBe('Wildfire near Home: Test Fire');
    expect(h.sent[0].html).toContain('Wildfire near Home');
  });

  it('sends nothing for a fire outside the radius', async () => {
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 60)] });
    const counts = await h.run();
    expect(counts.sent).toBe(0);
    expect(h.deps.claimNotification).not.toHaveBeenCalled();
    expect(h.events.find((e) => e.event === 'fires_outside_radius')).toMatchObject({ locationId: 'loc-home', count: 1 });
  });

  it('respects the per-location wildfire switch', async () => {
    const h = makeHarness({ locations: [{ ...HOME, notify_new_fires: false }], fires: [fireNorthOf(HOME, 5)] });
    const counts = await h.run();
    expect(counts.sent).toBe(0);
    expect(h.deps.fetchActiveFires).not.toHaveBeenCalled();
  });

  it('does not re-send the same fire on the next run', async () => {
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 10)] });
    await h.run();
    const second = await h.run();
    expect(h.sent).toHaveLength(1);
    expect(second.duplicates).toBe(1);
    expect(h.events.some((e) => e.event === 'duplicate_suppressed')).toBe(true);
  });

  it('sends one email per affected location, none for unaffected ones', async () => {
    const h = makeHarness({ locations: [HOME, PROPERTY, WORK], fires: [fireNorthOf(HOME, 3)] });
    await h.run();
    await h.run();
    expect(h.sent.map((m) => m.subject).sort()).toEqual([
      'Wildfire near Home: Test Fire',
      'Wildfire near Property: Test Fire',
    ]);
  });

  it('stops monitoring once a location is deleted or disabled (no longer returned by the RPC)', async () => {
    const locations = [HOME];
    const h = makeHarness({ locations, fires: [fireNorthOf(HOME, 3, 'A')] });
    await h.run();
    locations.length = 0; // deleted / alerts_enabled=false / over plan limit
    h.deps.fetchActiveFires.mockResolvedValue([fireNorthOf(HOME, 3, 'B')]);
    const counts = await h.run();
    expect(counts.locationsEvaluated).toBe(0);
    expect(h.sent).toHaveLength(1);
  });
});

describe('runNotificationSync — delivery and error handling', () => {
  it('releases the claim on a retryable failure so the next run retries', async () => {
    const sendEmail = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Resend 503'), { status: 503 }))
      .mockResolvedValue(undefined);
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 5)], sendEmail });
    const first = await h.run();
    expect(first.failed).toBe(1);
    expect(h.deps.releaseNotification).toHaveBeenCalledTimes(1);
    expect(h.log.size).toBe(0);
    const second = await h.run();
    expect(second.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('retries after a sender misconfiguration (Resend 403 unverified domain)', async () => {
    const sendEmail = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('verify a domain'), { status: 403 }))
      .mockResolvedValue(undefined);
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 5)], sendEmail });
    await h.run();
    expect(h.log.size).toBe(0);
    expect((await h.run()).sent).toBe(1);
  });

  it('keeps the claim on a permanent failure (no retry storm)', async () => {
    const sendEmail = vi.fn().mockRejectedValue(Object.assign(new Error('invalid to'), { status: 422 }));
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 5)], sendEmail });
    await h.run();
    await h.run();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(h.deps.releaseNotification).not.toHaveBeenCalled();
  });

  it('does not send when the dedup claim itself fails', async () => {
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 5)] });
    h.deps.claimNotification.mockRejectedValueOnce(new Error('db down'));
    const counts = await h.run();
    expect(counts.sent).toBe(0);
    expect(counts.failed).toBe(1);
  });

  it('skips locations with invalid coordinates or no delivery address', async () => {
    const h = makeHarness({
      locations: [{ ...HOME, id: 'bad', latitude: 123 }, { ...HOME, id: 'noemail', email: null }],
      fires: [fireNorthOf(HOME, 1)],
    });
    const counts = await h.run();
    expect(counts.skippedInvalid).toBe(2);
    expect(counts.sent).toBe(0);
  });

  it('never logs email addresses', async () => {
    const h = makeHarness({ locations: [HOME], fires: [fireNorthOf(HOME, 5)] });
    await h.run();
    expect(JSON.stringify(h.events)).not.toContain('u1@example.com');
  });
});

describe('runNotificationSync — NWS alerts', () => {
  const subscribed = { ...HOME, nws_alert_types: ['Severe Thunderstorm Warning'] };

  it('notifies when a subscribed alert covers the location', async () => {
    const h = makeHarness({ locations: [subscribed], pointAlerts: { 'loc-home': [nwsFeature()] } });
    await h.run();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].subject).toBe('Severe Thunderstorm Warning for Home');
  });

  it('notifies when a subscribed alert polygon is within the radius', async () => {
    // 0.1°-half-width box centred ~15 mi north: edge ~8 mi away
    const geometry = square(HOME.latitude + 15 / MI_PER_DEG_LAT, HOME.longitude, 0.1);
    const h = makeHarness({ locations: [subscribed], regionalAlerts: [nwsFeature({ geometry })] });
    await h.run();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].subject).toBe('Severe Thunderstorm Warning near Home');
  });

  it('ignores an alert polygon outside the radius', async () => {
    const geometry = square(HOME.latitude + 80 / MI_PER_DEG_LAT, HOME.longitude, 0.1);
    const h = makeHarness({ locations: [subscribed], regionalAlerts: [nwsFeature({ geometry })] });
    const counts = await h.run();
    expect(counts.sent).toBe(0);
  });

  it('ignores alert types the user has not subscribed to', async () => {
    const h = makeHarness({
      locations: [subscribed],
      pointAlerts: { 'loc-home': [nwsFeature({ event: 'Wind Advisory', vtec: '/O.NEW.KBOI.WI.Y.0010.261004T1500Z-261004T1600Z/' })] },
    });
    expect((await h.run()).sent).toBe(0);
  });

  it('sends nothing when the user subscribed to no alert types', async () => {
    const h = makeHarness({ locations: [HOME], pointAlerts: { 'loc-home': [nwsFeature()] } });
    expect((await h.run()).sent).toBe(0);
    expect(h.deps.fetchPointAlerts).not.toHaveBeenCalled();
  });

  it('ignores expired and cancelled alerts', async () => {
    const h = makeHarness({
      locations: [subscribed],
      pointAlerts: {
        'loc-home': [
          nwsFeature({ id: 'a', ends: '2026-10-04T14:00:00Z' }),
          nwsFeature({ id: 'b', messageType: 'Cancel', vtec: '/O.CAN.KBOI.SV.W.0046.261004T1500Z-261004T1600Z/' }),
        ],
      },
    });
    expect((await h.run()).sent).toBe(0);
  });

  it('does not re-send when NWS issues an update (new id, same VTEC event)', async () => {
    const h = makeHarness({ locations: [subscribed], pointAlerts: { 'loc-home': [nwsFeature({ id: 'urn:1' })] } });
    await h.run();
    h.deps.fetchPointAlerts.mockResolvedValue([
      nwsFeature({ id: 'urn:2', vtec: '/O.CON.KBOI.SV.W.0045.000000T0000Z-261004T1600Z/' }),
    ]);
    await h.run();
    expect(h.sent).toHaveLength(1);
  });

  it('counts an alert found by both the point and regional queries once', async () => {
    const geometry = square(HOME.latitude, HOME.longitude, 0.2);
    const feature = nwsFeature({ geometry });
    const h = makeHarness({ locations: [subscribed], regionalAlerts: [feature], pointAlerts: { 'loc-home': [feature] } });
    await h.run();
    expect(h.sent).toHaveLength(1);
  });

  it('keeps going with point alerts when the regional fetch fails', async () => {
    const h = makeHarness({ locations: [subscribed], pointAlerts: { 'loc-home': [nwsFeature()] } });
    h.deps.fetchActiveAlerts.mockRejectedValue(new Error('NWS 500'));
    expect((await h.run()).sent).toBe(1);
  });

  it('notifies each affected location independently', async () => {
    const geometry = square(HOME.latitude + 0.05, HOME.longitude, 0.2);
    const h = makeHarness({
      locations: [subscribed, { ...PROPERTY, nws_alert_types: subscribed.nws_alert_types }, { ...WORK, nws_alert_types: subscribed.nws_alert_types }],
      regionalAlerts: [nwsFeature({ geometry })],
    });
    await h.run();
    expect(h.sent.map((m) => m.subject).sort()).toEqual([
      'Severe Thunderstorm Warning near Home',
      'Severe Thunderstorm Warning near Property',
    ]);
  });
});

describe('NWS alert identity', () => {
  it('parses P-VTEC', () => {
    expect(parseVtec('/O.NEW.KBOI.SV.W.0045.261004T1500Z-261004T1600Z/')).toMatchObject({
      action: 'NEW', office: 'KBOI', phenomena: 'SV', significance: 'W', etn: '0045',
    });
    expect(parseVtec('garbage')).toBeNull();
  });

  it('keys on the VTEC event, falling back to the alert id', () => {
    expect(nwsAlertKey(normalizeNwsAlert(nwsFeature()))).toBe('alert:vtec:KBOI.SV.W.0045.2026');
    expect(nwsAlertKey(normalizeNwsAlert(nwsFeature({ vtec: null, id: 'urn:x' })))).toBe('alert:urn:x');
  });

  it('treats all-ended VTEC actions as inactive', () => {
    const exp = normalizeNwsAlert(nwsFeature({ vtec: '/O.EXP.KBOI.SV.W.0045.261004T1500Z-261004T1600Z/' }));
    expect(isAlertActive(exp, NOW)).toBe(false);
    expect(isAlertActive(normalizeNwsAlert(nwsFeature()), NOW)).toBe(true);
  });
});

describe('validateSavedLocationFields', () => {
  it('accepts a complete valid location', () => {
    expect(validateSavedLocationFields({ name: 'Home', latitude: 43.6, longitude: -116.2, notify_radius_miles: 25 })).toBeNull();
  });

  it.each([
    [{ name: '   ' }, /name/i],
    [{ name: 'x'.repeat(121) }, /120/],
    [{ latitude: 91, longitude: 0 }, /coordinates/],
    [{ latitude: 0, longitude: -181 }, /coordinates/],
    [{ latitude: undefined, longitude: 0 }, /coordinates/],
    [{ notify_radius_miles: 0 }, /radius/i],
    [{ notify_radius_miles: 101 }, /radius/i],
    [{ notify_radius_miles: 2.5 }, /radius/i],
    [{ notify_radius_miles: null }, /radius/i],
  ])('rejects %j', (fields, message) => {
    expect(validateSavedLocationFields(fields)).toMatch(message);
  });
});
