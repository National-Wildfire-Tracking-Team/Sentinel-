const IEM_NEXRAD_WMS = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi';
const IEM_NEXRAD_METADATA = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json';

export const RADAR_PRODUCT = 'NEXRAD N0Q Base Reflectivity';

const RADAR_PALETTE = [
  { rgb: [4, 233, 231], dbz: 10 },
  { rgb: [0, 157, 244], dbz: 17.5 },
  { rgb: [1, 197, 1], dbz: 25 },
  { rgb: [253, 248, 2], dbz: 35 },
  { rgb: [229, 188, 0], dbz: 42.5 },
  { rgb: [253, 149, 0], dbz: 47.5 },
  { rgb: [253, 0, 0], dbz: 52.5 },
  { rgb: [212, 0, 0], dbz: 57.5 },
  { rgb: [188, 0, 0], dbz: 62.5 },
  { rgb: [248, 0, 253], dbz: 70 },
];

export function classifyDbz(dbz) {
  if (dbz == null || !Number.isFinite(dbz)) return null;
  if (dbz < 15) return 'Very Light';
  if (dbz < 30) return 'Light Rain';
  if (dbz < 40) return 'Moderate Rain';
  if (dbz < 50) return 'Heavy Rain';
  if (dbz < 60) return 'Very Heavy Rain';
  if (dbz <= 70) return 'Severe Storm Core';
  return 'Extreme Reflectivity';
}

export function latLngToWebMercator(lat, lng) {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radius = 6378137;
  return {
    x: lng * (Math.PI / 180) * radius,
    y: Math.log(Math.tan(Math.PI / 4 + latitude * (Math.PI / 180) / 2)) * radius,
  };
}

export function buildRadarSampleUrl(lat, lng) {
  const { x, y } = latLngToWebMercator(lat, lng);
  const radius = 500;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: 'nexrad-n0q-900913',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    SRS: 'EPSG:3857',
    BBOX: `${x - radius},${y - radius},${x + radius},${y + radius}`,
    WIDTH: '3',
    HEIGHT: '3',
  });
  return `${IEM_NEXRAD_WMS}?${params}`;
}

export function radarColorToDbz(red, green, blue, alpha = 255) {
  if (alpha < 16) return null;

  let nearest = null;
  for (const entry of RADAR_PALETTE) {
    const distance = Math.hypot(
      red - entry.rgb[0],
      green - entry.rgb[1],
      blue - entry.rgb[2],
    );
    if (!nearest || distance < nearest.distance) nearest = { ...entry, distance };
  }

  return nearest && nearest.distance <= 165 ? nearest.dbz : null;
}

export function parseRadarMetadata(payload) {
  const meta = payload?.meta;
  if (!meta) return { scanTime: null, radarQuorum: null };
  const parsed = Date.parse(meta.valid);
  return {
    scanTime: Number.isNaN(parsed) ? null : new Date(parsed),
    radarQuorum: typeof meta.radar_quorum === 'string' ? meta.radar_quorum : null,
  };
}

async function decodeCenterPixel(blob) {
  const bitmap = await window.createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
}

export async function sampleRadarAtPoint(lat, lng, signal) {
  const [imageResponse, metadataResponse] = await Promise.all([
    fetch(buildRadarSampleUrl(lat, lng), { signal }),
    fetch(IEM_NEXRAD_METADATA, { signal }).catch(() => null),
  ]);
  if (!imageResponse.ok) throw new Error(`Radar WMS ${imageResponse.status}`);

  const pixel = await decodeCenterPixel(await imageResponse.blob());
  let metadata = { scanTime: null, radarQuorum: null };
  if (metadataResponse?.ok) metadata = parseRadarMetadata(await metadataResponse.json());

  return {
    dbz: radarColorToDbz(pixel[0], pixel[1], pixel[2], pixel[3]),
    product: RADAR_PRODUCT,
    ...metadata,
  };
}