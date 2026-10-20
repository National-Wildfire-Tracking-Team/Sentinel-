/**
 * fireDangerAlerts.test.js
 * Fire danger email checks (supabase/functions/_shared/fireDangerAlerts.js)
 * against recorded NWCG and FEMS data, and their hook into runNotificationSync.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifySfp, worstAreaNear, nearestCurrentStation, isoWeek, runFireDangerChecks, sfpQueryUrl,
} from '../../supabase/functions/_shared/fireDangerAlerts.js';
import { classifySfp as mapClassify } from '../../src/app/api/fireDanger/significantFirePotential';
import { runNotificationSync, validateSavedLocationFields } from '../../supabase/functions/_shared/savedLocationAlerts.js';

const SFP = JSON.parse(readFileSync(resolve(process.cwd(), 'Tests/Vitest/fixtures/nwcgSfpDay1.json'), 'utf8'));
const FEMS = JSON.parse(readFileSync(resolve(process.cwd(), 'Tests/Vitest/fixtures/femsStations.json'), 'utf8'));

// SA21C (moderate, issued) centroid area, from the recorded polygon
const ring = SFP.features.find((f) => f.properties.nat_code === 'SA21C').geometry.coordinates[0];
const [cx, cy] = ring.reduce(([x, y], [a, b]) => [x + a / ring.length, y + b / ring.length], [0, 0]);
const LOC = { id: 'loc1', user_id: 'u1', name: 'Home', latitude: cy, longitude: cx, notify_radius_miles: 10, email: 'a@example.org' };

describe('classification', () => {
  it('matches the map layer for every code combination', () => {
    for (const isvalid of [0, 1]) for (const drynesscode of [0, 1, 2, 3, 9]) for (const type of [null, 'CRITICAL', 'IGNITION', 'X']) {
      const p = { isvalid, drynesscode, type };
      expect(classifySfp(p)).toBe(mapClassify(p));
    }
  });
  it('queries the NWCG service layer for the day', () => {
    expect(sfpQueryUrl(3)).toMatch(/^https:\/\/fsapps\.nwcg\.gov\/psp\/arcgis\/rest\/services\/npsg\/outlooks_forecast\/MapServer\/2\/query\?/);
  });
});

describe('matching', () => {
  it('finds the issued area at the location and reads its date', () => {
    expect(worstAreaNear(SFP.features, LOC, 10)).toMatchObject({ cls: 'moderate', rank: 3, psa: 'SA21C', date: '2026-10-20' });
  });
  it('ignores areas not yet issued', () => {
    const nc = SFP.features.find((f) => f.properties.nat_code === 'NC03A').geometry.coordinates[0][0];
    expect(worstAreaNear(SFP.features, { latitude: nc[1], longitude: nc[0] }, 1)).toBeNull();
  });
  it('finds the nearest current station within 40 km, skipping stale ones', () => {
    const latest = FEMS.manifest.sources.fems.latestObservedDate;
    const near = nearestCurrentStation(FEMS.stations, latest, 34.70, -85.16);
    expect(near.station.name).toBe('ARMUCHEE');
    expect(nearestCurrentStation(FEMS.stations, latest, 36.07, -88.17)).toBeNull(); // CAMDEN TOWER: last observed Oct 13
  });
  it('labels weeks so dry spells email weekly', () => {
    expect(isoWeek('2026-10-19')).toBe('2026-W43');
    expect(isoWeek('2026-10-25')).toBe('2026-W43');
    expect(isoWeek('2026-10-26')).toBe('2026-W44');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });
});

describe('runFireDangerChecks', () => {
  const base = { radiusOf: (l) => l.notify_radius_miles, log: () => {}, appUrl: 'https://app.test' };
  const fetchFirePotential = vi.fn(async () => SFP.features);

  it('alerts when the level is reached, keyed by area, date and level', async () => {
    const deliver = vi.fn();
    await runFireDangerChecks({ ...base, deliver, fetchFirePotential, locations: [{ ...LOC, notify_fire_potential_min: 3, notify_fire_potential_days: 1 }] });
    expect(deliver).toHaveBeenCalledTimes(1);
    const { kind, subjectKey, email } = deliver.mock.calls[0][0];
    expect(kind).toBe('fire_danger');
    expect(subjectKey).toBe('sfp:SA21C:2026-10-20:moderate');
    expect(email.html).toContain('official 7-Day Significant Fire Potential');
  });

  it('stays quiet below the chosen level, or when off', async () => {
    const deliver = vi.fn();
    await runFireDangerChecks({ ...base, deliver, fetchFirePotential, locations: [{ ...LOC, notify_fire_potential_min: 4 }, { ...LOC, notify_fire_potential_min: null }] });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('alerts on 100-hour moisture below the user threshold only', async () => {
    const deliver = vi.fn();
    const fetchFireDangerStations = async () => ({ stations: FEMS.stations, latestObservedDate: FEMS.manifest.sources.fems.latestObservedDate });
    const near = { ...LOC, latitude: 34.70, longitude: -85.16 };
    const fm = FEMS.stations.features.find((f) => f.properties.name === 'ARMUCHEE').properties.fm100;
    await runFireDangerChecks({ ...base, deliver, fetchFireDangerStations, locations: [{ ...near, notify_fm100_below: fm + 1 }, { ...near, id: 'loc2', notify_fm100_below: fm - 1 }] });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].subjectKey).toMatch(/^fm100:\d+:2026-W43$/);
    expect(deliver.mock.calls[0][0].email.html).toContain(`${fm}%`);
  });

  it('skips the fuel moisture check when the station feed is not configured', async () => {
    const deliver = vi.fn();
    const log = vi.fn();
    await runFireDangerChecks({ ...base, log, deliver, fetchFireDangerStations: async () => null, locations: [{ ...LOC, notify_fm100_below: 10 }] });
    expect(deliver).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('fire_danger_stations_unavailable', { locations: 1 });
  });
});

describe('runNotificationSync integration', () => {
  it('sends fire danger emails through the same claim and delivery, and survives a source failure', async () => {
    const sendEmail = vi.fn();
    const claimNotification = vi.fn(async () => ({ isNew: true, id: 1 }));
    const deps = {
      fetchMonitoredLocations: async () => [{ ...LOC, notify_new_fires: false, nws_alert_types: [], notify_fire_potential_min: 3, notify_fire_potential_days: 2 }],
      fetchActiveFires: async () => [],
      fetchActiveAlerts: async () => [],
      fetchPointAlerts: async () => [],
      fetchFirePotential: async (day) => { if (day === 2) throw new Error('timeout'); return SFP.features; },
      claimNotification, releaseNotification: vi.fn(), sendEmail,
    };
    const counts = await runNotificationSync(deps);
    expect(counts.sent).toBe(1);
    expect(claimNotification.mock.calls[0][0]).toMatchObject({ kind: 'fire_danger', saved_location_id: 'loc1' });
  });

  it('validates the new settings', () => {
    expect(validateSavedLocationFields({ notify_fire_potential_min: 2 })).toMatch(/level/);
    expect(validateSavedLocationFields({ notify_fire_potential_days: 8 })).toMatch(/1 to 7/);
    expect(validateSavedLocationFields({ notify_fm100_below: 40 })).toMatch(/1% and 30%/);
    expect(validateSavedLocationFields({ notify_fire_potential_min: null, notify_fm100_below: null, notify_fire_potential_days: 3 })).toBeNull();
  });
});
