import { stationPaint, type StationField } from '@/data/fireDanger';

/**
 * Map styles for the GeoJSON layers, copied from the web's layer components (paint values, zoom
 * ramps, filters and minzooms). Each entry lists the style layers for one catalog key, bottom to
 * top; `hit` names the layers whose taps open the feature's detail.
 */
type Expr = any;

export interface StyleLayerSpec {
  id: string;
  type: 'circle' | 'symbol' | 'fill' | 'line';
  style: Record<string, Expr>;
  filter?: Expr;
  minZoom?: number;
  hit?: boolean;
}

const BOLD = ['DIN Pro Bold', 'Arial Unicode MS Bold'];
const MEDIUM = ['DIN Pro Medium', 'Arial Unicode MS Regular'];
const zoomRamp = (...stops: number[]): Expr => ['interpolate', ['linear'], ['zoom'], ...stops];
const HALO = { textColor: '#ffffff', textHaloColor: 'rgba(0,0,0,0.85)', textHaloWidth: 1.5 };

const AQI_COLOR: Expr = [
  'step', ['coalesce', ['get', 'aqi'], 0],
  '#00e400', 51, '#ffff00', 101, '#ff7e00', 151, '#ff0000', 201, '#8f3f97', 301, '#7e0023',
];

export const FLOOD_COLORS: Record<string, string> = {
  major: '#cc33ff',
  moderate: '#ff0000',
  minor: '#ff8c00',
  action: '#ffff00',
  no_flooding: '#1e90ff',
};
const FLOOD_COLOR: Expr = ['match', ['get', 'floodCategory'], 'major', '#cc33ff', 'moderate', '#ff0000', 'minor', '#ff8c00', 'action', '#ffff00', '#1e90ff'];

export const AWC_HZ_COLORS: Record<string, string> = {
  CONV: '#ef4444',
  TURB: '#f59e0b',
  TURB_HI: '#f59e0b',
  TURB_LO: '#fbbf24',
  MTW: '#fb923c',
  ICE: '#38bdf8',
  FZLVL: '#60a5fa',
  M_FZLVL: '#93c5fd',
  IFR: '#a855f7',
  MT_OBSC: '#c084fc',
  LLWS: '#14b8a6',
  SFC_WND: '#84cc16',
  PCPN: '#22d3ee',
  VA: '#a1a1aa',
  TC: '#ec4899',
  DS: '#ca8a04',
  SS: '#ca8a04',
  UNK: '#e5e7eb',
};
const AWC_HZ_COLOR: Expr = ['match', ['get', 'hz'], ...Object.entries(AWC_HZ_COLORS).flat(), '#e5e7eb'];

export const FLIGHT_CATEGORY_COLORS: Record<string, string> = {
  VFR: '#22c55e',
  MVFR: '#3b82f6',
  IFR: '#ef4444',
  LIFR: '#d946ef',
  UNK: '#9ca3af',
};

export const LAND_OWNER_COLORS: Record<string, string> = {
  Federal: '#2563eb',
  State: '#16a34a',
  Tribal: '#a855f7',
  County: '#f59e0b',
  City: '#f97316',
  'Special District': '#06b6d4',
  'Non Profit': '#84cc16',
};
const LAND_OWNER_COLOR: Expr = ['match', ['get', 'Own_Level'], ...Object.entries(LAND_OWNER_COLORS).flat(), '#94a3b8'];

const gaugeLayers = (suffix: 'priority' | 'other', filter: Expr, minZoom: number, labelZoom: number): StyleLayerSpec[] => [
  {
    id: `water-gauges-glow-${suffix}`,
    type: 'circle',
    filter,
    minZoom,
    style: { circleRadius: zoomRamp(0, 4, 5, 8, 10, 18), circleColor: FLOOD_COLOR, circleOpacity: 0.18, circleBlur: 0.7 },
  },
  {
    id: `water-gauges-circle-${suffix}`,
    type: 'circle',
    filter,
    minZoom,
    hit: true,
    style: {
      circleRadius: zoomRamp(0, 2, 5, 3, 8, 5, 12, 8),
      circleColor: FLOOD_COLOR,
      circleOpacity: 0.95,
      circleStrokeColor: '#ffffff',
      circleStrokeWidth: 1.5,
    },
  },
  {
    id: `water-gauges-label-${suffix}`,
    type: 'symbol',
    filter,
    minZoom: labelZoom,
    style: {
      textField: ['case', ['!=', ['get', 'currentStage'], null], ['concat', ['to-string', ['round', ['get', 'currentStage']]], ' ft'], ''],
      textFont: BOLD,
      textSize: 10,
      textAnchor: 'top',
      textOffset: [0, 0.8],
      textOptional: true,
      textColor: '#ffffff',
      textHaloColor: 'rgba(0,0,0,0.7)',
      textHaloWidth: 1.5,
    },
  },
];

const IS_ABOVE_ACTION: Expr = ['==', ['get', 'forecastAboveAction'], true];

const SMOKE_FILL: Expr = [
  'match', ['get', 'smoke_classdesc'],
  '0 - 3', '#ffffa3', '3 - 25', '#fad157', '25 - 63', '#f2a62c', '63 - 158', '#ab5213', '158 - 1000', '#690000',
  '#94a3b8',
];
const SMOKE_LINE: Expr = [
  'match', ['get', 'smoke_classdesc'],
  '0 - 3', '#b8b870', '3 - 25', '#a68530', '25 - 63', '#a66f1a', '63 - 158', '#6b3410', '158 - 1000', '#3d0000',
  '#64748b',
];

const ALERT_LINE_WIDTH: Expr = ['get', 'lineWidth'];
const ALERT_HALO = 4;

/**
 * NWS alert polygons in WeatherWise's style (colour, thickness and fill set per type in Alert
 * settings): a 40% fill in the alert's colour, a round-capped
 * outline from half width at zoom 5 to full width at zoom 12, and a white halo 4 px wider under
 * the thicker (warning) outlines. `onlyCodes` limits which alerts show (Red Flag on Wildfire).
 * Taps fall through to the map, which lists every alert at that point.
 */
export function alertPolygonStyles(onlyCodes: string[] | null): StyleLayerSpec[] {
  const filter: Expr = onlyCodes ? ['in', ['get', 'code'], ['literal', onlyCodes]] : undefined;
  const sortKey: Expr = ['get', 'sortKey'];
  return [
    { id: 'nws-alerts-fill', type: 'fill', filter, style: { fillColor: ['get', 'color'], fillOpacity: ['get', 'fillOpacity'], fillSortKey: sortKey } },
    {
      id: 'nws-alerts-halo',
      type: 'line',
      filter,
      style: {
        lineColor: '#FFFFFF',
        lineWidth: [
          'interpolate', ['linear'], ['zoom'],
          5, ['case', ['>', ALERT_LINE_WIDTH, 1], ['*', ['+', ALERT_LINE_WIDTH, ALERT_HALO], 0.5], 0],
          12, ['case', ['>', ALERT_LINE_WIDTH, 1], ['+', ALERT_LINE_WIDTH, ALERT_HALO], 0],
        ],
        lineCap: 'round',
        lineJoin: 'round',
        lineSortKey: sortKey,
      },
    },
    {
      id: 'nws-alerts-line',
      type: 'line',
      filter,
      style: {
        lineColor: ['get', 'color'],
        lineWidth: ['interpolate', ['linear'], ['zoom'], 5, ['*', ALERT_LINE_WIDTH, 0.5], 12, ALERT_LINE_WIDTH],
        lineCap: 'round',
        lineJoin: 'round',
        lineSortKey: sortKey,
      },
    },
  ];
}

/** NDGD smoke for one forecast hour (`todate`). */
export function smokeStyles(hour: number | null): StyleLayerSpec[] {
  const filter: Expr = ['==', ['get', 'todate'], hour ?? -1];
  return [
    { id: 'ndgd-smoke-forecast-fill', type: 'fill', hit: true, filter, style: { fillColor: SMOKE_FILL, fillOpacity: 0.42 } },
    {
      id: 'ndgd-smoke-forecast-line',
      type: 'line',
      filter,
      style: { lineColor: SMOKE_LINE, lineOpacity: 0.65, lineWidth: zoomRamp(3, 0.5, 7, 1, 10, 1.5) },
    },
  ];
}

/** NFDRS stations colored by one field (FireDangerStationsLayer). */
export function stationStyles(field: StationField): StyleLayerSpec[] {
  const paint = stationPaint(field);
  return [
    {
      id: 'fire-danger-stations-circle',
      type: 'circle',
      hit: true,
      style: {
        circleRadius: zoomRamp(3, 3, 7, 6, 11, 9),
        circleColor: paint.color,
        circleOpacity: 0.9,
        circleStrokeColor: ['case', paint.hasValue, '#18181b', '#a1a1aa'],
        circleStrokeWidth: ['case', paint.hasValue, 0.8, 1.4],
        circleStrokeOpacity: 0.9,
      },
    },
    {
      id: 'fire-danger-stations-label',
      type: 'symbol',
      minZoom: 7,
      filter: paint.hasValue,
      style: {
        textField: paint.label,
        textFont: MEDIUM,
        textSize: 11,
        textOffset: [0, 1.2],
        textAnchor: 'top',
        textOptional: true,
        textColor: '#ffffff',
        textHaloColor: '#18181b',
        textHaloWidth: 1.2,
      },
    },
  ];
}

export const FEATURE_STYLES: Record<string, StyleLayerSpec[]> = {
  // Reporter event reports (HazardEventsLayer.jsx): a pin per category, titled from zoom 7.
  hazardEvents: [
    {
      id: 'hazard-events-circle',
      type: 'symbol',
      hit: true,
      style: {
        iconImage: ['match', ['get', 'category'], 'wildfire', 'hazard-wildfire', 'hazmat', 'hazard-hazmat', 'flooding', 'hazard-flooding', 'hazard-hazard'],
        // The pin PNGs are 32 pt; the web draws its 64 px pin at 0.35–0.75.
        iconSize: zoomRamp(4, 0.7, 8, 1.1, 12, 1.5),
        iconAnchor: 'bottom',
        iconAllowOverlap: true,
        iconIgnorePlacement: true,
        textField: ['step', ['zoom'], '', 7, ['get', 'title']],
        textFont: ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        textSize: 11,
        textAnchor: 'top',
        textOffset: [0, 0.6],
        textMaxWidth: 10,
        textOptional: true,
        ...HALO,
      },
    },
  ],

  fireHotspots: [
    {
      id: 'fire-hotspots-circle',
      type: 'circle',
      hit: true,
      style: {
        circleRadius: zoomRamp(3, 2, 6, 4, 10, 7, 14, 12),
        circleColor: '#ff1a1a',
        circleOpacity: 0.85,
        circleStrokeColor: 'rgba(255,255,255,0.45)',
        circleStrokeWidth: 0.8,
      },
    },
  ],

  ngfsDetections: [
    { id: 'ngfs-detections-fill', type: 'fill', hit: true, style: { fillColor: '#ff8c00', fillOpacity: 0.06 } },
    { id: 'ngfs-detections-line', type: 'line', style: { lineColor: '#ff8c00', lineWidth: 2, lineOpacity: 0.95 } },
  ],

  calFireHistoricalPerimeters: [
    { id: 'calfire-historical-fill', type: 'fill', hit: true, style: { fillColor: '#92400e', fillOpacity: 0.14 } },
    { id: 'calfire-historical-casing', type: 'line', style: { lineColor: '#000000', lineWidth: 2.4, lineOpacity: 0.55 } },
    { id: 'calfire-historical-line', type: 'line', style: { lineColor: '#f59e0b', lineWidth: 1.4, lineDasharray: [2, 1.5] } },
    {
      id: 'calfire-historical-label',
      type: 'symbol',
      minZoom: 8,
      style: {
        textField: ['concat', ['get', 'FireName'], ' (', ['to-string', ['get', 'FireYear']], ')'],
        textFont: ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        textSize: 10,
        textAnchor: 'top',
        textOffset: [0, 1],
        textMaxWidth: 10,
        textOptional: true,
        textColor: '#fcd34d',
        textHaloColor: 'rgba(0,0,0,0.85)',
        textHaloWidth: 1.8,
      },
    },
  ],

  aqi: [
    {
      id: 'aqi-contours-fill',
      type: 'fill',
      hit: true,
      style: {
        fillColor: ['match', ['get', 'gridcode'], 1, '#00e400', 2, '#ffff00', 3, '#ff7e00', 4, '#ff0000', 5, '#8f3f97', 6, '#7e0023', '#94a3b8'],
        fillOpacity: ['interpolate', ['linear'], ['zoom'], 3, 0.45, 9, 0.3],
      },
    },
  ],

  fireRiskOutlook: [
    {
      id: 'fire-potential-fill',
      type: 'fill',
      hit: true,
      style: { fillColor: ['get', 'sfpColor'], fillOpacity: ['case', ['!=', ['get', 'sfpClass'], null], 0.55, 0.14] },
    },
    {
      id: 'fire-potential-line',
      type: 'line',
      filter: ['!=', ['get', 'sfpClass'], null],
      style: { lineColor: '#3f3f46', lineOpacity: 0.7, lineWidth: zoomRamp(3, 0.6, 7, 1.2, 10, 1.6) },
    },
    {
      id: 'fire-potential-line-unrated',
      type: 'line',
      filter: ['==', ['get', 'sfpClass'], null],
      style: { lineColor: '#a1a1aa', lineOpacity: 0.8, lineWidth: zoomRamp(3, 0.6, 7, 1.2, 10, 1.6), lineDasharray: [2, 2] },
    },
  ],

  lfmSamples: [
    {
      id: 'lfm-samples-circle',
      type: 'circle',
      hit: true,
      style: {
        circleRadius: zoomRamp(3, 4, 8, 7, 12, 9),
        circleColor: '#a855f7',
        circleOpacity: ['case', ['get', 'recent'], 0.95, 0.35],
        circleStrokeColor: '#ffffff',
        circleStrokeWidth: ['case', ['get', 'recent'], 1.5, 0.8],
      },
    },
  ],

  rawsStations: [
    {
      id: 'raws-glow',
      type: 'circle',
      minZoom: 9,
      style: { circleRadius: zoomRamp(9, 6, 12, 14, 15, 22), circleColor: '#a855f7', circleOpacity: 0.18, circleBlur: 0.6 },
    },
    {
      id: 'raws-stations-circle',
      type: 'circle',
      minZoom: 9,
      hit: true,
      style: {
        circleRadius: zoomRamp(9, 3, 12, 8, 14, 12, 17, 16),
        circleColor: '#a855f7',
        circleOpacity: 0.95,
        circleStrokeColor: '#ffffff',
        circleStrokeWidth: 2,
      },
    },
    {
      id: 'raws-wind-arrow',
      type: 'symbol',
      minZoom: 9,
      filter: ['!=', ['get', 'windDir'], null],
      style: {
        textField: '↑',
        textFont: BOLD,
        textSize: zoomRamp(9, 7, 12, 11, 14, 15),
        // The web rotates the arrow by the reported direction as-is.
        textRotate: ['coalesce', ['get', 'windDir'], 0],
        textRotationAlignment: 'map',
        textAllowOverlap: true,
        textIgnorePlacement: true,
        textColor: '#ffffff',
      },
    },
    {
      id: 'raws-label',
      type: 'symbol',
      minZoom: 9,
      style: {
        textField: [
          'format',
          ['concat', ['to-string', ['round', ['coalesce', ['get', 'windSpeed'], 0]]], ' mph'], { 'font-scale': 0.85 },
          '\n', {},
          ['concat', ['to-string', ['round', ['coalesce', ['get', 'relHumidity'], 0]]], '% RH'], { 'font-scale': 0.75 },
        ],
        textFont: MEDIUM,
        textSize: 11,
        textAnchor: 'top',
        textOffset: [0, 1.5],
        textOptional: true,
        ...HALO,
      },
    },
  ],

  airNowMonitors: [
    {
      id: 'airnow-monitors-glow',
      type: 'circle',
      style: {
        circleRadius: zoomRamp(4, 6, 8, 10, 12, 18),
        circleColor: AQI_COLOR,
        circleBlur: 0.7,
        circleOpacity: ['interpolate', ['linear'], ['coalesce', ['get', 'aqi'], 0], 0, 0.08, 100, 0.15, 200, 0.25, 300, 0.35],
      },
    },
    {
      id: 'airnow-monitors-circle',
      type: 'circle',
      hit: true,
      style: {
        circleRadius: zoomRamp(4, 3, 8, 5, 12, 8, 15, 11),
        circleColor: AQI_COLOR,
        circleOpacity: 0.92,
        circleStrokeColor: 'rgba(255,255,255,0.75)',
        circleStrokeWidth: 1.5,
      },
    },
    {
      id: 'airnow-monitors-label',
      type: 'symbol',
      minZoom: 7,
      style: {
        textField: ['case', ['==', ['get', 'aqiLabel'], 'ND'], '', ['get', 'aqiLabel']],
        textFont: BOLD,
        textSize: zoomRamp(7, 9, 12, 12),
        textColor: '#ffffff',
        textHaloColor: 'rgba(0,0,0,0.8)',
        textHaloWidth: 1.5,
      },
    },
    {
      id: 'airnow-monitors-name',
      type: 'symbol',
      minZoom: 10,
      style: {
        textField: ['get', 'siteName'],
        textFont: MEDIUM,
        textSize: 10,
        textAnchor: 'top',
        textOffset: [0, 1.2],
        textOptional: true,
        textColor: '#e2e8f0',
        textHaloColor: 'rgba(0,0,0,0.85)',
        textHaloWidth: 1.5,
      },
    },
  ],

  wildfireCameras: [
    {
      id: 'ca-cameras-glow',
      type: 'circle',
      style: {
        circleRadius: zoomRamp(0, 5, 5, 9, 10, 18),
        circleColor: ['case', ['get', 'inService'], '#14b8a6', '#ef4444'],
        circleOpacity: 0.16,
        circleBlur: 0.7,
      },
    },
    {
      id: 'ca-cameras-circle',
      type: 'circle',
      hit: true,
      style: {
        circleRadius: zoomRamp(0, 3, 5, 4, 8, 6, 12, 8),
        circleColor: ['case', ['get', 'inService'], '#14b8a6', '#ef4444'],
        circleOpacity: 0.95,
        circleStrokeColor: '#ffffff',
        circleStrokeWidth: 1.5,
      },
    },
    {
      id: 'ca-cameras-icon',
      type: 'symbol',
      style: {
        // The icon PNGs are 24 pt; the web's are 64 px at these scales.
        iconImage: ['case', ['get', 'inService'], 'camera', 'camera-down'],
        iconSize: zoomRamp(0, 0.24, 5, 0.32, 8, 0.45, 12, 0.64),
        iconAllowOverlap: true,
        iconIgnorePlacement: true,
      },
    },
    {
      id: 'ca-cameras-label',
      type: 'symbol',
      minZoom: 9,
      style: {
        textField: ['coalesce', ['get', 'route'], ''],
        textFont: BOLD,
        textSize: 10,
        textAnchor: 'top',
        textOffset: [0, 0.8],
        textOptional: true,
        textColor: '#14b8a6',
        textHaloColor: 'rgba(0,0,0,0.85)',
        textHaloWidth: 1.4,
      },
    },
  ],

  waterGauges: [
    ...gaugeLayers('other', ['!', IS_ABOVE_ACTION], 11, 11),
    ...gaugeLayers('priority', IS_ABOVE_ACTION, 0, 9),
  ],

  tfrs: [
    { id: 'faa-tfr-fill', type: 'fill', hit: true, style: { fillColor: '#ef4444', fillOpacity: 0.18 } },
    {
      id: 'faa-tfr-outline',
      type: 'line',
      style: { lineColor: '#ef4444', lineWidth: zoomRamp(3, 1.25, 9, 2.5), lineDasharray: [3, 1.5], lineJoin: 'round' },
    },
    {
      id: 'faa-tfr-label',
      type: 'symbol',
      minZoom: 7,
      style: {
        textField: ['concat', 'TFR ', ['get', 'notam']],
        textFont: MEDIUM,
        textSize: 11,
        textColor: '#ffffff',
        textHaloColor: 'rgba(9,9,11,0.85)',
        textHaloWidth: 1.2,
      },
    },
  ],

  awcAdvisories: [
    {
      id: 'awc-advisory-fill',
      type: 'fill',
      hit: true,
      filter: ['==', ['geometry-type'], 'Polygon'],
      style: { fillColor: AWC_HZ_COLOR, fillOpacity: 0.16 },
    },
    {
      id: 'awc-advisory-outline',
      type: 'line',
      style: { lineColor: AWC_HZ_COLOR, lineWidth: zoomRamp(3, 1.25, 8, 2.25), lineOpacity: 0.95 },
    },
  ],

  awcMetars: [
    {
      id: 'awc-metar-wind',
      type: 'symbol',
      minZoom: 5,
      filter: ['==', ['get', 'showWind'], true],
      style: {
        // Arrow pointing where the wind blows to (METAR direction is where it comes from).
        textField: '↓',
        textFont: BOLD,
        textSize: zoomRamp(5, 10, 9, 15),
        textRotate: ['get', 'wdir'],
        textRotationAlignment: 'map',
        textOffset: [0, -0.9],
        textAllowOverlap: false,
        textIgnorePlacement: true,
        textColor: '#ffffff',
        textHaloColor: 'rgba(9,9,11,0.85)',
        textHaloWidth: 1,
      },
    },
    {
      id: 'awc-metar-dot',
      type: 'circle',
      minZoom: 3,
      hit: true,
      style: {
        circleRadius: zoomRamp(3, 3, 6, 4.5, 9, 6, 12, 7),
        circleColor: ['match', ['get', 'fltcat'], ...Object.entries(FLIGHT_CATEGORY_COLORS).flat(), '#9ca3af'],
        circleStrokeColor: '#18181b',
        circleStrokeWidth: zoomRamp(3, 1, 8, 1.75),
      },
    },
    {
      id: 'awc-metar-label',
      type: 'symbol',
      minZoom: 8,
      style: {
        textField: ['get', 'id'],
        textFont: MEDIUM,
        textSize: 10,
        textAnchor: 'top-right',
        textOffset: [-0.6, 0.6],
        textOptional: true,
        textColor: '#ffffff',
        textHaloColor: 'rgba(9,9,11,0.85)',
        textHaloWidth: 1.1,
      },
    },
  ],

  schoolsUniversities: [
    {
      id: 'national-map-colleges-circle',
      type: 'circle',
      hit: true,
      style: {
        circleRadius: zoomRamp(5, 2.5, 9, 4, 14, 7),
        circleColor: '#a78bfa',
        circleOpacity: 0.9,
        circleStrokeColor: 'rgba(255,255,255,0.85)',
        circleStrokeWidth: 1.2,
      },
    },
  ],

  criticalInfrastructure: [
    {
      id: 'eia-gas-pipelines',
      type: 'line',
      hit: true,
      filter: ['==', ['get', 'kind'], 'gas'],
      style: { lineColor: '#38bdf8', lineOpacity: 0.88, lineWidth: zoomRamp(4, 0.5, 8, 1, 12, 2, 16, 3.2), lineCap: 'round', lineJoin: 'round' },
    },
    {
      id: 'cmra-transmission-lines',
      type: 'line',
      hit: true,
      filter: ['==', ['get', 'kind'], 'power'],
      style: { lineColor: '#fbbf24', lineOpacity: 0.85, lineWidth: zoomRamp(4, 0.6, 8, 1.2, 12, 2.5, 16, 4), lineCap: 'round', lineJoin: 'round' },
    },
  ],

  landOwnership: [
    { id: 'california-land-ownership-fill', type: 'fill', hit: true, style: { fillColor: LAND_OWNER_COLOR, fillOpacity: 0.35 } },
    {
      id: 'california-land-ownership-line',
      type: 'line',
      style: { lineColor: LAND_OWNER_COLOR, lineOpacity: 0.8, lineWidth: zoomRamp(10, 0.8, 14, 1.6, 18, 2.4) },
    },
  ],
};
