/**
 * radarSiteRender.js
 * Level 3 bytes → decoded scan summary + GPU sweep (radarSweep.js), in
 * radarScan.worker.js when Workers are available, else on the main thread.
 */

import { decodeSweep } from './radarSweep';

let worker;
let workerFailed = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker || workerFailed) return worker;
  if (typeof Worker === 'undefined') {
    workerFailed = true;
    return undefined;
  }
  try {
    worker = new Worker(new URL('../workers/radarScan.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.ok) job.resolve({ scan: data.scan, sweep: data.sweep });
      else job.reject(new Error(data.error));
    };
    worker.onerror = () => {
      // Worker can't load (e.g. blocked by CSP): fall back to the main thread.
      workerFailed = true;
      worker = undefined;
      for (const job of pending.values()) job.fallback();
      pending.clear();
    };
  } catch {
    workerFailed = true;
    worker = undefined;
  }
  return worker;
}

/** Start the worker ahead of the first scan, so the first station click doesn't pay its startup. */
export function warmRadarScanWorker() {
  getWorker();
}

/**
 * Decode a scan and pack it for the GPU.
 * @param {ArrayBuffer} buffer  raw Level 3 file
 * @returns {Promise<{ scan: object, sweep: object }>}
 */
export function decodeSweepAsync(buffer) {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => decodeSweep(buffer));
  const copy = buffer.slice(0); // the original is transferred; this one backs the fallback
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {
      resolve,
      reject,
      fallback: () => { try { resolve(decodeSweep(copy)); } catch (e) { reject(e); } },
    });
    w.postMessage({ id, buffer }, [buffer]);
  });
}
