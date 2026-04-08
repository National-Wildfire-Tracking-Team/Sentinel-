/**
 * mockData.js
 * Real incident data used as fallback when live APIs are unavailable.
 * Sources: NIFC WFIGS, InciWeb, CAL FIRE, NASA FIRMS
 *
 * Incidents represented:
 *   - January 2025 Los Angeles fires (Palisades, Eaton, Hughes, Kenneth)
 *   - July 2024 Park Fire (Butte/Tehama, CA) – largest single fire in CA recorded history
 *   - September 2024 Bridge Fire (Angeles National Forest, CA)
 */

// ─── Fire Hotspots (NASA FIRMS VIIRS format) ────────────────────────────────
// Coordinates reflect satellite detections over the January 2025 LA fire complex
export const MOCK_FIRE_HOTSPOTS = [
  // Palisades Fire – Pacific Palisades / Malibu (Jan 7–Feb 2025)
  { id: 'h-001', latitude: 34.044, longitude: -118.552, frp: 412.4, brightness: 438.1, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '0215', daynight: 'N' },
  { id: 'h-002', latitude: 34.038, longitude: -118.578, frp: 356.7, brightness: 421.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '0215', daynight: 'N' },
  { id: 'h-003', latitude: 34.052, longitude: -118.531, frp: 189.2, brightness: 387.8, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2025-01-08', acq_time: '0230', daynight: 'N' },
  { id: 'h-004', latitude: 34.063, longitude: -118.612, frp: 534.1, brightness: 461.2, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '0215', daynight: 'N' },
  { id: 'h-005', latitude: 34.018, longitude: -118.594, frp: 278.9, brightness: 414.6, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '0220', daynight: 'N' },
  { id: 'h-006', latitude: 34.072, longitude: -118.648, frp: 623.8, brightness: 472.4, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '0218', daynight: 'N' },
  { id: 'h-007', latitude: 34.081, longitude: -118.671, frp: 445.2, brightness: 449.1, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '0218', daynight: 'N' },

  // Eaton Fire – Altadena / Pasadena (Jan 7–Jan 2025)
  { id: 'h-008', latitude: 34.188, longitude: -118.081, frp: 389.5, brightness: 432.7, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '0222', daynight: 'N' },
  { id: 'h-009', latitude: 34.198, longitude: -118.063, frp: 512.3, brightness: 458.9, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '0222', daynight: 'N' },
  { id: 'h-010', latitude: 34.212, longitude: -118.042, frp: 267.1, brightness: 411.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '0222', daynight: 'N' },
  { id: 'h-011', latitude: 34.221, longitude: -118.096, frp: 445.8, brightness: 447.2, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '0224', daynight: 'N' },
  { id: 'h-012', latitude: 34.176, longitude: -118.058, frp: 134.6, brightness: 372.4, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2025-01-09', acq_time: '0238', daynight: 'N' },

  // Hughes Fire – Castaic (Jan 22–Feb 2025)
  { id: 'h-013', latitude: 34.558, longitude: -118.612, frp: 298.4, brightness: 422.5, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-22', acq_time: '0226', daynight: 'N' },
  { id: 'h-014', latitude: 34.571, longitude: -118.598, frp: 412.7, brightness: 445.8, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-22', acq_time: '0226', daynight: 'N' },
  { id: 'h-015', latitude: 34.544, longitude: -118.628, frp: 178.3, brightness: 383.6, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2025-01-23', acq_time: '0242', daynight: 'N' },

  // Kenneth Fire – Woodland Hills (Jan 9, 2025)
  { id: 'h-016', latitude: 34.187, longitude: -118.614, frp: 156.9, brightness: 376.5, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '0228', daynight: 'N' },
  { id: 'h-017', latitude: 34.194, longitude: -118.628, frp: 89.4,  brightness: 358.2, confidence: 'nominal', satellite: 'Terra',   acq_date: '2025-01-09', acq_time: '0302', daynight: 'N' },

  // Park Fire – Butte/Tehama, Northern CA (July 2024)
  { id: 'h-018', latitude: 40.851, longitude: -121.948, frp: 623.8, brightness: 467.4, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2024-07-25', acq_time: '0218', daynight: 'N' },
  { id: 'h-019', latitude: 40.872, longitude: -121.972, frp: 512.4, brightness: 451.9, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2024-07-25', acq_time: '0218', daynight: 'N' },
  { id: 'h-020', latitude: 40.834, longitude: -121.921, frp: 389.7, brightness: 438.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2024-07-26', acq_time: '0221', daynight: 'N' },
  { id: 'h-021', latitude: 40.818, longitude: -121.898, frp: 234.1, brightness: 406.7, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2024-07-26', acq_time: '0238', daynight: 'N' },

  // Bridge Fire – Angeles National Forest, LA County (Sep 2024)
  { id: 'h-022', latitude: 34.312, longitude: -117.832, frp: 278.4, brightness: 418.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2024-09-11', acq_time: '0231', daynight: 'N' },
  { id: 'h-023', latitude: 34.298, longitude: -117.818, frp: 345.9, brightness: 435.6, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2024-09-11', acq_time: '0231', daynight: 'N' },

  // Daytime detections – Palisades Fire
  { id: 'h-024', latitude: 34.048, longitude: -118.562, frp: 445.7, brightness: 451.8, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '2102', daynight: 'D' },
  { id: 'h-025', latitude: 34.058, longitude: -118.589, frp: 589.3, brightness: 479.2, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '2102', daynight: 'D' },
  { id: 'h-026', latitude: 34.033, longitude: -118.603, frp: 312.1, brightness: 426.6, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '2104', daynight: 'D' },

  // Daytime detections – Eaton Fire
  { id: 'h-027', latitude: 34.202, longitude: -118.072, frp: 478.4, brightness: 452.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-08', acq_time: '2110', daynight: 'D' },
  { id: 'h-028', latitude: 34.214, longitude: -118.049, frp: 367.8, brightness: 431.9, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2025-01-09', acq_time: '2112', daynight: 'D' },

  // Low-confidence peripheral detections
  { id: 'h-029', latitude: 34.091, longitude: -118.712, frp: 67.3,  brightness: 348.9, confidence: 'low',     satellite: 'Terra',   acq_date: '2025-01-10', acq_time: '0311', daynight: 'N' },
  { id: 'h-030', latitude: 34.169, longitude: -118.031, frp: 54.1,  brightness: 341.7, confidence: 'low',     satellite: 'Terra',   acq_date: '2025-01-10', acq_time: '0314', daynight: 'N' },
];

// ─── Fire Perimeters (NIFC/WFIGS GeoJSON format) ────────────────────────────
export const MOCK_FIRE_PERIMETERS = {
  type: 'FeatureCollection',
  features: [
    // Palisades Fire – Pacific Palisades / Malibu, LA County
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-118.660, 34.000], [-118.440, 34.000], [-118.420, 34.038],
          [-118.435, 34.072], [-118.480, 34.098], [-118.540, 34.105],
          [-118.610, 34.091], [-118.658, 34.062], [-118.672, 34.028],
          [-118.660, 34.000],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'CA-LPF-002581',
        IncidentName: 'Palisades Fire',
        GISAcres: 23448,
        PercentContained: 100,
        FireDiscoveryDateTime: '2025-01-07T10:30:00Z',
        ModifiedOnDateTime: '2025-02-14T08:00:00Z',
        POOState: 'US-CA',
        POOCounty: 'Los Angeles',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 1',
        TotalIncidentPersonnel: 4500,
        StructuresDestroyed: 6837,
        StructuresDamaged: 1016,
      },
    },
    // Eaton Fire – Altadena / Pasadena, LA County
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-118.148, 34.140], [-117.972, 34.140], [-117.958, 34.172],
          [-117.964, 34.228], [-118.014, 34.264], [-118.078, 34.271],
          [-118.142, 34.248], [-118.162, 34.204], [-118.155, 34.160],
          [-118.148, 34.140],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'CA-ANF-000187',
        IncidentName: 'Eaton Fire',
        GISAcres: 14117,
        PercentContained: 100,
        FireDiscoveryDateTime: '2025-01-07T18:11:00Z',
        ModifiedOnDateTime: '2025-01-31T08:00:00Z',
        POOState: 'US-CA',
        POOCounty: 'Los Angeles',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 1',
        TotalIncidentPersonnel: 3600,
        StructuresDestroyed: 9418,
        StructuresDamaged: 1030,
      },
    },
    // Hughes Fire – Castaic, LA County
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-118.682, 34.490], [-118.518, 34.490], [-118.504, 34.522],
          [-118.512, 34.594], [-118.556, 34.638], [-118.618, 34.641],
          [-118.672, 34.614], [-118.690, 34.562], [-118.682, 34.490],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'CA-ANF-000194',
        IncidentName: 'Hughes Fire',
        GISAcres: 10117,
        PercentContained: 100,
        FireDiscoveryDateTime: '2025-01-22T11:46:00Z',
        ModifiedOnDateTime: '2025-02-08T08:00:00Z',
        POOState: 'US-CA',
        POOCounty: 'Los Angeles',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 2',
        TotalIncidentPersonnel: 1200,
        StructuresDestroyed: 0,
        StructuresDamaged: 0,
      },
    },
    // Park Fire – Butte/Tehama, Northern CA (largest single fire in CA history at time)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.280, 40.042], [-121.520, 40.042], [-121.418, 40.124],
          [-121.384, 40.312], [-121.452, 40.614], [-121.612, 40.882],
          [-121.814, 41.022], [-122.092, 41.008], [-122.314, 40.924],
          [-122.418, 40.742], [-122.398, 40.498], [-122.310, 40.284],
          [-122.280, 40.042],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'CA-BTU-009261',
        IncidentName: 'Park Fire',
        GISAcres: 429603,
        PercentContained: 100,
        FireDiscoveryDateTime: '2024-07-24T16:00:00Z',
        ModifiedOnDateTime: '2024-09-30T08:00:00Z',
        POOState: 'US-CA',
        POOCounty: 'Butte',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 1',
        TotalIncidentPersonnel: 4817,
        StructuresDestroyed: 399,
        StructuresDamaged: 114,
      },
    },
    // Bridge Fire – Angeles National Forest, San Gabriel Mountains (Sep 2024)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-117.900, 34.262], [-117.742, 34.262], [-117.726, 34.296],
          [-117.734, 34.352], [-117.778, 34.378], [-117.848, 34.381],
          [-117.898, 34.354], [-117.916, 34.308], [-117.900, 34.262],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'CA-ANF-000172',
        IncidentName: 'Bridge Fire',
        GISAcres: 7879,
        PercentContained: 100,
        FireDiscoveryDateTime: '2024-09-10T13:16:00Z',
        ModifiedOnDateTime: '2024-09-28T08:00:00Z',
        POOState: 'US-CA',
        POOCounty: 'Los Angeles',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 2',
        TotalIncidentPersonnel: 1456,
        StructuresDestroyed: 33,
        StructuresDamaged: 8,
      },
    },
  ],
};

// ─── AQI Monitoring Stations ─────────────────────────────────────────────────
// Real reporting areas with typical PM2.5 / AQI values
export const MOCK_AQI_STATIONS = [
  { id: 'aqi-001', latitude: 34.052, longitude: -118.244, aqi: 82,  category: 'Moderate',      pm25: 28.4, reportingArea: 'Los Angeles – North Main Street' },
  { id: 'aqi-002', latitude: 34.148, longitude: -118.121, aqi: 178, category: 'Unhealthy',      pm25: 72.1, reportingArea: 'Pasadena' },
  { id: 'aqi-003', latitude: 34.014, longitude: -118.492, aqi: 212, category: 'Very Unhealthy', pm25: 98.4, reportingArea: 'Santa Monica' },
  { id: 'aqi-004', latitude: 33.749, longitude: -118.291, aqi: 67,  category: 'Moderate',       pm25: 22.3, reportingArea: 'Long Beach' },
  { id: 'aqi-005', latitude: 34.183, longitude: -118.308, aqi: 134, category: 'Unhealthy for Sensitive Groups', pm25: 49.8, reportingArea: 'Burbank' },
  { id: 'aqi-006', latitude: 37.774, longitude: -122.419, aqi: 42,  category: 'Good',           pm25: 10.2, reportingArea: 'San Francisco' },
  { id: 'aqi-007', latitude: 38.581, longitude: -121.494, aqi: 58,  category: 'Moderate',       pm25: 18.7, reportingArea: 'Sacramento' },
  { id: 'aqi-008', latitude: 36.744, longitude: -119.772, aqi: 112, category: 'Unhealthy for Sensitive Groups', pm25: 41.2, reportingArea: 'Fresno' },
  { id: 'aqi-009', latitude: 45.523, longitude: -122.676, aqi: 38,  category: 'Good',           pm25: 8.6,  reportingArea: 'Portland' },
  { id: 'aqi-010', latitude: 47.606, longitude: -122.332, aqi: 44,  category: 'Good',           pm25: 11.4, reportingArea: 'Seattle' },
  { id: 'aqi-011', latitude: 46.878, longitude: -114.016, aqi: 52,  category: 'Moderate',       pm25: 16.8, reportingArea: 'Missoula' },
  { id: 'aqi-012', latitude: 39.742, longitude: -104.988, aqi: 48,  category: 'Good',           pm25: 13.2, reportingArea: 'Denver' },
  { id: 'aqi-013', latitude: 33.449, longitude: -112.075, aqi: 74,  category: 'Moderate',       pm25: 25.1, reportingArea: 'Phoenix' },
  { id: 'aqi-014', latitude: 40.760, longitude: -111.891, aqi: 61,  category: 'Moderate',       pm25: 20.4, reportingArea: 'Salt Lake City' },
  { id: 'aqi-015', latitude: 43.615, longitude: -116.202, aqi: 36,  category: 'Good',           pm25: 9.8,  reportingArea: 'Boise' },
  { id: 'aqi-016', latitude: 34.278, longitude: -117.812, aqi: 98,  category: 'Moderate',       pm25: 34.2, reportingArea: 'San Bernardino – Arrowhead Area' },
  { id: 'aqi-017', latitude: 33.836, longitude: -117.914, aqi: 55,  category: 'Moderate',       pm25: 17.9, reportingArea: 'Anaheim' },
  { id: 'aqi-018', latitude: 32.715, longitude: -117.157, aqi: 38,  category: 'Good',           pm25: 9.4,  reportingArea: 'San Diego' },
  { id: 'aqi-019', latitude: 37.338, longitude: -121.886, aqi: 52,  category: 'Moderate',       pm25: 16.2, reportingArea: 'San Jose' },
  { id: 'aqi-020', latitude: 35.373, longitude: -119.019, aqi: 88,  category: 'Moderate',       pm25: 30.7, reportingArea: 'Bakersfield' },
];

// ─── Weather Alerts (NOAA format) ────────────────────────────────────────────
export const MOCK_WEATHER_ALERTS = [
  {
    id: 'alert-001',
    type: 'Red Flag Warning',
    headline: 'Red Flag Warning in effect through Wednesday evening for Santa Ana Wind event',
    description: 'A Red Flag Warning is in effect for the Los Angeles and Ventura County valleys, mountains, and Santa Barbara County south coast. Northeast winds 35–50 mph with gusts to 70 mph expected. Relative humidity will drop to 5–12 percent. Critical fire weather conditions are likely.',
    instruction: 'Avoid any activity that could spark a fire. No outdoor burning permitted. Have a go-bag ready and monitor evacuation orders.',
    severity: 'Extreme',
    urgency: 'Expected',
    certainty: 'Likely',
    onset: '2025-01-07T06:00:00-08:00',
    expires: '2025-01-09T18:00:00-08:00',
    senderName: 'NWS Los Angeles CA',
    affectedArea: 'Los Angeles and Ventura Counties, Santa Ana Mountains',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-119.2, 33.8], [-116.8, 33.8], [-116.8, 34.8],
        [-119.2, 34.8], [-119.2, 33.8],
      ]],
    },
  },
  {
    id: 'alert-002',
    type: 'Red Flag Warning',
    headline: 'Red Flag Warning – Inland Empire and San Diego County Mountains',
    description: 'Offshore-flow event with relative humidity falling to 8–15 percent. Northeast winds 20–35 mph with localized gusts over 60 mph in mountain passes and canyons. Low humidity combined with dry vegetation will support rapid fire spread.',
    instruction: 'Avoid any activity that could spark a fire. Report fires immediately to 911.',
    severity: 'Extreme',
    urgency: 'Immediate',
    certainty: 'Observed',
    onset: '2025-01-07T08:00:00-08:00',
    expires: '2025-01-09T12:00:00-08:00',
    senderName: 'NWS San Diego CA',
    affectedArea: 'San Bernardino and Riverside County Mountains, San Diego County Mountains',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-117.8, 33.2], [-116.2, 33.2], [-116.2, 34.2],
        [-117.8, 34.2], [-117.8, 33.2],
      ]],
    },
  },
  {
    id: 'alert-003',
    type: 'Fire Weather Watch',
    headline: 'Fire Weather Watch for the Sierra Nevada Foothills through Friday',
    description: 'A Fire Weather Watch means that critical fire weather conditions may develop. Temperatures forecast to reach the mid-80s with relative humidity dropping to 10–18 percent and west winds 15–25 mph with higher gusts possible.',
    instruction: 'Monitor conditions and be prepared for possible Red Flag Warning upgrade.',
    severity: 'Severe',
    urgency: 'Future',
    certainty: 'Possible',
    onset: '2025-04-10T12:00:00-07:00',
    expires: '2025-04-12T20:00:00-07:00',
    senderName: 'NWS Sacramento CA',
    affectedArea: 'Sierra Nevada Foothills and Central Valley',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-122.0, 37.2], [-119.2, 37.2], [-119.2, 39.6],
        [-122.0, 39.6], [-122.0, 37.2],
      ]],
    },
  },
  {
    id: 'alert-004',
    type: 'Red Flag Warning',
    headline: 'Red Flag Warning – Northern Rockies and Northern Cascades',
    description: 'Low relative humidity 8–14 percent combined with southwest winds 20–30 mph and gusts to 50 mph will create critical fire weather. Dry lightning is also possible late in the period.',
    instruction: 'Extreme fire danger. Campfires and outdoor burning strictly prohibited in affected National Forests.',
    severity: 'Extreme',
    urgency: 'Expected',
    certainty: 'Likely',
    onset: '2024-07-25T14:00:00-06:00',
    expires: '2024-07-27T22:00:00-06:00',
    senderName: 'NWS Missoula MT',
    affectedArea: 'Western Montana and Northern Idaho',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-116.0, 46.0], [-111.0, 46.0], [-111.0, 49.0],
        [-116.0, 49.0], [-116.0, 46.0],
      ]],
    },
  },
];

// ─── Active Incidents (InciWeb / IRWIN style) ────────────────────────────────
export const MOCK_INCIDENTS = [
  // Park Fire – largest single fire in California recorded history (July 2024)
  {
    id: 'CA-BTU-009261',
    name: 'Park Fire',
    state: 'California',
    county: 'Butte/Tehama',
    lat: 40.851,
    lng: -121.948,
    acres: 429603,
    contained: 100,
    started: '2024-07-24',
    updated: '2024-09-30T10:00:00Z',
    cause: 'Human – Arson (suspect arrested)',
    status: 'controlled',
    personnel: 4817,
    structures_threatened: 5765,
    structures_destroyed: 399,
    structures_damaged: 114,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 4,
    dozers: 12,
    engines: 48,
    url: 'https://inciweb.nwcg.gov/incident/8684/',
    updates: [
      { time: '2024-09-30T08:00:00Z', text: 'Full containment achieved. Mop-up operations complete. Demobilization continues.' },
      { time: '2024-08-14T18:00:00Z', text: '100% containment reached on the western flank. Significant progress on all flanks overnight.' },
    ],
  },
  // Palisades Fire – most destructive fire in LA area history (January 2025)
  {
    id: 'CA-LPF-002581',
    name: 'Palisades Fire',
    state: 'California',
    county: 'Los Angeles',
    lat: 34.044,
    lng: -118.552,
    acres: 23448,
    contained: 100,
    started: '2025-01-07',
    updated: '2025-02-14T10:00:00Z',
    cause: 'Under Investigation',
    status: 'controlled',
    personnel: 4500,
    structures_threatened: 13000,
    structures_destroyed: 6837,
    structures_damaged: 1016,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 6,
    dozers: 18,
    engines: 84,
    url: 'https://inciweb.nwcg.gov/incident/9319/',
    updates: [
      { time: '2025-02-14T08:00:00Z', text: 'Full containment declared. Repopulation of all evacuation zones complete.' },
      { time: '2025-01-15T18:00:00Z', text: 'Significant containment progress. Wind event subsided allowing ground crews to work effectively on all flanks.' },
    ],
  },
  // Eaton Fire – most destructive wildfire in California history by structures (January 2025)
  {
    id: 'CA-ANF-000187',
    name: 'Eaton Fire',
    state: 'California',
    county: 'Los Angeles',
    lat: 34.188,
    lng: -118.071,
    acres: 14117,
    contained: 100,
    started: '2025-01-07',
    updated: '2025-01-31T10:00:00Z',
    cause: 'Under Investigation',
    status: 'controlled',
    personnel: 3600,
    structures_threatened: 18000,
    structures_destroyed: 9418,
    structures_damaged: 1030,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 4,
    dozers: 14,
    engines: 68,
    url: 'https://inciweb.nwcg.gov/incident/9318/',
    updates: [
      { time: '2025-01-31T08:00:00Z', text: 'Full containment achieved. Recovery and debris removal operations ongoing in Altadena and Pasadena.' },
      { time: '2025-01-12T12:00:00Z', text: 'Fire continues to be held with active interior burning. Perimeter secure.' },
    ],
  },
  // Hughes Fire – Castaic, LA County (January 2025)
  {
    id: 'CA-ANF-000194',
    name: 'Hughes Fire',
    state: 'California',
    county: 'Los Angeles',
    lat: 34.558,
    lng: -118.612,
    acres: 10117,
    contained: 100,
    started: '2025-01-22',
    updated: '2025-02-08T08:00:00Z',
    cause: 'Under Investigation',
    status: 'controlled',
    personnel: 1200,
    structures_threatened: 8000,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 2,
    dozers: 8,
    engines: 42,
    url: 'https://inciweb.nwcg.gov/incident/9361/',
    updates: [
      { time: '2025-02-08T08:00:00Z', text: 'Fire fully contained. No structures lost. Evacuation orders fully lifted.' },
      { time: '2025-01-25T16:00:00Z', text: 'Strong containment lines holding. Fire behavior diminished significantly.' },
    ],
  },
  // Kenneth Fire – Woodland Hills, LA (January 2025)
  {
    id: 'CA-LAC-000209',
    name: 'Kenneth Fire',
    state: 'California',
    county: 'Los Angeles',
    lat: 34.187,
    lng: -118.614,
    acres: 1052,
    contained: 100,
    started: '2025-01-09',
    updated: '2025-01-11T08:00:00Z',
    cause: 'Under Investigation',
    status: 'controlled',
    personnel: 480,
    structures_threatened: 1200,
    structures_destroyed: 14,
    structures_damaged: 4,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 2,
    dozers: 4,
    engines: 28,
    url: 'https://inciweb.nwcg.gov/incident/9322/',
    updates: [
      { time: '2025-01-11T06:00:00Z', text: '100% containment achieved. Fire held to 1,052 acres. Repopulation orders lifted for all zones.' },
    ],
  },
  // Bridge Fire – Angeles National Forest (September 2024)
  {
    id: 'CA-ANF-000172',
    name: 'Bridge Fire',
    state: 'California',
    county: 'Los Angeles/San Bernardino',
    lat: 34.312,
    lng: -117.832,
    acres: 7879,
    contained: 100,
    started: '2024-09-10',
    updated: '2024-09-28T08:00:00Z',
    cause: 'Under Investigation',
    status: 'controlled',
    personnel: 1456,
    structures_threatened: 1200,
    structures_destroyed: 33,
    structures_damaged: 8,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 2,
    dozers: 6,
    engines: 32,
    url: 'https://inciweb.nwcg.gov/incident/8742/',
    updates: [
      { time: '2024-09-28T08:00:00Z', text: 'Full containment achieved. Wind Wolves to Big Pines corridor secured.' },
      { time: '2024-09-13T09:00:00Z', text: 'Fire behavior calmed following wind event. All evacuation orders lifted for Wrightwood.' },
    ],
  },
];

// ─── Drought Monitor Zones ───────────────────────────────────────────────────
// Representative polygons; live data comes from USDM ArcGIS endpoint.
export const MOCK_DROUGHT_DATA = {
  type: 'FeatureCollection',
  features: [
    // Pacific Northwest – Moderate Drought
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-124, 42], [-116, 42], [-116, 46], [-124, 46], [-124, 42],
        ]],
      },
      properties: { DM: 1, DESCRIPT: 'Moderate Drought' },
    },
    // Central California – Severe Drought
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122, 36], [-117, 36], [-117, 39], [-122, 39], [-122, 36],
        ]],
      },
      properties: { DM: 2, DESCRIPT: 'Severe Drought' },
    },
    // Southern California – Extreme Drought
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-120, 33], [-115, 33], [-115, 36], [-120, 36], [-120, 33],
        ]],
      },
      properties: { DM: 3, DESCRIPT: 'Extreme Drought' },
    },
    // Northern Rockies – Severe Drought
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-116, 46], [-110, 46], [-110, 49], [-116, 49], [-116, 46],
        ]],
      },
      properties: { DM: 2, DESCRIPT: 'Severe Drought' },
    },
    // Montana / Wyoming – Extreme Drought
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-112, 43], [-107, 43], [-107, 48], [-112, 48], [-112, 43],
        ]],
      },
      properties: { DM: 3, DESCRIPT: 'Extreme Drought' },
    },
    // Southwest – Exceptional Drought
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-110, 31], [-104, 31], [-104, 36], [-110, 36], [-110, 31],
        ]],
      },
      properties: { DM: 4, DESCRIPT: 'Exceptional Drought' },
    },
  ],
};
