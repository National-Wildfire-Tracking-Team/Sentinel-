import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchNhcTextProducts, formatAdvisoryLocal, parsePws, parseTcd, parseTcm, parseTcp, titleCase,
} from '../../src/app/api/nhcTextProducts';
import { clearCache } from '../../src/app/utils/dataCache';

// Real products from Hurricane Rachel, advisory 38 (Oct 6 2026).
const fixture = (type) => readFileSync(join(process.cwd(), 'Tests/Vitest/fixtures/nhc', `rachel-38-${type}.txt`), 'utf8');

// Trimmed to the sections that only appear with a land threat, in NHC's format.
const TCP_WITH_WATCHES = `
000
WTPZ33 KNHC 081445
TCPEP3

BULLETIN
Hurricane Rachel Advisory Number  46
NWS National Hurricane Center Miami FL       EP182026
200 PM PDT Thu Oct 08 2026

...RACHEL HEADING FOR NORTHERN BAJA CALIFORNIA...

SUMMARY OF 200 PM PDT...2100 UTC...INFORMATION
----------------------------------------------
LOCATION...27.4N 117.9W
ABOUT 190 MI...305 KM SW OF ENSENADA MEXICO
ABOUT 250 MI...400 KM S OF SAN DIEGO CALIFORNIA
MAXIMUM SUSTAINED WINDS...115 MPH...185 KM/H

WATCHES AND WARNINGS
--------------------
CHANGES WITH THIS ADVISORY:

The Government of Mexico has issued a Hurricane Watch from Ensenada
to the U.S./Mexico border.

SUMMARY OF WATCHES AND WARNINGS IN EFFECT:

A Hurricane Watch is in effect for...
* Ensenada to the U.S./Mexico border

A Tropical Storm Warning is in effect for...
* Punta Eugenia to Ensenada
* Isla Guadalupe and the coast of northern Baja California south of
the U.S./Mexico border

For storm information specific to your area in the United States,
please monitor products issued by your local National Weather Service
forecast office.

DISCUSSION AND OUTLOOK
----------------------
Hurricane-force winds extend outward up to 30 miles (45 km) from the
center and tropical-storm-force winds extend outward up to 140 miles
(220 km).

HAZARDS AFFECTING LAND
----------------------
STORM SURGE: The combination of a dangerous storm surge and the tide
will cause normally dry areas near the coast to be flooded by rising
waters moving inland from the shoreline. The water could reach the
following heights above ground somewhere in the indicated areas if the
peak surge occurs at the time of high tide...

Ensenada to U.S./Mexico border...3-5 ft
Punta Eugenia to Ensenada...1-3 ft

RAINFALL: Rachel is expected to produce rainfall totals of 2 to 4
inches across northern Baja California, with isolated amounts of 6
inches.

WIND: Hurricane conditions are possible within the watch area.

NEXT ADVISORY
-------------
Next intermediate advisory at 500 PM PDT.
Next complete advisory at 800 PM PDT.

$$
Forecaster Kelly
`;

describe('NHC text parsers', () => {
  it('reads the place, wind field and next advisory from a public advisory', () => {
    const tcp = parseTcp(fixture('TCP'));
    expect(tcp.place).toBe('640 mi WSW of the Southern Tip of Baja California');
    expect(tcp.windExtentMi).toEqual({ 34: 140, 64: 35 });
    expect(tcp.nextAdvisory).toBe('Next complete advisory at 2:00 PM PDT');
    expect(tcp.watchWarnings).toEqual([]);
    expect(tcp.surge).toBeNull();
    expect(tcp.rainfall).toBeNull();
  });

  it('reads watches by area, surge heights and rainfall when land is threatened', () => {
    const tcp = parseTcp(TCP_WITH_WATCHES);
    expect(tcp.place).toBe('190 mi SW of Ensenada Mexico');
    expect(tcp.watchWarnings).toEqual([
      { type: 'Hurricane Watch', areas: ['Ensenada to the U.S./Mexico border'] },
      {
        type: 'Tropical Storm Warning',
        areas: ['Punta Eugenia to Ensenada', 'Isla Guadalupe and the coast of northern Baja California south of the U.S./Mexico border'],
      },
    ]);
    expect(tcp.surge.rows).toEqual([
      { area: 'Ensenada to U.S./Mexico border', minFt: 3, maxFt: 5 },
      { area: 'Punta Eugenia to Ensenada', minFt: 1, maxFt: 3 },
    ]);
    expect(tcp.surge.text).toMatch(/^The combination of a dangerous storm surge/);
    expect(tcp.rainfall).toBe('Rachel is expected to produce rainfall totals of 2 to 4 inches across northern Baja California, with isolated amounts of 6 inches.');
    expect(tcp.nextAdvisory).toBe('Next intermediate advisory at 5:00 PM PDT');
  });

  it('splits a discussion into paragraphs and reads forecast-point notes', () => {
    const tcd = parseTcd(fixture('TCD'));
    expect(tcd.discussion.length).toBeGreaterThan(1);
    expect(tcd.discussion[0]).toMatch(/^Satellite imagery this morning shows that Rachel's inner core has degraded/);
    expect(tcd.discussion.join(' ')).not.toMatch(/FORECAST POSITIONS|INIT/);
    expect(tcd.tauNotes).toEqual({ 96: 'post-tropical', 120: 'post-tropical' });
    expect(tcd.keyMessages).toEqual([]);

    const withKeys = parseTcd(`800 AM PDT Tue Oct 06 2026\n\nFirst para.\n\nKEY MESSAGES:\n\n1. Hurricane conditions\nare possible.\n\n2. Heavy rain.\n\nFORECAST POSITIONS AND MAX WINDS\n\n 72H  09/1200Z 32.0N 116.0W   35 KT  40 MPH...INLAND\n\n$$`);
    expect(withKeys.discussion).toEqual(['First para.']);
    expect(withKeys.keyMessages).toEqual(['Hurricane conditions are possible.', 'Heavy rain.']);
    expect(withKeys.tauNotes).toEqual({ 72: 'inland' });
  });

  it('reads the eye diameter only when NHC gives one', () => {
    expect(parseTcm(fixture('TCM'))).toEqual({ eyeDiameterNm: null });
    expect(parseTcm('EYE DIAMETER  20 NM\n64 KT....... 30NE')).toEqual({ eyeDiameterNm: 20 });
  });

  it('reads the per-location wind speed probability table', () => {
    const rows = parsePws(fixture('PWS'));
    expect(rows[0]).toEqual({
      location: 'Is Guadalupe', kt: 34, cumulative: { 12: 0, 24: 0, 36: 0, 48: 0, 72: 0, 96: 0, 120: 8 },
    });
    expect(rows.find((r) => r.location === '20N 120W' && r.kt === 50).cumulative).toMatchObject({ 12: 60, 24: 61, 48: 61, 120: 61 });
    expect(rows.filter((r) => r.kt === 64)).toHaveLength(1);
  });

  it('formats names and advisory times the way NHC readers expect', () => {
    expect(titleCase('SAN DIEGO CALIFORNIA')).toBe('San Diego California');
    expect(titleCase('PUNTA EUGENIA TO ENSENADA')).toBe('Punta Eugenia to Ensenada');
    expect(formatAdvisoryLocal('800 AM PDT Tue Oct 06 2026')).toBe('Oct 6, 8:00 AM PDT');
    expect(formatAdvisoryLocal('1100 PM AST Mon Sep 07 2026')).toBe('Sep 7, 11:00 PM AST');
  });
});

describe('fetchNhcTextProducts', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearCache?.(); });

  it('keeps only products issued for this storm', async () => {
    const texts = { TCP: fixture('TCP'), TCD: fixture('TCD'), TCM: 'WTPZ23 KNHC\nTCMEP3\nEP172026 OTHER STORM', PWS: fixture('PWS') };
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const type = url.match(/types\/(\w+)\//)[1];
      return { ok: true, json: async () => ({ productText: texts[type] }) };
    }));
    const result = await fetchNhcTextProducts({ slot: 'EP3', atcfId: 'EP182026' });
    expect(fetch).toHaveBeenCalledWith('/api/wx/products/types/TCP/locations/EP3/latest', {});
    expect(result.tcp.place).toMatch(/^640 mi/);
    expect(result.tcd).not.toBeNull();
    expect(result.tcm).toBeNull();
    expect(result.pws.length).toBeGreaterThan(0);
  });
});
