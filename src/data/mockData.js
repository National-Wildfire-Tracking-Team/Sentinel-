/**
 * mockData.js
 * Real incident data used as fallback when live APIs are unavailable.
 * Sources: NIFC WFIGS_Incident_Locations_Current (queried 2026-04-08)
 *
 * Incidents represented (current as of April 2026):
 *   - Morrill Fire, Nebraska – 642,029 acres (one of largest in Great Plains history)
 *   - Cottonwood Fire, Nebraska – 129,253 acres
 *   - Ashby Fire, Nebraska – 36,004 acres
 *   - Road 203 Fire, Nebraska – 35,892 acres
 *   - Fire 139, Florida – 6,043 acres (50% contained)
 *   - Sargent Fire, Florida – 2,470 acres (62% contained)
 *   - Meadow View Fire, Texas – 800 acres (60% contained)
 *   - Williams Creek Fire, Alabama – 780 acres (0% contained)
 */

// ─── Fire Hotspots (NASA FIRMS VIIRS format) ────────────────────────────────
// Coordinates reflect satellite detections over current active fire locations (April 2026)
export const MOCK_FIRE_HOTSPOTS = [
  // Morrill Fire – Garden County, Nebraska (Mar–Apr 2026) – 642,029 acres
  { id: 'h-001', latitude: 41.492, longitude: -102.184, frp: 312.4, brightness: 428.1, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-14', acq_time: '0610', daynight: 'N' },
  { id: 'h-002', latitude: 41.468, longitude: -102.211, frp: 489.7, brightness: 453.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-14', acq_time: '0610', daynight: 'N' },
  { id: 'h-003', latitude: 41.512, longitude: -102.148, frp: 567.2, brightness: 468.8, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-14', acq_time: '0610', daynight: 'N' },
  { id: 'h-004', latitude: 41.444, longitude: -102.238, frp: 234.1, brightness: 406.7, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2026-03-14', acq_time: '0625', daynight: 'N' },
  { id: 'h-005', latitude: 41.534, longitude: -102.122, frp: 445.8, brightness: 447.2, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-15', acq_time: '0612', daynight: 'N' },
  { id: 'h-006', latitude: 41.478, longitude: -102.272, frp: 623.8, brightness: 472.4, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-15', acq_time: '0612', daynight: 'N' },

  // Cottonwood Fire – Lincoln County, Nebraska (Mar 2026) – 129,253 acres
  { id: 'h-007', latitude: 40.884, longitude: -100.448, frp: 378.5, brightness: 432.7, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-16', acq_time: '0614', daynight: 'N' },
  { id: 'h-008', latitude: 40.862, longitude: -100.472, frp: 289.3, brightness: 418.9, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-16', acq_time: '0614', daynight: 'N' },
  { id: 'h-009', latitude: 40.898, longitude: -100.418, frp: 167.1, brightness: 381.3, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2026-03-17', acq_time: '0631', daynight: 'N' },

  // Williams Creek Fire – Perry County, Alabama (Apr 2026) – 780 acres, 0% contained
  { id: 'h-010', latitude: 32.772, longitude: -87.046, frp: 89.4,  brightness: 362.5, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-06', acq_time: '0718', daynight: 'N' },
  { id: 'h-011', latitude: 32.758, longitude: -87.062, frp: 112.7, brightness: 371.8, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-06', acq_time: '0718', daynight: 'N' },
  { id: 'h-012', latitude: 32.779, longitude: -87.031, frp: 67.3,  brightness: 348.9, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2026-04-07', acq_time: '0734', daynight: 'N' },

  // Fire 139 – Liberty County, Florida (Mar–Apr 2026) – 6,043 acres, 50% contained
  { id: 'h-013', latitude: 30.158, longitude: -84.951, frp: 98.4,  brightness: 365.2, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-05', acq_time: '0722', daynight: 'N' },
  { id: 'h-014', latitude: 30.142, longitude: -84.968, frp: 134.7, brightness: 376.5, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-06', acq_time: '0720', daynight: 'N' },

  // Sargent Fire – Polk County, Florida (Apr 2026) – 2,470 acres, 62% contained
  { id: 'h-015', latitude: 27.658, longitude: -81.358, frp: 78.3,  brightness: 356.6, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-04', acq_time: '0726', daynight: 'N' },
  { id: 'h-016', latitude: 27.641, longitude: -81.342, frp: 56.1,  brightness: 341.4, confidence: 'nominal', satellite: 'Aqua',    acq_date: '2026-04-05', acq_time: '0742', daynight: 'N' },

  // Meadow View Fire – Potter County, Texas (Apr 2026) – 800 acres, 60% contained
  { id: 'h-017', latitude: 35.474, longitude: -101.838, frp: 145.9, brightness: 374.5, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-07', acq_time: '0708', daynight: 'N' },
  { id: 'h-018', latitude: 35.462, longitude: -101.852, frp: 89.4,  brightness: 358.2, confidence: 'nominal', satellite: 'Terra',   acq_date: '2026-04-07', acq_time: '0802', daynight: 'N' },

  // Ashby Fire – Grant County, Nebraska (Mar 2026) – 36,004 acres
  { id: 'h-019', latitude: 42.028, longitude: -101.934, frp: 289.7, brightness: 418.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-27', acq_time: '0608', daynight: 'N' },
  { id: 'h-020', latitude: 42.012, longitude: -101.958, frp: 234.8, brightness: 402.3, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-27', acq_time: '0608', daynight: 'N' },

  // Road 203 Fire – Thomas County, Nebraska (Mar 2026) – 35,892 acres
  { id: 'h-021', latitude: 41.852, longitude: -100.418, frp: 312.4, brightness: 425.6, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-13', acq_time: '0616', daynight: 'N' },

  // Daytime detections – Morrill Fire
  { id: 'h-022', latitude: 41.498, longitude: -102.172, frp: 445.7, brightness: 451.8, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-14', acq_time: '2002', daynight: 'D' },
  { id: 'h-023', latitude: 41.458, longitude: -102.198, frp: 589.3, brightness: 479.2, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-03-14', acq_time: '2002', daynight: 'D' },

  // Daytime detections – Williams Creek (active)
  { id: 'h-024', latitude: 32.768, longitude: -87.052, frp: 124.4, brightness: 372.1, confidence: 'high',    satellite: 'NOAA-20', acq_date: '2026-04-07', acq_time: '1908', daynight: 'D' },

  // Low-confidence peripheral detections
  { id: 'h-025', latitude: 41.554, longitude: -102.098, frp: 67.3,  brightness: 348.9, confidence: 'low',    satellite: 'Terra',   acq_date: '2026-03-16', acq_time: '0811', daynight: 'N' },
  { id: 'h-026', latitude: 30.174, longitude: -84.934, frp: 54.1,  brightness: 341.7, confidence: 'low',     satellite: 'Terra',   acq_date: '2026-04-06', acq_time: '0814', daynight: 'N' },
];

// ─── Fire Perimeters (NIFC/WFIGS GeoJSON format) ────────────────────────────
// Approximate perimeters for current 2026 incidents
export const MOCK_FIRE_PERIMETERS = {
  type: 'FeatureCollection',
  features: [
    // Morrill Fire – Garden County, Nebraska (642,029 acres)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-102.680, 41.242], [-101.680, 41.242], [-101.580, 41.382],
          [-101.612, 41.622], [-101.814, 41.742], [-102.192, 41.748],
          [-102.538, 41.678], [-102.712, 41.512], [-102.680, 41.242],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'NE-NNF-000041',
        IncidentName: 'Morrill Fire',
        GISAcres: 642029,
        PercentContained: 100,
        FireDiscoveryDateTime: '2026-03-13T00:00:00Z',
        ModifiedOnDateTime: '2026-04-01T12:00:00Z',
        POOState: 'US-NE',
        POOCounty: 'Garden',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 2',
        TotalIncidentPersonnel: 195,
        StructuresDestroyed: 0,
        StructuresDamaged: 0,
      },
    },
    // Cottonwood Fire – Lincoln County, Nebraska (129,253 acres)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-100.782, 40.722], [-100.082, 40.722], [-100.012, 40.828],
          [-100.048, 40.982], [-100.268, 41.042], [-100.618, 41.038],
          [-100.814, 40.948], [-100.842, 40.812], [-100.782, 40.722],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'NE-NNF-000044',
        IncidentName: 'Cottonwood Fire',
        GISAcres: 129253,
        PercentContained: 100,
        FireDiscoveryDateTime: '2026-03-15T00:00:00Z',
        ModifiedOnDateTime: '2026-03-28T08:00:00Z',
        POOState: 'US-NE',
        POOCounty: 'Lincoln',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 3',
        TotalIncidentPersonnel: 154,
        StructuresDestroyed: 0,
        StructuresDamaged: 0,
      },
    },
    // Williams Creek Fire – Perry County, Alabama (780 acres, 0% contained – ACTIVE)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-87.098, 32.726], [-86.998, 32.726], [-86.982, 32.754],
          [-86.988, 32.802], [-87.022, 32.818], [-87.068, 32.814],
          [-87.098, 32.788], [-87.108, 32.754], [-87.098, 32.726],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'AL-ALF-000088',
        IncidentName: 'Williams Creek Fire',
        GISAcres: 780,
        PercentContained: 0,
        FireDiscoveryDateTime: '2026-04-05T00:00:00Z',
        ModifiedOnDateTime: '2026-04-08T06:00:00Z',
        POOState: 'US-AL',
        POOCounty: 'Perry',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 4',
        TotalIncidentPersonnel: 87,
        StructuresDestroyed: 0,
        StructuresDamaged: 0,
      },
    },
    // Sargent Fire – Polk County, Florida (2,470 acres, 62% contained – ACTIVE)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-81.418, 27.602], [-81.282, 27.602], [-81.264, 27.638],
          [-81.272, 27.694], [-81.318, 27.718], [-81.382, 27.714],
          [-81.418, 27.682], [-81.428, 27.638], [-81.418, 27.602],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'FL-FFS-000217',
        IncidentName: 'Sargent Fire',
        GISAcres: 2470,
        PercentContained: 62,
        FireDiscoveryDateTime: '2026-04-02T00:00:00Z',
        ModifiedOnDateTime: '2026-04-08T07:00:00Z',
        POOState: 'US-FL',
        POOCounty: 'Polk',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 3',
        TotalIncidentPersonnel: 119,
        StructuresDestroyed: 0,
        StructuresDamaged: 0,
      },
    },
    // Fire 139 – Liberty County, Florida (6,043 acres, 50% contained – ACTIVE)
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-85.068, 30.092], [-84.812, 30.092], [-84.788, 30.148],
          [-84.798, 30.218], [-84.882, 30.248], [-84.998, 30.244],
          [-85.068, 30.192], [-85.088, 30.138], [-85.068, 30.092],
        ]],
      },
      properties: {
        UniqueFireIdentifier: 'FL-FNF-000139',
        IncidentName: 'Fire 139',
        GISAcres: 6043,
        PercentContained: 50,
        FireDiscoveryDateTime: '2026-03-17T00:00:00Z',
        ModifiedOnDateTime: '2026-04-07T14:00:00Z',
        POOState: 'US-FL',
        POOCounty: 'Liberty',
        IncidentTypeCategory: 'WF',
        IncidentManagementOrganization: 'Type 4',
        TotalIncidentPersonnel: 31,
        StructuresDestroyed: 0,
        StructuresDamaged: 0,
      },
    },
  ],
};

// ─── AQI Monitoring Stations ─────────────────────────────────────────────────
// Real reporting areas with typical AQI values for April 8, 2026.
// Southeast US elevated due to active fires (Williams Creek AL, Fire 139 FL, Sargent FL).
export const MOCK_AQI_STATIONS = [
  // Alabama – near Williams Creek Fire (0% contained)
  { id: 'aqi-001', latitude: 32.361, longitude: -86.279, aqi: 112, category: 'Unhealthy for Sensitive Groups', pm25: 42.1, reportingArea: 'Montgomery, AL' },
  { id: 'aqi-002', latitude: 33.521, longitude: -86.803, aqi: 68,  category: 'Moderate',      pm25: 23.4, reportingArea: 'Birmingham, AL' },
  { id: 'aqi-003', latitude: 30.695, longitude: -88.043, aqi: 52,  category: 'Moderate',       pm25: 16.8, reportingArea: 'Mobile, AL' },

  // Georgia – under active Red Flag Warnings
  { id: 'aqi-004', latitude: 31.575, longitude: -84.156, aqi: 134, category: 'Unhealthy for Sensitive Groups', pm25: 51.2, reportingArea: 'Albany, GA' },
  { id: 'aqi-005', latitude: 32.841, longitude: -83.632, aqi: 98,  category: 'Moderate',       pm25: 34.7, reportingArea: 'Macon, GA' },
  { id: 'aqi-006', latitude: 33.749, longitude: -84.388, aqi: 62,  category: 'Moderate',       pm25: 21.3, reportingArea: 'Atlanta, GA' },

  // Florida – smoke from Fire 139 and Sargent Fire
  { id: 'aqi-007', latitude: 30.438, longitude: -84.281, aqi: 145, category: 'Unhealthy for Sensitive Groups', pm25: 54.8, reportingArea: 'Tallahassee, FL' },
  { id: 'aqi-008', latitude: 29.651, longitude: -82.325, aqi: 72,  category: 'Moderate',       pm25: 24.6, reportingArea: 'Gainesville, FL' },
  { id: 'aqi-009', latitude: 27.994, longitude: -82.545, aqi: 44,  category: 'Good',            pm25: 11.8, reportingArea: 'Tampa, FL' },
  { id: 'aqi-010', latitude: 25.774, longitude: -80.194, aqi: 38,  category: 'Good',            pm25: 9.2,  reportingArea: 'Miami, FL' },

  // Nebraska – downwind of Morrill/Cottonwood fires
  { id: 'aqi-011', latitude: 40.813, longitude: -96.703, aqi: 78,  category: 'Moderate',       pm25: 26.4, reportingArea: 'Lincoln, NE' },
  { id: 'aqi-012', latitude: 41.258, longitude: -95.938, aqi: 92,  category: 'Moderate',       pm25: 32.1, reportingArea: 'Omaha, NE' },

  // Texas
  { id: 'aqi-013', latitude: 35.207, longitude: -101.836, aqi: 88, category: 'Moderate',       pm25: 29.8, reportingArea: 'Amarillo, TX' },
  { id: 'aqi-014', latitude: 29.763, longitude: -95.363,  aqi: 52, category: 'Moderate',       pm25: 16.4, reportingArea: 'Houston, TX' },

  // Western US – cleaner air this time of year
  { id: 'aqi-015', latitude: 37.774, longitude: -122.419, aqi: 32, category: 'Good',            pm25: 7.8,  reportingArea: 'San Francisco, CA' },
  { id: 'aqi-016', latitude: 34.052, longitude: -118.244, aqi: 58, category: 'Moderate',        pm25: 18.2, reportingArea: 'Los Angeles, CA' },
  { id: 'aqi-017', latitude: 47.606, longitude: -122.332, aqi: 28, category: 'Good',            pm25: 6.4,  reportingArea: 'Seattle, WA' },
  { id: 'aqi-018', latitude: 45.523, longitude: -122.676, aqi: 34, category: 'Good',            pm25: 8.1,  reportingArea: 'Portland, OR' },
  { id: 'aqi-019', latitude: 39.742, longitude: -104.988, aqi: 46, category: 'Good',            pm25: 12.6, reportingArea: 'Denver, CO' },
  { id: 'aqi-020', latitude: 33.449, longitude: -112.075, aqi: 64, category: 'Moderate',        pm25: 21.8, reportingArea: 'Phoenix, AZ' },
];

// ─── Weather Alerts (NOAA format) ────────────────────────────────────────────
// Source: NOAA api.weather.gov/alerts/active queried 2026-04-08
export const MOCK_WEATHER_ALERTS = [
  {
    id: 'urn:oid:2.49.0.1.840.0.d4e8a2b1.2026-04-08T1213Z.Red_Flag_Warning',
    type: 'Red Flag Warning',
    headline: 'Red Flag Warning issued April 8 at 10:13AM EDT until April 8 at 8:00PM EDT by NWS Tallahassee FL',
    description: '* AFFECTED AREA...Georgia fire weather zones 125, 126, 127, 128, 129, 130, and 131 (Dougherty, Lee, Worth, Turner, Tift, Ben Hill, Irwin).\n\n* WIND...Northeast to east 15 to 20 mph, with gusts 25 to 35 mph.\n\n* HUMIDITY...As low as 25 percent.\n\n* IMPACTS...Any fires that develop will likely spread rapidly. Outdoor burning is not recommended.',
    instruction: 'A Red Flag Warning means that critical fire weather conditions are either occurring now, or will shortly. A combination of strong winds, low relative humidity, and warm temperatures can contribute to extreme fire behavior. Please refer to local burn bans before any outdoor burning.',
    severity: 'Severe',
    urgency: 'Expected',
    certainty: 'Likely',
    onset: '2026-04-08T12:00:00-04:00',
    expires: '2026-04-08T20:00:00-04:00',
    senderName: 'NWS Tallahassee FL',
    affectedArea: 'Dougherty; Lee; Worth; Turner; Tift; Ben Hill; Irwin',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-84.6, 31.0], [-83.2, 31.0], [-83.2, 31.9],
        [-84.6, 31.9], [-84.6, 31.0],
      ]],
    },
  },
  {
    id: 'urn:oid:2.49.0.1.840.0.c3d7b1a0.2026-04-08T0811Z.Red_Flag_Warning',
    type: 'Red Flag Warning',
    headline: 'Red Flag Warning issued April 8 at 8:11AM EDT until April 8 at 8:00PM EDT by NWS Peachtree City GA',
    description: '* Affected Area...Central Georgia including: Crisp, Wilcox, Dodge, Telfair, Wheeler, Montgomery, Toombs, Emanuel, Treutlen, Laurens, Pulaski, Dooly, Houston, Bleckley, Johnson, Jefferson, Warren, Washington, Glascock, Wilkinson.\n\n* Wind...Northeast 15 to 20 mph with gusts up to 30 mph.\n\n* Relative Humidity...As low as 20 to 25 percent.\n\n* Impacts...Conditions are favorable for rapid fire spread and extreme fire behavior.',
    instruction: 'A Red Flag Warning means that critical fire weather conditions are either occurring now...or will occur within 24 hours. Please refer to the local burn permit regulations before any outdoor burning.',
    severity: 'Severe',
    urgency: 'Expected',
    certainty: 'Likely',
    onset: '2026-04-08T12:00:00-04:00',
    expires: '2026-04-08T20:00:00-04:00',
    senderName: 'NWS Peachtree City GA',
    affectedArea: 'Central Georgia – Warren, Washington, Glascock, Jefferson, Twiggs, Wilkinson, Johnson, Emanuel, Houston, Bleckley, Laurens, Dooly, Crisp, Pulaski, Wilcox, Dodge, Telfair, Wheeler, Montgomery, Toombs, Treutlen',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-84.2, 31.8], [-81.8, 31.8], [-81.8, 33.2],
        [-84.2, 33.2], [-84.2, 31.8],
      ]],
    },
  },
  {
    id: 'urn:oid:2.49.0.1.840.0.b2c6a0f9.2026-04-08T0220Z.Red_Flag_Warning',
    type: 'Red Flag Warning',
    headline: 'Red Flag Warning issued April 8 at 2:20AM EDT until April 8 at 8:00PM EDT by NWS Jacksonville FL',
    description: '...CRITICAL FIRE WEATHER CONDITIONS POSSIBLE ACROSS INLAND PORTIONS OF SOUTHEAST GA THIS AFTERNOON...\n\n* AFFECTED AREA...In Georgia, Coffee, Jeff Davis, Bacon and Appling counties.\n\n* TIMING...2 PM to 8 PM EDT.\n\n* WIND...Northeast winds 10 to 20 mph with gusts to 30 mph.\n\n* HUMIDITY...As low as 20 percent.\n\n* OUTLOOK...Conditions improve after 8 PM as winds diminish.',
    instruction: 'A Red Flag Warning means that critical fire weather conditions are either occurring now, or will shortly. A combination of strong winds, low relative humidity, and warm temperatures can contribute to extreme fire behavior.',
    severity: 'Severe',
    urgency: 'Expected',
    certainty: 'Likely',
    onset: '2026-04-08T14:00:00-04:00',
    expires: '2026-04-08T20:00:00-04:00',
    senderName: 'NWS Jacksonville FL',
    affectedArea: 'Coffee; Jeff Davis; Bacon; Appling',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-83.4, 31.3], [-82.0, 31.3], [-82.0, 31.9],
        [-83.4, 31.9], [-83.4, 31.3],
      ]],
    },
  },
];

// ─── Active Incidents (InciWeb / IRWIN style) ────────────────────────────────
// Source: WFIGS_Incident_Locations_Current queried 2026-04-08
export const MOCK_INCIDENTS = [
  // Morrill Fire – one of the largest wildfires ever recorded in the Great Plains
  {
    id: 'NE-NNF-000041',
    name: 'Morrill Fire',
    state: 'Nebraska',
    county: 'Garden',
    lat: 41.4744,
    lng: -102.157,
    acres: 642029,
    contained: 100,
    started: '2026-03-13',
    updated: '2026-04-01T12:00:00Z',
    cause: 'Undetermined',
    status: 'controlled',
    personnel: 195,
    structures_threatened: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 2,
    dozers: 14,
    engines: 38,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-04-01T10:00:00Z', text: 'Full containment achieved. Mop-up and patrol operations continue.' },
      { time: '2026-03-18T16:00:00Z', text: 'Fire perimeter secured on north and east flanks. High wind event forecast this weekend – resources on standby.' },
    ],
  },
  // Cottonwood Fire – significant Nebraska panhandle grassland fire
  {
    id: 'NE-NNF-000044',
    name: 'Cottonwood Fire',
    state: 'Nebraska',
    county: 'Lincoln',
    lat: 40.8719,
    lng: -100.4329,
    acres: 129253,
    contained: 100,
    started: '2026-03-15',
    updated: '2026-03-28T08:00:00Z',
    cause: 'Undetermined',
    status: 'controlled',
    personnel: 154,
    structures_threatened: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 1,
    dozers: 8,
    engines: 22,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-03-28T08:00:00Z', text: 'Fire fully contained. Patrol operations underway.' },
    ],
  },
  // Williams Creek Fire – most active fire as of April 8, 2026
  {
    id: 'AL-ALF-000088',
    name: 'Williams Creek Fire',
    state: 'Alabama',
    county: 'Perry',
    lat: 32.7654,
    lng: -87.0424,
    acres: 780,
    contained: 0,
    started: '2026-04-05',
    updated: '2026-04-08T06:00:00Z',
    cause: 'Human',
    status: 'active',
    personnel: 87,
    structures_threatened: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 1,
    air_tankers: 1,
    helicopters: 1,
    dozers: 4,
    engines: 14,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-04-08T06:00:00Z', text: 'Fire activity remains high with dry and windy conditions forecast. Hand crews working direct attack on southeast flank.' },
      { time: '2026-04-06T18:00:00Z', text: 'Initial attack resources transitioned to extended attack. Fire spread to 780 acres overnight due to SW winds.' },
    ],
  },
  // Fire 139 – Florida Panhandle, Liberty County
  {
    id: 'FL-FNF-000139',
    name: 'Fire 139',
    state: 'Florida',
    county: 'Liberty',
    lat: 30.1524,
    lng: -84.9454,
    acres: 6043,
    contained: 50,
    started: '2026-03-17',
    updated: '2026-04-07T14:00:00Z',
    cause: 'Natural',
    status: 'active',
    personnel: 31,
    structures_threatened: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 1,
    dozers: 3,
    engines: 8,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-04-07T12:00:00Z', text: 'Fire held at 50% containment. Burning within the Apalachicola National Forest. Minimal structure threat.' },
    ],
  },
  // Sargent Fire – Florida, Polk County
  {
    id: 'FL-FFS-000217',
    name: 'Sargent Fire',
    state: 'Florida',
    county: 'Polk',
    lat: 27.6525,
    lng: -81.3506,
    acres: 2470,
    contained: 62,
    started: '2026-04-02',
    updated: '2026-04-08T07:00:00Z',
    cause: 'Undetermined',
    status: 'active',
    personnel: 119,
    structures_threatened: 12,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 1,
    air_tankers: 1,
    helicopters: 2,
    dozers: 6,
    engines: 22,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-04-08T06:00:00Z', text: 'Crews made overnight progress. Northern flank secured. Focus shifting to southeast corner with active spread.' },
      { time: '2026-04-05T16:00:00Z', text: 'Fire grew to 2,470 acres. Structure protection in place for 12 residences.' },
    ],
  },
  // Meadow View Fire – Texas Panhandle, Potter County
  {
    id: 'TX-TXS-000312',
    name: 'Meadow View Fire',
    state: 'Texas',
    county: 'Potter',
    lat: 35.4688,
    lng: -101.8323,
    acres: 800,
    contained: 60,
    started: '2026-04-06',
    updated: '2026-04-08T08:00:00Z',
    cause: 'Undetermined',
    status: 'active',
    personnel: 50,
    structures_threatened: 3,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 1,
    air_tankers: 0,
    helicopters: 1,
    dozers: 3,
    engines: 10,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-04-08T07:00:00Z', text: 'Containment improved to 60%. Favorable winds allowing progress on the western flank.' },
    ],
  },
  // Ashby Fire – Nebraska, Grant County
  {
    id: 'NE-NNF-000047',
    name: 'Ashby Fire',
    state: 'Nebraska',
    county: 'Grant',
    lat: 42.022,
    lng: -101.9278,
    acres: 36004,
    contained: 100,
    started: '2026-03-26',
    updated: '2026-04-02T08:00:00Z',
    cause: 'Undetermined',
    status: 'controlled',
    personnel: 83,
    structures_threatened: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 1,
    dozers: 5,
    engines: 12,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-04-02T08:00:00Z', text: 'Fire fully contained. Sandhills grassland fire; no structures impacted.' },
    ],
  },
  // Road 203 Fire – Nebraska, Thomas County
  {
    id: 'NE-NNF-000039',
    name: 'Road 203 Fire',
    state: 'Nebraska',
    county: 'Thomas',
    lat: 41.8466,
    lng: -100.4097,
    acres: 35892,
    contained: 100,
    started: '2026-03-12',
    updated: '2026-03-22T08:00:00Z',
    cause: 'Human',
    status: 'controlled',
    personnel: 29,
    structures_threatened: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 0,
    dozers: 4,
    engines: 8,
    url: 'https://inciweb.nwcg.gov/',
    updates: [
      { time: '2026-03-22T08:00:00Z', text: 'Fire fully contained. No structures lost in Nebraska Sandhills.' },
    ],
  },
];
