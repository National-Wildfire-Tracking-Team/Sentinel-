/**
 * tfr.test.js
 * FAA TFR parsing (src/app/api/tfr.js): NOTAM ids, altitudes, times, and the
 * XNOTAM detail file, trimmed from a real one (FDC 6/9169).
 */

import { describe, expect, it } from 'vitest';
import {
  formatTfrAltitude, formatTfrTime, notamIdFromKey, parseTfrDetail, tfrTypeStyle,
} from '../../src/app/api/tfr';

const XML = `\uFEFF<XNOTAM-Update version="0.1">
  <Group><Add><Not>
    <NotUid>
      <txtNameAcctFac>FDC</txtNameAcctFac>
      <dateIssued>2026-10-13T15:37:31</dateIssued>
      <txtLocalName>261015-25 NC State Fair DHS - UAS Only</txtLocalName>
    </NotUid>
    <dateEffective>2026-10-15T13:00:00</dateEffective>
    <dateExpire>2026-10-26T03:30:00</dateExpire>
    <codeTimeZone>EDT</codeTimeZone>
    <codeExpirationTimeZone>EDT</codeExpirationTimeZone>
    <AffLocGroup><txtNameCity>RALEIGH</txtNameCity><txtNameUSState>NORTH CAROLINA</txtNameUSState></AffLocGroup>
    <codeFacility>ZDC</codeFacility>
    <TfrNot>
      <codeType>99.7</codeType>
      <TFRAreaGroup>
        <aseTFRArea>
          <AseUid><codeType>RAS</codeType></AseUid>
          <txtName>Area A</txtName>
          <codeDistVerUpper>HEI</codeDistVerUpper><valDistVerUpper>400</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
          <codeDistVerLower>HEI</codeDistVerLower><valDistVerLower>0</valDistVerLower><uomDistVerLower>FT</uomDistVerLower>
          <ScheduleGroup><dateEffective>2026-10-15T13:00:00</dateEffective></ScheduleGroup>
        </aseTFRArea>
      </TFRAreaGroup>
    </TfrNot>
    <txtDescrTraditional>!FDC 6/9169 ZDC NC..AIRSPACE RALEIGH, NC..TEMPORARY FLIGHT RESTRICTIONS.</txtDescrTraditional>
  </Not></Add></Group>
</XNOTAM-Update>`;

describe('FAA TFR', () => {
  it('takes the NOTAM number from the WFS key', () => {
    expect(notamIdFromKey('6/9169-1-FDC-F')).toBe('6/9169');
  });

  it('formats altitudes by reference', () => {
    expect(formatTfrAltitude('0', 'FT', 'HEI')).toBe('Surface');
    expect(formatTfrAltitude('400', 'FT', 'HEI')).toBe('400 ft AGL');
    expect(formatTfrAltitude('17999', 'FT', 'ALT')).toBe('17,999 ft MSL');
    expect(formatTfrAltitude('180', 'FL', 'STD')).toBe('FL180');
  });

  it('keeps the FAA time zone', () => {
    expect(formatTfrTime('2026-10-15T13:00:00', 'EDT')).toBe('Oct 15, 2026 13:00 EDT');
  });

  it('parses the XNOTAM detail file', () => {
    const d = parseTfrDetail(XML);
    expect(d.effective).toBe('Oct 15, 2026 13:00 EDT');
    expect(d.expire).toBe('Oct 26, 2026 03:30 EDT');
    expect(d.regulation).toBe('99.7');
    expect(d.facility).toBe('ZDC');
    expect(d.city).toBe('RALEIGH');
    expect(d.areas).toEqual([{ name: 'Area A', lower: 'Surface', upper: '400 ft AGL' }]);
    expect(d.text).toMatch(/^!FDC 6\/9169/);
  });

  it('draws every type in red and names unknown ones as sent', () => {
    expect(tfrTypeStyle('HAZARDS').color).toBe('#ef4444');
    expect(tfrTypeStyle('NEW KIND').color).toBe('#ef4444');
    expect(tfrTypeStyle('NEW KIND').label).toBe('NEW KIND');
  });
});
