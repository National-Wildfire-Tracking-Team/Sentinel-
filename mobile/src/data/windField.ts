/**
 * The wind field behind Wind Particles (the web's WindParticlesOverlay): the current HRRR run's
 * wind-vector frame for the hour nearest now, from Sentinel's weather-model fields on AWS. Each
 * pixel holds earth-relative u (R) and v (G) as 8-bit, ±range m/s; alpha 0 is no data.
 */
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

import { fetchJson } from './arcgisQuery';

const FIELDS = 'https://d17msnxo4ql3yx.cloudfront.net/weather-models/fields/v1';

export interface WindField {
  width: number;
  height: number;
  /** m/s per pixel, row-major from the north-west corner; NaN where there is no data. */
  u: number[];
  v: number[];
  west: number;
  east: number;
  /** Mercator y (radians) of the north and south edges. */
  mercN: number;
  mercS: number;
  validTime: string;
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

export async function fetchWindField(model: 'hrrr' | 'gfs' = 'hrrr', now = Date.now()): Promise<WindField> {
  const manifest = await fetchJson(`${FIELDS}/manifest.json`);
  const m = manifest?.models?.[model];
  const cur = m?.current;
  if (!m?.wind || !cur?.validTimes?.length) throw new Error('No wind field in the model manifest');
  // The hour whose valid time is nearest now.
  let best = 0;
  cur.validTimes.forEach((t: string, i: number) => {
    if (Math.abs(Date.parse(t) - now) < Math.abs(Date.parse(cur.validTimes[best]) - now)) best = i;
  });
  const hour = String(cur.hours[best]).padStart(3, '0');
  const data = await Skia.Data.fromURI(`${FIELDS}/${model}/${cur.id}/wind/${hour}.png`);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Wind frame could not be decoded');
  const width = image.width();
  const height = image.height();
  const px = image.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!px) throw new Error('Wind frame could not be read');
  const range = Number(m.wind.range) || 50;
  const u = new Array<number>(width * height);
  const v = new Array<number>(width * height);
  for (let i = 0; i < width * height; i++) {
    if (px[i * 4 + 3] === 0) {
      u[i] = NaN;
      v[i] = NaN;
    } else {
      u[i] = ((px[i * 4] - 1) / 254) * 2 * range - range;
      v[i] = ((px[i * 4 + 1] - 1) / 254) * 2 * range - range;
    }
  }
  const [[west, north], , [east, south]] = m.wind.coordinates;
  return { width, height, u, v, west, east, mercN: mercY(north), mercS: mercY(south), validTime: cur.validTimes[best] };
}
