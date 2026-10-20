/**
 * glm.mjs
 * Reads lightning flashes from one GOES GLM Level 2 file (GLM-L2-LCFA, the
 * "Lightning Cluster-Filter Algorithm" product): NetCDF-4, so HDF5, read with
 * h5wasm (the HDF5 C library compiled to WebAssembly). One file covers 20
 * seconds of one satellite's whole view.
 *
 * GLM reports events (single pixel flashes of light), groups (events in one
 * 2 ms frame) and flashes (groups close in space and time: what a person calls
 * one lightning flash). Only flashes are kept, with their position, the time of
 * their first light and their energy, and only those with quality flag 0.
 *
 * The packed variables follow the CF conventions NOAA uses: int16 storage
 * read as unsigned when `_Unsigned` is "true", then scale_factor/add_offset.
 * HDF5 doesn't apply those, so unpacked() does.
 *
 * h5wasm is injected (createGlmReader(h5wasm)) so this module runs unchanged
 * in Deno (npm:h5wasm) and in Vitest (node_modules).
 */

const SINCE = /seconds since (\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)/;
const ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/;

export class GlmError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GlmError';
  }
}

function attr(obj, name) {
  const a = obj.attrs?.[name];
  if (!a) return undefined;
  let v = a.value;
  if ((Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 1) v = v[0];
  if (v instanceof Uint8Array) v = new TextDecoder().decode(v);
  return v;
}

const asNumbers = (v) => (typeof v === 'number' ? [v] : Array.from(v ?? [], Number));

function unpacked(ds) {
  let raw = ds.value;
  if (typeof raw === 'number') raw = new Float64Array([raw]);
  if (attr(ds, '_Unsigned') === 'true') {
    if (raw instanceof Int16Array) raw = new Uint16Array(raw.buffer, raw.byteOffset, raw.length);
    else if (raw instanceof Int8Array) raw = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
    else if (raw instanceof Int32Array) raw = new Uint32Array(raw.buffer, raw.byteOffset, raw.length);
  }
  const scale = attr(ds, 'scale_factor');
  const offset = attr(ds, 'add_offset');
  const out = new Float64Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    let x = Number(raw[i]);
    if (scale !== undefined) x *= Number(scale);
    if (offset !== undefined) x += Number(offset);
    out[i] = x;
  }
  return out;
}

function epoch(units) {
  const m = SINCE.exec(units || '');
  if (!m) throw new GlmError(`unexpected time units ${JSON.stringify(units)}`);
  return Date.parse(`${m[1]}T${m[2]}Z`) / 1000;
}

/** "2026-10-18T18:49:20.0Z" → epoch seconds; null when absent or malformed (that shouldn't sink the file). */
function isoEpoch(s) {
  const m = ISO.exec(String(s ?? '').trim());
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}Z`);
  return Number.isFinite(ms) ? ms / 1000 + (m[3] ? Number(m[3]) : 0) : null;
}

// HDF5's superblock signature sits at 0, 512, 1024, 2048, … (after any user block).
const SIGNATURE = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
function looksLikeHdf5(bytes) {
  for (let at = 0; at + SIGNATURE.length <= bytes.length && at <= 4096; at = at ? at * 2 : 512) {
    if (SIGNATURE.every((b, i) => bytes[at + i] === b)) return true;
  }
  return false;
}

let seq = 0;

export function createGlmReader(h5wasm) {
  const { FS } = h5wasm;

  /**
   * One GLM-L2-LCFA file → its good-quality flashes:
   * { platform, subLon, start, end (epoch s), lat, lon, t (epoch s of first light), energy (J) } as Float64Arrays.
   */
  return function readFlashes(data) {
    if (!looksLikeHdf5(data)) throw new GlmError('not an HDF5 file');
    const path = `/glm-${(seq += 1)}.nc`;
    FS.writeFile(path, data);
    let f;
    try {
      try {
        f = new h5wasm.File(path, 'r');
      } catch (err) {
        throw new GlmError(`not an HDF5 file: ${err?.message ?? err}`);
      }
      if (!f.file_id || f.file_id < 0) throw new GlmError('not an HDF5 file');
      const get = (name) => {
        const ds = f.get(name);
        if (!ds) throw new GlmError(`missing variable '${name}'`);
        return ds;
      };
      const lat = Float64Array.from(asNumbers(get('flash_lat').value));
      const lon = Float64Array.from(asNumbers(get('flash_lon').value));
      const offsets = get('flash_time_offset_of_first_event');
      const base = epoch(attr(offsets, 'units'));
      const t = unpacked(offsets).map((x) => base + x);
      const energy = unpacked(get('flash_energy'));
      const quality = asNumbers(get('flash_quality_flag').value);
      const subLon = Number(asNumbers(get('nominal_satellite_subpoint_lon').value)[0]);
      const start = isoEpoch(attr(f, 'time_coverage_start'));
      const end = isoEpoch(attr(f, 'time_coverage_end'));
      const platform = attr(f, 'platform_ID') ?? null;

      if (!(lat.length === lon.length && lon.length === t.length && t.length === energy.length && energy.length === quality.length)) {
        throw new GlmError('flash arrays differ in length');
      }
      const keep = [];
      for (let i = 0; i < lat.length; i++) {
        if (quality[i] === 0 && Number.isFinite(lat[i]) && Number.isFinite(lon[i]) && Math.abs(lat[i]) <= 90 && Math.abs(lon[i]) <= 180) keep.push(i);
      }
      const pick = (a) => Float64Array.from(keep, (i) => a[i]);
      return { platform, subLon, start, end, lat: pick(lat), lon: pick(lon), t: pick(t), energy: pick(energy) };
    } finally {
      try { f?.close(); } catch { /* already closed or never opened */ }
      try { FS.unlink(path); } catch { /* not written */ }
    }
  };
}
