/**
 * textProducts.js
 * Choices for the AWC text products read in the drawer (AwcControls), from
 * the endpoint enums in AWC's OpenAPI spec, and the NWS offices whose
 * aviation forecast discussions /fcstdisc serves.
 */

/** /windtemp `region` */
export const WINDTEMP_REGIONS = [
  { value: 'us', label: 'All lower 48' },
  { value: 'bos', label: 'Northeast' },
  { value: 'mia', label: 'Southeast' },
  { value: 'chi', label: 'North central' },
  { value: 'dfw', label: 'South central' },
  { value: 'slc', label: 'Rocky Mountains' },
  { value: 'sfo', label: 'Pacific Coast' },
  { value: 'alaska', label: 'Alaska' },
  { value: 'hawaii', label: 'Hawaii' },
  { value: 'other_pac', label: 'Western Pacific' },
];

/** /windtemp `level`: low = 3,000–39,000 ft, high = 45,000–53,000 ft. */
export const WINDTEMP_LEVELS = [
  { value: 'low', label: 'Low (3–39k ft)' },
  { value: 'high', label: 'High (45–53k ft)' },
];

/** /windtemp `fcst`: forecast cycle, hours ahead. */
export const WINDTEMP_FORECASTS = [
  { value: '06', label: '6 h' },
  { value: '12', label: '12 h' },
  { value: '24', label: '24 h' },
];

/** /areafcst `region` (Alaska only; CONUS area forecasts ended in 2017). */
export const AREAFCST_REGIONS = [
  { value: 'aknorth', label: 'Northern Alaska' },
  { value: 'akcentral', label: 'Interior Alaska' },
  { value: 'akaleutian', label: 'Aleutians' },
  { value: 'aksouth', label: 'Southcentral' },
  { value: 'aksouthwest', label: 'Alaska Peninsula' },
  { value: 'aksoutheast', label: 'Eastern Gulf of Alaska' },
  { value: 'akpanhandle', label: 'Panhandle' },
];

/** /fcstdisc `type` */
export const FCSTDISC_TYPES = [
  { value: 'afd', label: 'Aviation section' },
  { value: 'af', label: 'Full discussion' },
];

/**
 * NWS Weather Forecast Offices: 4-letter id (/fcstdisc `cwa`), city, and the
 * office's approximate location, used only to pick the office nearest the
 * map's center as the default.
 */
export const NWS_OFFICES = [
  ['KABQ', 'Albuquerque, NM', 35.04, -106.62], ['KABR', 'Aberdeen, SD', 45.46, -98.41],
  ['PAFC', 'Anchorage, AK', 61.16, -150.0], ['KAKQ', 'Wakefield, VA', 36.98, -77.01],
  ['KALY', 'Albany, NY', 42.75, -73.8], ['KAMA', 'Amarillo, TX', 35.23, -101.71],
  ['KAPX', 'Gaylord, MI', 44.91, -84.72], ['KARX', 'La Crosse, WI', 43.82, -91.19],
  ['KBGM', 'Binghamton, NY', 42.21, -75.98], ['KBIS', 'Bismarck, ND', 46.77, -100.76],
  ['KBMX', 'Birmingham, AL', 33.18, -86.78], ['KBOI', 'Boise, ID', 43.57, -116.21],
  ['KBOU', 'Denver/Boulder, CO', 39.99, -105.26], ['KBOX', 'Boston/Norton, MA', 41.96, -71.14],
  ['KBRO', 'Brownsville, TX', 25.92, -97.42], ['KBTV', 'Burlington, VT', 44.47, -73.15],
  ['KBUF', 'Buffalo, NY', 42.94, -78.72], ['KBYZ', 'Billings, MT', 45.75, -108.57],
  ['KCAE', 'Columbia, SC', 33.94, -81.12], ['KCAR', 'Caribou, ME', 46.87, -68.02],
  ['KCHS', 'Charleston, SC', 32.9, -80.03], ['KCLE', 'Cleveland, OH', 41.41, -81.86],
  ['KCRP', 'Corpus Christi, TX', 27.78, -97.51], ['KCTP', 'State College, PA', 40.79, -77.86],
  ['KCYS', 'Cheyenne, WY', 41.15, -104.81], ['KDDC', 'Dodge City, KS', 37.76, -99.97],
  ['KDLH', 'Duluth, MN', 46.84, -92.21], ['KDMX', 'Des Moines, IA', 41.73, -93.72],
  ['KDTX', 'Detroit, MI', 42.7, -83.47], ['KDVN', 'Quad Cities, IA', 41.61, -90.58],
  ['KEAX', 'Kansas City, MO', 38.81, -94.26], ['KEKA', 'Eureka, CA', 40.81, -124.16],
  ['KEPZ', 'El Paso, TX', 31.87, -106.7], ['KEWX', 'Austin/San Antonio, TX', 29.7, -98.03],
  ['PAFG', 'Fairbanks, AK', 64.86, -147.85], ['KFFC', 'Atlanta, GA', 33.36, -84.57],
  ['KFGF', 'Grand Forks, ND', 47.92, -97.09], ['KFGZ', 'Flagstaff, AZ', 35.23, -111.82],
  ['KFSD', 'Sioux Falls, SD', 43.59, -96.73], ['KFWD', 'Dallas/Fort Worth, TX', 32.83, -97.3],
  ['KGGW', 'Glasgow, MT', 48.21, -106.63], ['KGID', 'Hastings, NE', 40.65, -98.38],
  ['KGJT', 'Grand Junction, CO', 39.12, -108.53], ['KGLD', 'Goodland, KS', 39.37, -101.7],
  ['KGRB', 'Green Bay, WI', 44.5, -88.11], ['KGRR', 'Grand Rapids, MI', 42.89, -85.54],
  ['KGSP', 'Greenville-Spartanburg, SC', 34.88, -82.22], ['PGUM', 'Guam', 13.48, 144.8],
  ['KGYX', 'Gray/Portland, ME', 43.89, -70.26], ['PHFO', 'Honolulu, HI', 21.3, -157.82],
  ['KHGX', 'Houston/Galveston, TX', 29.47, -95.08], ['KHNX', 'Hanford, CA', 36.31, -119.63],
  ['KHUN', 'Huntsville, AL', 34.72, -86.64], ['KICT', 'Wichita, KS', 37.65, -97.43],
  ['KILM', 'Wilmington, NC', 34.28, -77.91], ['KILN', 'Wilmington, OH', 39.42, -83.82],
  ['KILX', 'Lincoln, IL', 40.15, -89.34], ['KIND', 'Indianapolis, IN', 39.71, -86.28],
  ['KIWX', 'Northern Indiana', 41.36, -85.7], ['KJAN', 'Jackson, MS', 32.32, -90.08],
  ['KJAX', 'Jacksonville, FL', 30.48, -81.7], ['PAJK', 'Juneau, AK', 58.36, -134.56],
  ['KJKL', 'Jackson, KY', 37.59, -83.32], ['KKEY', 'Key West, FL', 24.55, -81.79],
  ['KLBF', 'North Platte, NE', 41.13, -100.68], ['KLCH', 'Lake Charles, LA', 30.13, -93.22],
  ['KLIX', 'New Orleans, LA', 30.34, -89.83], ['KLKN', 'Elko, NV', 40.86, -115.74],
  ['KLMK', 'Louisville, KY', 38.11, -85.65], ['KLOT', 'Chicago, IL', 41.6, -88.08],
  ['KLOX', 'Los Angeles, CA', 34.2, -119.18], ['KLSX', 'St. Louis, MO', 38.7, -90.68],
  ['KLUB', 'Lubbock, TX', 33.53, -101.88], ['KLWX', 'Baltimore/Washington', 38.98, -77.49],
  ['KLZK', 'Little Rock, AR', 34.83, -92.26], ['KMAF', 'Midland/Odessa, TX', 31.94, -102.19],
  ['KMEG', 'Memphis, TN', 35.13, -89.8], ['KMFL', 'Miami, FL', 25.75, -80.38],
  ['KMFR', 'Medford, OR', 42.38, -122.88], ['KMHX', 'Newport/Morehead City, NC', 34.78, -76.88],
  ['KMKX', 'Milwaukee, WI', 42.97, -88.55], ['KMLB', 'Melbourne, FL', 28.11, -80.65],
  ['KMOB', 'Mobile, AL', 30.68, -88.24], ['KMPX', 'Minneapolis, MN', 44.85, -93.57],
  ['KMQT', 'Marquette, MI', 46.53, -87.55], ['KMRX', 'Morristown, TN', 36.17, -83.4],
  ['KMSO', 'Missoula, MT', 46.92, -114.09], ['KMTR', 'San Francisco Bay Area, CA', 36.59, -121.86],
  ['KOAX', 'Omaha, NE', 41.32, -96.37], ['KOHX', 'Nashville, TN', 36.25, -86.56],
  ['KOKX', 'New York, NY', 40.87, -72.86], ['KOTX', 'Spokane, WA', 47.68, -117.63],
  ['KOUN', 'Norman, OK', 35.18, -97.44], ['KPAH', 'Paducah, KY', 37.07, -88.77],
  ['KPBZ', 'Pittsburgh, PA', 40.53, -80.22], ['KPDT', 'Pendleton, OR', 45.69, -118.85],
  ['KPHI', 'Philadelphia/Mount Holly, NJ', 39.97, -74.82], ['KPIH', 'Pocatello, ID', 42.91, -112.6],
  ['KPQR', 'Portland, OR', 45.56, -122.54], ['KPSR', 'Phoenix, AZ', 33.44, -112.02],
  ['KPUB', 'Pueblo, CO', 38.28, -104.52], ['KRAH', 'Raleigh, NC', 35.77, -78.68],
  ['KREV', 'Reno, NV', 39.57, -119.8], ['KRIW', 'Riverton, WY', 43.06, -108.48],
  ['KRLX', 'Charleston, WV', 38.31, -81.72], ['KRNK', 'Blacksburg, VA', 37.2, -80.41],
  ['KSEW', 'Seattle, WA', 47.69, -122.26], ['KSGF', 'Springfield, MO', 37.23, -93.4],
  ['KSGX', 'San Diego, CA', 32.85, -117.12], ['KSHV', 'Shreveport, LA', 32.45, -93.84],
  ['KSJT', 'San Angelo, TX', 31.37, -100.49], ['TJSJ', 'San Juan, PR', 18.43, -66.0],
  ['KSLC', 'Salt Lake City, UT', 40.77, -111.95], ['KSTO', 'Sacramento, CA', 38.6, -121.38],
  ['KTAE', 'Tallahassee, FL', 30.45, -84.3], ['KTBW', 'Tampa Bay, FL', 27.7, -82.4],
  ['KTFX', 'Great Falls, MT', 47.46, -111.38], ['KTOP', 'Topeka, KS', 39.07, -95.63],
  ['KTSA', 'Tulsa, OK', 36.15, -95.86], ['KTWC', 'Tucson, AZ', 32.23, -110.95],
  ['KUNR', 'Rapid City, SD', 44.07, -103.21], ['KVEF', 'Las Vegas, NV', 36.05, -115.18],
].map(([id, name, lat, lon]) => ({ id, name, lat, lon }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** The office nearest a point (great-circle), or null without a point. */
export function nearestOffice(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rad = Math.PI / 180;
  let best = null;
  let bestD = Infinity;
  for (const o of NWS_OFFICES) {
    const dLat = (o.lat - lat) * rad;
    const dLon = (o.lon - lon) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(o.lat * rad) * Math.sin(dLon / 2) ** 2;
    if (a < bestD) { bestD = a; best = o; }
  }
  return best;
}
