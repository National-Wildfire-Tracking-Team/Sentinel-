/**
 * makeGlm.js
 * Synthetic GLM-L2-LCFA files for the lightning-builder tests, written the way
 * NOAA does: packed unsigned int16 with scale/offset, time offsets "seconds
 * since" the file start, flashes only. Tests run offline.
 */

import h5wasm from 'h5wasm';

export const TIME_SCALE = 0.00038148;
export const TIME_OFFSET = -5.0;
export const ENERGY_SCALE = 9.99996e-16;
export const ENERGY_OFFSET = 2.8515e-16;
export const DEFAULT_START = Date.UTC(2026, 9, 18, 18, 49, 20);

export const h5 = await h5wasm.ready.then(({ FS }) => ({ File: h5wasm.File, FS }));

const pad = (n) => String(n).padStart(2, '0');
const stamp = (ms, sep) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}${sep}${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

function packed(f, name, values, scale, offset, units) {
  // Rounded to the stored step, then stored as uint16 bits in an int16 variable (NOAA's _Unsigned convention).
  const raw = Int16Array.from(values, (v) => {
    const u = Math.round((v - offset) / Math.fround(scale)) & 0xffff;
    return u > 0x7fff ? u - 0x10000 : u;
  });
  const ds = f.create_dataset({ name, data: raw });
  ds.create_attribute('scale_factor', new Float32Array([scale]));
  ds.create_attribute('add_offset', new Float32Array([offset]));
  ds.create_attribute('_Unsigned', 'true');
  ds.create_attribute('units', units);
}

let seq = 0;

/** flashes: [[lat, lon, seconds after start, energy J, quality flag]] → the file's bytes. */
export function makeGlm(flashes, { start = DEFAULT_START, platform = 'G19', subLon = -75.2 } = {}) {
  const col = (i) => flashes.map((f) => f[i]);
  const path = `/fixture-${(seq += 1)}.nc`;
  const f = new h5.File(path, 'w');
  f.create_dataset({ name: 'flash_lat', data: Float32Array.from(col(0)) });
  f.create_dataset({ name: 'flash_lon', data: Float32Array.from(col(1)) });
  packed(f, 'flash_time_offset_of_first_event', col(2), TIME_SCALE, TIME_OFFSET, `seconds since ${stamp(start, ' ')}.000`);
  packed(f, 'flash_energy', col(3), ENERGY_SCALE, ENERGY_OFFSET, 'J');
  const q = f.create_dataset({ name: 'flash_quality_flag', data: Int16Array.from(col(4)) });
  q.create_attribute('_Unsigned', 'true');
  f.create_dataset({ name: 'nominal_satellite_subpoint_lon', data: new Float32Array([subLon]), shape: [] });
  f.create_attribute('time_coverage_start', `${stamp(start, 'T')}.0Z`);
  f.create_attribute('time_coverage_end', `${stamp(start + 20_000, 'T')}.0Z`);
  f.create_attribute('platform_ID', platform);
  f.close();
  const bytes = h5.FS.readFile(path);
  h5.FS.unlink(path);
  return bytes;
}

/** A GLM object key for `sat` starting at `ms`, as NOAA names them. */
export function glmKey(sat, ms) {
  const id = { goes19: 'G19', goes18: 'G18' }[sat];
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const doy = String(Math.floor((ms - Date.UTC(year, 0, 1)) / 86_400_000) + 1).padStart(3, '0');
  const hh = pad(d.getUTCHours());
  return `GLM-L2-LCFA/${year}/${doy}/${hh}/OR_GLM-L2-LCFA_${id}_s${year}${doy}${hh}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}0_e0_c0.nc`;
}
