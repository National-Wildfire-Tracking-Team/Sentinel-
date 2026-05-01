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
  'Dense Fog Advisory':                    '#708090',
  'Dense Fog (marine) Advisory':           '#708090',
  'Freezing Fog Advisory':                 '#6699CC',
  'Dense Smoke Advisory':                  '#EFE394',
  'Dust Advisory':                         '#BCB671',
  'Heat Advisory':                         '#E88656',
  'Frost Advisory':                        '#6699CD',
  'Freeze Advisory':                       '#6699CD',
  'Wind Chill Advisory':                   '#AFEEEE',
  'Winter Weather Advisory':               '#7B68EE',
  'Freezing Rain Advisory':                '#DA70D6',
  'Freezing Drizzle Advisory':             '#DA70D6',
  'Snow Advisory':                         '#A4D3EE',
  'Blowing Snow Advisory':                 '#A4D3EE',
  'Lake Effect Snow Advisory':             '#48D1CC',
  'Wind Advisory':                         '#D2691E',
  'Brisk Wind Advisory':                   '#D2691E',
  'Lake Wind Advisory':                    '#D2691E',
  'Small Craft Advisory':                  '#D2691E',
  'Small Craft Advisory for Hazardous Seas': '#D2691E',
  'Small Craft Advisory for Rough Bar':    '#D2691E',
  'Small Craft Advisory for Winds':        '#D2691E',
  'High Surf Advisory':                    '#BA55D3',
  'Rip Current Statement':                 '#40E0D0',
  'Beach Hazards Statement':               '#40E0D0',
  'Coastal Flood Advisory':                '#7CFC00',
  'Lakeshore Flood Advisory':              '#7CFC00',
  'Urban and Small Stream Flood Advisory': '#00FF7F',
  'Small Stream Flood Advisory':           '#00FF7F',
  'Hydrological Advisory':                 '#00FF7F',
  'Air Quality Alert':                     '#808080',
  'Low Water Advisory':                    '#A52A2A',
  'Ashfall Advisory':                      '#696969',
  'Avalanche Advisory':                    '#CD853F',
};

// ─── FEMA IPAWS / EAS-specific alert types ───────────────────────────────────
// These are issued through the Emergency Alert System and may arrive via the
// FEMA IPAWS feed without a matching NWS event type.
const FEMA_EAS = {
  'Emergency Alert System':             '#CC2936',
  'Presidential Alert':                 '#CC2936',
  'Emergency Action Notification':      '#CC2936',
  'Emergency Action Termination':       '#708090',
  'National Periodic Test':             '#708090',
  'Required Monthly Test':              '#708090',
  'Required Weekly Test':               '#708090',
  'AMBER Alert':                        '#FF6600',
  'Child Abduction Emergency':          '#FF6600',
  'Wireless Emergency Alert':           '#E88656',
  'Extreme Wind Warning':               '#EB8E3B',
  'Shelter in Place Warning':           '#E27D6E',
  'Hazardous Materials Warning':        '#7B68EE',
  'Nuclear Power Plant Warning':        '#CC2936',
  'Radiological Hazard Warning':        '#CC2936',
  'Volcano Warning':                    '#CC2936',
  'Earthquake Warning':                 '#C0C0C0',
  '911 Telephone Outage Emergency':     '#C0C0C0',
  'Administrative Message':             '#708090',
  'National Information Center':        '#708090',
};

// ─── Statements ──────────────────────────────────────────────────────────────
const STATEMENTS = {
  'Special Weather Statement':     '#6EFAF7',
  'Marine Weather Statement':      '#F7D8B9',
  'Hydrological Statement':        '#00FF7F',
  'Flood (forecast point) Statement': '#6FEA47',
  'Short Term Forecast':           '#98FB98',
  'Hazardous Weather Outlook':     '#EFE0A3',
  'Air Stagnation Advisory':       '#808080',
  '911 Telephone Outage':          '#C0C0C0',
};

/** Full event → hex-color lookup. */
export const NWS_ALERT_COLORS = {
  ...WARNINGS,
  ...WATCHES,
  ...ADVISORIES,
  ...STATEMENTS,
  ...FEMA_EAS,
};

/** Classification of an alert event. */
export function nwsAlertCategory(event) {
  if (WARNINGS[event])   return 'warning';
  if (WATCHES[event])    return 'watch';
  if (ADVISORIES[event]) return 'advisory';
  if (STATEMENTS[event]) return 'statement';
  if (FEMA_EAS[event])   return 'eas';
  return 'other';
}

/** Default fallback when an event isn't in the palette. */
export const DEFAULT_NWS_COLOR = '#3b82f6';

/** Lookup with fallback. */
export function nwsAlertColor(event) {
  return NWS_ALERT_COLORS[event] || DEFAULT_NWS_COLOR;
}

/**
 * Per-event map styling for WWA polygons (fill/stroke opacity and line width).
 * Keys match the `event` / feature `type` string from NOAA alerts.
 */
const NWS_WWA_DEFAULT_STYLE = {
  color: '#808080',
  fill: 0.15,
  stroke: 0.6,
  width: 1.2,
};

export const NWS_WWA_STYLES = {
  /* PRIORITY 1 */
  'Tornado Warning': { color: '#FF0000', fill: 0.5, stroke: 1.0, width: 2.5 },
  'Tsunami Warning': { color: '#FD6347', fill: 0.5, stroke: 1.0, width: 2.5 },

  /* SEVERE WARNINGS */
  'Extreme Wind Warning': { color: '#FF8C00', fill: 0.42, stroke: 0.95, width: 2.2 },
  'Severe Thunderstorm Warning': { color: '#FFA500', fill: 0.36, stroke: 0.9, width: 2.0 },
  'Flash Flood Warning': { color: '#8B0000', fill: 0.38, stroke: 0.95, width: 2.2 },
  'Hurricane Warning': { color: '#DC143C', fill: 0.4, stroke: 0.95, width: 2.2 },
  'Typhoon Warning': { color: '#DC143C', fill: 0.4, stroke: 0.95, width: 2.2 },

  'Special Marine Warning': { color: '#FFA500', fill: 0.34, stroke: 0.9, width: 2.0 },
  'Blizzard Warning': { color: '#FF4500', fill: 0.34, stroke: 0.9, width: 2.0 },
  'Ice Storm Warning': { color: '#8B008B', fill: 0.34, stroke: 0.9, width: 2.0 },
  'Snow Squall Warning': { color: '#C71585', fill: 0.32, stroke: 0.9, width: 2.0 },
  'High Wind Warning': { color: '#DAA520', fill: 0.32, stroke: 0.85, width: 1.8 },
  'Fire Warning': { color: '#A0522D', fill: 0.32, stroke: 0.85, width: 1.8 },

  /* FLOOD / WATER */
  'Flood Warning': { color: '#00FF00', fill: 0.32, stroke: 0.85, width: 1.8 },
  'Coastal Flood Warning': { color: '#228B22', fill: 0.32, stroke: 0.85, width: 1.8 },
  'Lakeshore Flood Warning': { color: '#228B22', fill: 0.32, stroke: 0.85, width: 1.8 },
  'Storm Surge Warning': { color: '#B524F7', fill: 0.36, stroke: 0.9, width: 2.0 },

  /* WATCHES */
  'Tornado Watch': { color: '#FFFF00', fill: 0.18, stroke: 0.7, width: 1.5 },
  'Severe Thunderstorm Watch': { color: '#DB7093', fill: 0.18, stroke: 0.7, width: 1.5 },
  'Flash Flood Watch': { color: '#2E8B57', fill: 0.18, stroke: 0.7, width: 1.5 },

  /* SPECIAL / STATEMENTS */
  'Severe Weather Statement': { color: '#00FFFF', fill: 0.14, stroke: 0.6, width: 1.2 },

  default: NWS_WWA_DEFAULT_STYLE,
};

/**
 * Returns fill color, opacities, and line width for a WWA event type.
 */
export function getNWSWWAStyle(event) {
  if (event == null || event === '') return NWS_WWA_STYLES.default;
  return NWS_WWA_STYLES[event] || NWS_WWA_STYLES.default;
}

function nwsWwaStyleMatchPairs(prop) {
  return Object.entries(NWS_WWA_STYLES)
    .filter(([key]) => key !== 'default')
    .flatMap(([key, style]) => [key, style[prop]]);
}

/**
 * Mapbox `match` on feature property `type` for WWA-aware paint props.
 */
export function nwsWwaStyleMatchExpression(prop) {
  const fallback =
    prop === 'color' ? NWS_WWA_DEFAULT_STYLE.color : NWS_WWA_DEFAULT_STYLE[prop];
  return ['match', ['get', 'type'], ...nwsWwaStyleMatchPairs(prop), fallback];
}

/**
 * Feature `type` → color: WWA overrides first, then the full NWS palette.
 */
export function nwsWwaAwareColorMatchExpression() {
  const wwaColorPairs = Object.entries(NWS_WWA_STYLES)
    .filter(([key]) => key !== 'default')
    .flatMap(([key, style]) => [key, style.color]);
  return ['match', ['get', 'type'], ...wwaColorPairs, nwsColorMatchExpression()];
}

/**
 * Builds a Mapbox GL `match` expression that maps the feature's `type`
 * property to its official NWS color. Use as fill-color / line-color.
 */
export function nwsColorMatchExpression() {
  const pairs = Object.entries(NWS_ALERT_COLORS).flat();
  return ['match', ['get', 'type'], ...pairs, DEFAULT_NWS_COLOR];
}
