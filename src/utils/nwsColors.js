/**
 * nwsColors.js
 * Official NWS weather alert color palette.
 * Keys match the `event` field returned by the NOAA /alerts/active API.
 * Reference: https://www.weather.gov/help-map (color legend)
 */

// ─── Warnings ────────────────────────────────────────────────────────────────
const WARNINGS = {
  'Tornado Warning':                '#E43831',
  'Severe Thunderstorm Warning':    '#F3A93C',
  'Flash Flood Warning':            '#9DF55A',
  'Special Marine Warning':         '#6B2A56',
  'Blizzard Warning':               '#EB5C2B',
  'Snow Squall Warning':            '#BE2A81',
  'Ice Storm Warning':              '#7E1A8B',
  'Winter Storm Warning':           '#EE6EAB',
  'Lake Effect Snow Warning':       '#358385',
  'Avalanche Warning':              '#458BF3',
  'Extreme Cold Warning':           '#0400F0',
  'Freeze Warning':                 '#463D85',
  'Tsunami Warning':                '#E26D53',
  'Flood (forecast point) Warning': '#6FEA47',
  'Flood Warning':                  '#6FEA47',
  'Coastal Flood Warning':          '#4A8B3C',
  'Lakeshore Flood Warning':        '#4A8B3C',
  'High Surf Warning':              '#4A8B3C',
  'Extreme Wind Warning':           '#EB8E3B',
  'Hurricane Force Wind Warning':   '#BA655D',
  'Dust Storm Warning':             '#F5E0B6',
  'Blowing Dust Warning':           '#F5E0B6',
  'High Wind Warning':              '#CCA243',
  'Fire Warning':                   '#9E5936',
  'Extreme Heat Warning':           '#BE2B82',
  'Red Flag Warning':               '#ED368D',
  'Storm Surge Warning':            '#A134E8',
  'Hurricane Warning':              '#CC2936',
  'Typhoon Warning':                '#CC2936',
  'Tropical Storm Warning':         '#A43128',
  'Heavy Freezing Spray Warning':   '#4DB8F5',
  'Storm Warning':                  '#8E23CA',
  'Gale Warning':                   '#DCA5D7',
  'Hazardous Seas Warning':         '#D6C1D6',
  'Shelter In Place Warning':       '#E27D6E',
  'Evacuation Immediate':           '#A2F543',
  'Civil Danger Warning':           '#F3B9C2',
  'Civil Emergency Message':        '#F3B9C2',
  'Law Enforcement Warning':        '#C0C0C0',
  'Local Area Emergency':           '#C0C0C0',
};

// ─── Watches (rendered with a hatched pattern on the official NWS map) ───────
const WATCHES = {
  'Tornado Watch':                  '#FDF24D',
  'Severe Thunderstorm Watch':      '#C67688',
  'Flash Flood Watch':              '#458A59',
  'Winter Storm Watch':             '#557CA8',
  'Avalanche Watch':                '#E4AC71',
  'Extreme Cold Watch':             '#6CA1A0',
  'Freeze Watch':                   '#78F4F5',
  'Tsunami Watch':                  '#F02EF0',
  'Flood (forecast point) Watch':   '#4D8F5D',
  'Flood Watch':                    '#4D8F5D',
  'Coastal Flood Watch':            '#7DCDAD',
  'Lakeshore Flood Watch':          '#7DCDAD',
  'Hurricane Force Wind Watch':     '#8940CA',
  'High Wind Watch':                '#A98036',
  'Extreme Heat Watch':             '#7F1A13',
  'Fire Weather Watch':             '#F8DCB1',
  'Storm Surge Watch':              '#CD8CE9',
  'Hurricane Watch':                '#F42FF4',
  'Typhoon Watch':                  '#F42FF4',
  'Tropical Storm Watch':           '#DD8A7D',
  'Storm Watch':                    '#F7E2B4',
  'Gale Watch':                     '#F3BFC6',
  'Hazardous Seas Watch':           '#423A84',
  'Heavy Freezing Spray Watch':     '#B6938B',
};

// ─── Advisories ──────────────────────────────────────────────────────────────
const ADVISORIES = {
  'Dense Fog Advisory':          '#748494',
  'Dense Fog (marine) Advisory': '#748494',
  'Dense Smoke Advisory':        '#EFE394',
  'Dust Advisory':               '#BCB671',
  'Heat Advisory':               '#E88656',
};

// ─── Statements ──────────────────────────────────────────────────────────────
const STATEMENTS = {
  'Special Weather Statement': '#6EFAF7',
  'Marine Weather Statement':  '#F7D8B9',
  '911 Telephone Outage':      '#C0C0C0',
};

// ─── Outlooks ────────────────────────────────────────────────────────────────
const OUTLOOKS = {
  'Hazardous Weather Outlook': '#EFE0A3',
};

/** Full event → hex-color lookup. */
export const NWS_ALERT_COLORS = {
  ...WARNINGS,
  ...WATCHES,
  ...ADVISORIES,
  ...STATEMENTS,
  ...OUTLOOKS,
};

/** Classification of an alert event. */
export function nwsAlertCategory(event) {
  if (WARNINGS[event])   return 'warning';
  if (WATCHES[event])    return 'watch';
  if (ADVISORIES[event]) return 'advisory';
  if (STATEMENTS[event]) return 'statement';
  if (OUTLOOKS[event])   return 'outlook';
  return 'other';
}

/** Default fallback when an event isn't in the palette. */
export const DEFAULT_NWS_COLOR = '#3b82f6';

/** Lookup with fallback. */
export function nwsAlertColor(event) {
  return NWS_ALERT_COLORS[event] || DEFAULT_NWS_COLOR;
}

/**
 * Builds a Mapbox GL `match` expression that maps the feature's `type`
 * property to its official NWS color. Use as fill-color / line-color.
 */
export function nwsColorMatchExpression() {
  const pairs = Object.entries(NWS_ALERT_COLORS).flat();
  return ['match', ['get', 'type'], ...pairs, DEFAULT_NWS_COLOR];
}
