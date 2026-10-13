import { describe, expect, it } from 'vitest';
import {
  affectedCounties, stormAlerts, formatHoursFromNow, parseAdvisoryDate, parseForecastLabel, pressureTrend, resolveArrivalTime,
  stormWatchWarnings, watchWarningHeadline, windFieldExtent,
} from '../../src/app/components/FireDetailPanel/hurricaneModel';

const fc = (props) => ({ type: 'FeatureCollection', features: props.map((properties) => ({ type: 'Feature', properties })) });

describe('hurricaneModel', () => {
  it('parses NHC advisory dates to UTC', () => {
    expect(parseAdvisoryDate('800 AM PDT Tue Oct 06 2026')?.toISOString()).toBe('2026-10-06T15:00:00.000Z');
    expect(parseAdvisoryDate('1100 PM AST Mon Sep 07 2026')?.toISOString()).toBe('2026-09-08T03:00:00.000Z');
    expect(parseAdvisoryDate('1200 PM EDT Fri Oct 02 2026')?.toISOString()).toBe('2026-10-02T16:00:00.000Z');
    expect(parseAdvisoryDate('soon')).toBeNull();
  });

  it('resolves weekday arrival labels against the advisory anchor', () => {
    const anchor = parseForecastLabel('2026-10-06 5:00 AM Tue PDT');
    expect(resolveArrivalTime('Tue 2 pm', anchor)?.toISOString()).toBe('2026-10-06T21:00:00.000Z');
    expect(resolveArrivalTime('Sat 8 am', anchor)?.toISOString()).toBe('2026-10-10T15:00:00.000Z');
    expect(resolveArrivalTime('Tue 2 pm', null)).toBeNull();
    expect(formatHoursFromNow(new Date('2026-10-07T09:00:00Z'), Date.parse('2026-10-06T15:00:00Z'))).toBe('in 18 hr');
    expect(formatHoursFromNow(new Date('2026-10-10T15:00:00Z'), Date.parse('2026-10-06T15:00:00Z'))).toBe('in 4 days');
  });

  it('groups watches and warnings by type, most severe first, for one storm', () => {
    const ww = stormWatchWarnings(fc([
      { slot: 'AT1', wwType: 'Tropical Storm Watch' },
      { slot: 'AT1', wwType: 'Hurricane Warning' },
      { slot: 'AT1', wwType: 'Hurricane Warning' },
      { slot: 'AT2', wwType: 'Hurricane Watch' },
      { slot: 'AT1', wwType: 'Advisory' },
    ]), 'AT1');
    expect(ww.map((w) => [w.type, w.segments])).toEqual([['Hurricane Warning', 2], ['Tropical Storm Watch', 1]]);
    expect(ww[0].color).toBe('#FF0000');
    expect(watchWarningHeadline(ww)).toBe('Hurricane Warning and Tropical Storm Watch in effect');
    expect(watchWarningHeadline([])).toBeNull();
  });

  it('drops segments left over from an earlier advisory', () => {
    const ww = fc([
      { slot: 'EP3', wwType: 'Tropical Storm Warning', advisoryDate: '500 AM MST Wed Sep 30 2026' },
      { slot: 'EP3', wwType: 'Hurricane Watch', advisoryDate: '500 AM PDT Tue Oct 06 2026' },
    ]);
    expect(stormWatchWarnings(ww, 'EP3', '800 AM PDT Tue Oct 06 2026').map((w) => w.type)).toEqual(['Hurricane Watch']);
    expect(stormWatchWarnings(ww, 'EP3').map((w) => w.type)).toEqual(['Hurricane Watch', 'Tropical Storm Warning']);
  });

  it('reads the pressure trend from the two latest fixes', () => {
    const past = fc([
      { slot: 'EP2', dtg: 2026100612, mslp: 977 },
      { slot: 'EP2', dtg: 2026100600, mslp: 973 },
      { slot: 'EP2', dtg: 2026100606, mslp: 973 },
    ]);
    expect(pressureTrend(past, 'EP2')).toEqual({ label: 'Rising', changeMb: 4, hours: 6 });
    expect(pressureTrend(past, 'EP3')).toBeNull();
  });

  it('measures the current wind field from the largest quadrant', () => {
    const radii = fc([
      { slot: 'EP2', tau: 0, radiiKt: 34, ne: 120, se: 90, sw: 60, nw: 100 },
      { slot: 'EP2', tau: 0, radiiKt: 64, ne: 25, se: 20, sw: 10, nw: 15 },
      { slot: 'EP2', tau: 12, radiiKt: 34, ne: 200, se: 0, sw: 0, nw: 0 },
    ]);
    expect(windFieldExtent(radii, 'EP2')).toEqual({ 34: 138, 64: 29 });
  });

  describe('affected areas', () => {
    const vtec = (etn) => ({ VTEC: [`/O.NEW.KLIX.TR.W.${etn}.2026T0000Z-000000T0000Z/`] });
    const box = (lng, lat) => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + 1, lat], [lng + 1, lat + 1], [lng, lat + 1], [lng, lat]]] });
    const al18 = { id: 'nhc-storm-AT1', stormNumber: 18, lng: -80, lat: 25 };
    const ep18 = { id: 'nhc-storm-EP3', stormNumber: 18, lng: -118, lat: 30 };
    const al5 = { id: 'nhc-storm-AT2', stormNumber: 5, lng: -60, lat: 20 };

    it('assigns tropical alerts to storms by VTEC event number, then distance', () => {
      const alerts = [
        { id: 'a', type: 'Tropical Storm Warning', parameters: vtec(1018), geometry: box(-81, 25) },
        { id: 'b', type: 'Hurricane Watch', parameters: vtec(2018), geometry: box(-118, 32) },
        { id: 'c', type: 'Tropical Storm Watch', parameters: vtec(1005) },
        { id: 'd', type: 'Flood Warning', parameters: vtec(18) },
      ];
      const cyclones = [al18, ep18, al5];
      expect(stormAlerts(alerts, al18, cyclones).map((a) => a.id)).toEqual(['a']);
      expect(stormAlerts(alerts, ep18, cyclones).map((a) => a.id)).toEqual(['b']);
      expect(stormAlerts(alerts, al5, cyclones).map((a) => a.id)).toEqual(['c']);
    });

    it('gives an alert without VTEC to the only active storm', () => {
      const alerts = [{ id: 'x', type: 'Storm Surge Warning' }];
      expect(stormAlerts(alerts, al5, [al5])).toHaveLength(1);
    });

    it('rolls alerts up by county with the most severe type and population totals', () => {
      const alerts = [
        { type: 'Tropical Storm Warning', geocode: { SAME: ['012086', '012087'] } },
        { type: 'Storm Surge Warning', geocode: { SAME: ['012087'] } },
        { type: 'Hurricane Watch', geocode: { SAME: ['112086'] } },
      ];
      const pops = { 12086: ['Miami-Dade County, Florida', 2700000], 12087: ['Monroe County, Florida', 82000] };
      const result = affectedCounties(alerts, pops);
      expect(result.counties.map((c) => [c.name, c.type])).toEqual([
        ['Monroe County, Florida', 'Storm Surge Warning'],
        ['Miami-Dade County, Florida', 'Tropical Storm Warning'],
      ]);
      expect(result.tsWarningPopulation).toBe(2782000);
      expect(result.hurricaneWatchPopulation).toBe(2700000);
      expect(affectedCounties(alerts, {}).tsWarningPopulation).toBeNull();
    });
  });
});
