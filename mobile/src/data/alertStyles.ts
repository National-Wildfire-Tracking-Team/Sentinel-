/**
 * NWS alert polygon styling, following WeatherWise's defaults (web.weatherwise.app): one colour per
 * VTEC phenomenon.significance code, outlines 2.5 px for warnings and Special Weather Statements and
 * 1 px for everything else, a 40% fill, and a white halo 4 px wider under warning outlines. Outlooks
 * (.O) and short-term forecasts (.F) are off, as in WeatherWise. Lower `priority` is more important.
 */
export interface AlertStyle {
  name: string;
  color: string;
  priority: number;
}

export const ALERT_STYLES: Record<string, AlertStyle> = {
  'TS.W': { name: "Tsunami Warning", color: '#FD6347', priority: 1 },
  'TO.W': { name: "Tornado Warning", color: '#FF0000', priority: 2 },
  'EW.W': { name: "Extreme Wind Warning", color: '#FF8C00', priority: 3 },
  'SV.W': { name: "Severe Thunderstorm Warning", color: '#FFA500', priority: 4 },
  'FF.W': { name: "Flash Flood Warning", color: '#79FF26', priority: 5 },
  'SH.W': { name: "Shelter In Place Warning", color: '#FA8072', priority: 8 },
  'EV.W': { name: "Evacuation Immediate", color: '#7FFF00', priority: 9 },
  'CD.W': { name: "Civil Danger Warning", color: '#FFB6C1', priority: 10 },
  'FI.W': { name: "Fire Warning", color: '#A0522D', priority: 14 },
  'CE.W': { name: "Civil Emergency Message", color: '#FFB6C1', priority: 15 },
  'LF.W': { name: "Law Enforcement Warning", color: '#C0C0C0', priority: 16 },
  'SS.W': { name: "Storm Surge Warning", color: '#B524F7', priority: 17 },
  'HF.W': { name: "Hurricane Force Wind Warning", color: '#CD5C5C', priority: 18 },
  'HU.W': { name: "Hurricane Warning", color: '#DC143C', priority: 19 },
  'TY.W': { name: "Typhoon Warning", color: '#DC143C', priority: 20 },
  'MA.W': { name: "Special Marine Warning", color: '#731E56', priority: 21 },
  'BZ.W': { name: "Blizzard Warning", color: '#FF4500', priority: 22 },
  'SQ.W': { name: "Snow Squall Warning", color: '#C71585', priority: 23 },
  'IS.W': { name: "Ice Storm Warning", color: '#8B008B', priority: 24 },
  'UP.W': { name: "Heavy Freezing Spray Warning", color: '#00BFFF', priority: 25 },
  'WS.W': { name: "Winter Storm Warning", color: '#FF69B4', priority: 26 },
  'LE.W': { name: "Lake Effect Snow Warning", color: '#008B8B', priority: 27 },
  'DS.W': { name: "Dust Storm Warning", color: '#FFE4C4', priority: 28 },
  'DU.W': { name: "Blowing Dust Warning", color: '#FFE4C4', priority: 29 },
  'HW.W': { name: "High Wind Warning", color: '#DAA520', priority: 30 },
  'TR.W': { name: "Tropical Storm Warning", color: '#B22222', priority: 31 },
  'SR.W': { name: "Storm Warning", color: '#9400D3', priority: 32 },
  'TS.Y': { name: "Tsunami Advisory", color: '#D2691E', priority: 33 },
  'TS.A': { name: "Tsunami Watch", color: '#FF00FF', priority: 34 },
  'AV.W': { name: "Avalanche Warning", color: '#1E90FF', priority: 35 },
  'FL.W': { name: "Flood (forecast point) Warning", color: '#00FF00', priority: 39 },
  'FA.W': { name: "Flood Warning", color: '#00FF00', priority: 39 },
  'CF.W': { name: "Coastal Flood Warning", color: '#228B22', priority: 40 },
  'LS.W': { name: "Lakeshore Flood Warning", color: '#228B22', priority: 41 },
  'SU.W': { name: "High Surf Warning", color: '#228B22', priority: 43 },
  'XH.W': { name: "Extreme Heat Warning", color: '#C71585', priority: 44 },
  'TO.A': { name: "Tornado Watch", color: '#FFFF00', priority: 45 },
  'SV.A': { name: "Severe Thunderstorm Watch", color: '#DB7093', priority: 46 },
  'FF.A': { name: "Flash Flood Watch", color: '#2E8B57', priority: 47 },
  'GL.W': { name: "Gale Warning", color: '#DDA0DD', priority: 48 },
  'EC.W': { name: "Extreme Cold Warning", color: '#0000FF', priority: 50 },
  'FZ.W': { name: "Freeze Warning", color: '#483D8B', priority: 51 },
  'FW.W': { name: "Red Flag Warning", color: '#FF1493', priority: 52 },
  'SS.A': { name: "Storm Surge Watch", color: '#DB7FF7', priority: 53 },
  'HU.A': { name: "Hurricane Watch", color: '#FF00FF', priority: 54 },
  'HF.A': { name: "Hurricane Force Wind Watch", color: '#9932CC', priority: 55 },
  'TY.A': { name: "Typhoon Watch", color: '#FF00FF', priority: 56 },
  'TR.A': { name: "Tropical Storm Watch", color: '#F08080', priority: 57 },
  'SR.A': { name: "Storm Watch", color: '#FFE4B5', priority: 58 },
  'WW.Y': { name: "Winter Weather Advisory", color: '#7B68EE', priority: 60 },
  'CW.Y': { name: "Cold Weather Advisory", color: '#AFEEEE', priority: 62 },
  'HT.Y': { name: "Heat Advisory", color: '#FF7F50', priority: 63 },
  'FL.Y': { name: "Flood (forecast point) Advisory", color: '#00FF7F', priority: 64 },
  'FA.Y': { name: "Flood Advisory", color: '#00FF7F', priority: 64 },
  'CF.Y': { name: "Coastal Flood Advisory", color: '#7CFC00', priority: 65 },
  'LS.Y': { name: "Lakeshore Flood Advisory", color: '#7CFC00', priority: 66 },
  'SU.Y': { name: "High Surf Advisory", color: '#BA55D3', priority: 67 },
  'FG.Y': { name: "Dense Fog Advisory", color: '#708090', priority: 68 },
  'MF.Y': { name: "Dense Fog (marine) Advisory", color: '#708090', priority: 68 },
  'SM.Y': { name: "Dense Smoke Advisory", color: '#F0E68C', priority: 69 },
  'SC.Y': { name: "Small Craft Advisory", color: '#D8BFD8', priority: 70 },
  'BW.Y': { name: "Brisk Wind Advisory", color: '#D8BFD8', priority: 71 },
  'SE.W': { name: "Hazardous Seas Warning", color: '#D8BFD8', priority: 72 },
  'DS.Y': { name: "Dust Advisory", color: '#BDB76B', priority: 73 },
  'DU.Y': { name: "Blowing Dust Advisory", color: '#BDB76B', priority: 74 },
  'LW.Y': { name: "Lake Wind Advisory", color: '#D2B48C', priority: 75 },
  'WI.Y': { name: "Wind Advisory", color: '#D2B48C', priority: 76 },
  'FR.Y': { name: "Frost Advisory", color: '#6495ED', priority: 77 },
  'ZF.Y': { name: "Freezing Fog Advisory", color: '#008080', priority: 78 },
  'UP.Y': { name: "Freezing Spray Advisory", color: '#00BFFF', priority: 79 },
  'LO.Y': { name: "Low Water Advisory", color: '#A52A2A', priority: 80 },
  'LA.W': { name: "Local Area Emergency", color: '#C0C0C0', priority: 80 },
  'WS.A': { name: "Winter Storm Watch", color: '#4682B4', priority: 82 },
  'RP.S': { name: "Rip Current Statement", color: '#40E0D0', priority: 83 },
  'BH.S': { name: "Beach Hazards Statement", color: '#40E0D0', priority: 84 },
  'GL.A': { name: "Gale Watch", color: '#FFC0CB', priority: 85 },
  'AV.A': { name: "Avalanche Watch", color: '#F4A460', priority: 86 },
  'SE.A': { name: "Hazardous Seas Watch", color: '#483D8B', priority: 87 },
  'UP.A': { name: "Heavy Freezing Spray Watch", color: '#BC8F8F', priority: 88 },
  'FL.A': { name: "Flood (forecast point) Watch", color: '#2E8B57', priority: 89 },
  'FA.A': { name: "Flood Watch", color: '#2E8B57', priority: 89 },
  'CF.A': { name: "Coastal Flood Watch", color: '#66CDAA', priority: 90 },
  'LS.A': { name: "Lakeshore Flood Watch", color: '#66CDAA', priority: 91 },
  'HW.A': { name: "High Wind Watch", color: '#B8860B', priority: 92 },
  'XH.A': { name: "Extreme Heat Watch", color: '#800000', priority: 93 },
  'EC.A': { name: "Extreme Cold Watch", color: '#5F9EA0', priority: 94 },
  'FZ.A': { name: "Freeze Watch", color: '#00FFFF', priority: 95 },
  'FW.A': { name: "Fire Weather Watch", color: '#FFDEAD', priority: 96 },
  'CF.S': { name: "Coastal Flood Statement", color: '#6B8E23', priority: 99 },
  'TP.S': { name: "911 Telephone Outage", color: '#C0C0C0', priority: 99 },
  'SP.S': { name: "Special Weather Statement", color: '#00FFFF', priority: 101 },
  'MA.S': { name: "Marine Weather Statement", color: '#FFDAB9', priority: 102 },
  'AQ.S': { name: "Air Quality Alert", color: '#808080', priority: 103 },
  'AS.Y': { name: "Air Stagnation Advisory", color: '#808080', priority: 104 },
  'HZ.O': { name: "Hazardous Weather Outlook", color: '#EEE8AA', priority: 105 },
  'HY.O': { name: "Hydrologic Outlook", color: '#90EE90', priority: 106 },
  'ST.F': { name: "Short Term Forecast", color: '#98FB98', priority: 107 },
};

const BY_NAME = new Map<string, string>();
for (const [code, s] of Object.entries(ALERT_STYLES)) {
  if (!BY_NAME.has(s.name)) BY_NAME.set(s.name, code);
}
// The same products under the names api.weather.gov and the MapServer use.
BY_NAME.set('Flood Warning', 'FA.W');
BY_NAME.set('Flood Advisory', 'FA.Y');
BY_NAME.set('Flood Watch', 'FA.A');

/** VTEC code for an alert, from its phenomenon/significance or (for non-VTEC products) its name. */
export function alertCode(phenom: string | null | undefined, sig: string | null | undefined, name?: string | null): string | null {
  const p = (phenom ?? '').trim();
  const s = (sig ?? '').trim();
  if (p && s && ALERT_STYLES[`${p}.${s}`]) return `${p}.${s}`;
  return name ? (BY_NAME.get(name.trim()) ?? null) : null;
}

/** Outlines: 2.5 px for warnings and Special Weather Statements, 1 px otherwise. */
export function alertLineWidth(code: string): number {
  return code.endsWith('.W') || code === 'SP.S' ? 2.5 : 1;
}

/** Outlooks and short-term forecasts are off by default, as in WeatherWise. */
export function alertShownByDefault(code: string): boolean {
  return !code.endsWith('.O') && !code.endsWith('.F');
}

/** The colour for an alert by its event name, or null if WeatherWise has none for it. */
export function alertColorByName(name: string): string | null {
  const code = BY_NAME.get(name.trim());
  return code ? ALERT_STYLES[code].color : null;
}
