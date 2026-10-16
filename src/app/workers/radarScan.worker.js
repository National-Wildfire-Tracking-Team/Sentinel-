/**
 * radarScan.worker.js
 * Decodes a Level 3 scan and packs it for the GPU off the main thread, so the
 * bzip2 decode never stalls map panning.
 * In: { id, buffer: ArrayBuffer }
 * Out: { id, ok: true, scan, sweep } | { id, ok: false, error }
 */

/* global self */
import { decodeSweep } from '../utils/radarSweep';

self.onmessage = ({ data }) => {
  try {
    const { scan, sweep } = decodeSweep(data.buffer);
    self.postMessage(
      { id: data.id, ok: true, scan, sweep },
      [sweep.data.buffer, sweep.azIndex.buffer, sweep.palette.buffer],
    );
  } catch (err) {
    self.postMessage({ id: data.id, ok: false, error: err?.message || String(err) });
  }
};
