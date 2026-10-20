/**
 * WindParticles.jsx
 * Animated wind streaks over the model field, drawn on a canvas above the
 * map. Each particle is advected by the model's earth-relative u/v wind at
 * its position for the selected forecast hour, and leaves a fading trail.
 *
 * The wind comes from the builder's wind-vector frame (R = u, G = v, 8-bit,
 * ±range m/s; alpha 0 = no data), decoded once per frame change.
 *
 * Cost control: on a flat, north-up Mercator view (the Models tab) screen ↔
 * lon/lat is a linear map rebuilt once per view. Elsewhere (the globe, or a
 * rotated, pitched or terrain view on the other tabs) a coarse screen grid is
 * unprojected once per view and interpolated, with each cell's local east and
 * north screen directions, so there's still no per-particle projection call.
 * Particles pause while the map moves and are drawn once without animation
 * for reduced-motion users.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-map-gl';

const SPEED = 0.11; // screen px per frame per m/s
const FADE = 0.93; // trail persistence per frame
const AREA_PER_PARTICLE = 420; // px² per particle
const MAX_PARTICLES = 6000;
const GRID_PX = 16; // screen grid spacing for non-linear views
const M_PER_DEG = 111320;

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

async function loadVectors(url, signal) {
  const res = await fetch(url, { mode: 'cors', credentials: 'same-origin', signal });
  if (!res.ok) throw new Error(`wind frame HTTP ${res.status}`);
  const bitmap = await window.createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
}

export default function WindParticles({ url, coordinates, range = 50 }) {
  const { current } = useMap();
  const coordsKey = JSON.stringify(coordinates);
  const fieldRef = useRef(null);

  // Decode the wind frame whenever the forecast hour (url) changes.
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    loadVectors(url, controller.signal)
      .then((f) => { fieldRef.current = f; })
      .catch(() => {});
    return () => controller.abort();
  }, [url]);

  useEffect(() => {
    const map = current?.getMap();
    if (!map) return undefined;
    const [[west, north], , [east, south]] = coordinates;
    const yN = mercY(north);
    const yS = mercY(south);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    // Directly above the map's WebGL canvas, so markers and popups (later in
    // the same container) stay on top of the streaks.
    const gl = map.getCanvas();
    gl.parentNode.insertBefore(canvas, gl.nextSibling);
    const ctx = canvas.getContext('2d');

    let view = null;
    let particles = [];
    let raf = 0;
    let moving = false;

    const sample = (lng, lat) => {
      const f = fieldRef.current;
      if (!f || lng < west || lng > east || lat < south || lat > north) return null;
      const x = Math.min(f.width - 1, Math.floor(((lng - west) / (east - west)) * f.width));
      const y = Math.min(f.height - 1, Math.floor(((yN - mercY(lat)) / (yN - yS)) * f.height));
      const i = (y * f.width + x) * 4;
      if (f.data[i + 3] === 0) return null;
      return [((f.data[i] - 1) / 254) * 2 * range - range, ((f.data[i + 1] - 1) / 254) * 2 * range - range];
    };

    const setup = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      canvas.style.left = '0';
      canvas.style.top = '0';
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const linear = map.getProjection?.().name !== 'globe' && map.getBearing() === 0 && map.getPitch() === 0 && !map.getTerrain?.();
      view = linear ? linearView(w, h) : gridView(w, h);
      const n = Math.min(MAX_PARTICLES, Math.round((w * h) / AREA_PER_PARTICLE));
      particles = Array.from({ length: view ? n : 0 }, () => spawn());
      ctx.clearRect(0, 0, w, h);
    };

    // Flat, north-up Mercator: screen ↔ lon/lat is linear and east is +x, north is −y.
    const linearView = (w, h) => {
      const b = map.getBounds();
      const west = b.getWest();
      const east = b.getEast();
      const vN = mercY(b.getNorth());
      const vS = mercY(b.getSouth());
      return {
        w, h,
        toLngLat: (x, y) => [west + (x / w) * (east - west), invMercY(vN - (y / h) * (vN - vS))],
        move: (x, y, u, v, len) => [u * len, -v * len],
      };
    };

    // Anything else: unproject a coarse grid once, and per node keep the screen
    // step for 1 m east / north, scaled so streaks match the flat view's speed
    // at the screen centre (shorter toward the horizon or the globe's limb).
    const gridView = (w, h) => {
      const cols = Math.ceil(w / GRID_PX) + 1;
      const rows = Math.ceil(h / GRID_PX) + 1;
      const lng = new Float64Array(cols * rows).fill(NaN);
      const lat = new Float64Array(cols * rows).fill(NaN);
      const ex = new Float32Array(cols * rows);
      const ey = new Float32Array(cols * rows);
      const nx = new Float32Array(cols * rows);
      const ny = new Float32Array(cols * rows);
      const d = 0.01; // degrees
      const unitSteps = (ll) => {
        const p = map.project(ll);
        const pe = map.project([ll.lng + d, ll.lat]);
        const pn = map.project([ll.lng, Math.min(89.9, ll.lat + d)]);
        const me = d * M_PER_DEG * Math.max(0.01, Math.cos((ll.lat * Math.PI) / 180));
        const mn = d * M_PER_DEG;
        return [(pe.x - p.x) / me, (pe.y - p.y) / me, (pn.x - p.x) / mn, (pn.y - p.y) / mn];
      };
      const c = unitSteps(map.getCenter());
      const ref = Math.hypot(c[0], c[1]) || 1;
      for (let r = 0; r < rows; r += 1) {
        for (let q = 0; q < cols; q += 1) {
          const x = q * GRID_PX;
          const y = r * GRID_PX;
          const ll = map.unproject([x, y]);
          const back = ll && map.project(ll);
          // Off the globe or into the sky: the point doesn't round-trip.
          if (!back || Math.abs(back.x - x) > 2 || Math.abs(back.y - y) > 2) continue;
          const i = r * cols + q;
          const [a, b, e, f] = unitSteps(ll);
          lng[i] = ll.lng; lat[i] = ll.lat;
          ex[i] = a / ref; ey[i] = b / ref; nx[i] = e / ref; ny[i] = f / ref;
        }
      }
      const node = (x, y) => Math.round(y / GRID_PX) * cols + Math.round(x / GRID_PX);
      return {
        w, h,
        toLngLat: (x, y) => {
          const q = Math.floor(x / GRID_PX);
          const r = Math.floor(y / GRID_PX);
          if (q < 0 || r < 0 || q >= cols - 1 || r >= rows - 1) return null;
          const i = r * cols + q;
          const corners = [i, i + 1, i + cols, i + cols + 1];
          if (corners.some((k) => Number.isNaN(lng[k]))) return null;
          // Don't interpolate across the antimeridian.
          if (Math.max(...corners.map((k) => lng[k])) - Math.min(...corners.map((k) => lng[k])) > 180) return null;
          const tx = x / GRID_PX - q;
          const ty = y / GRID_PX - r;
          const mix = (arr) => (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + cols] * (1 - tx) + arr[i + cols + 1] * tx) * ty;
          return [mix(lng), mix(lat)];
        },
        move: (x, y, u, v, len) => {
          const i = node(x, y);
          return [(u * ex[i] + v * nx[i]) * len, (u * ey[i] + v * ny[i]) * len];
        },
      };
    };

    const spawn = () => ({ x: Math.random() * (view?.w ?? 0), y: Math.random() * (view?.h ?? 0), age: Math.floor(Math.random() * 90) + 30 });

    const step = (animate) => {
      if (!view) return;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0, 0, 0, ${animate ? FADE : 0})`;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const p of particles) {
        const ll = view.toLngLat(p.x, p.y);
        const uv = ll && sample(ll[0], ll[1]);
        if (!uv || p.age-- <= 0) {
          Object.assign(p, spawn());
          continue;
        }
        const len = animate ? SPEED : SPEED * 6; // static streaks for reduced motion
        const [dx, dy] = view.move(p.x, p.y, uv[0], uv[1], len);
        const nx = p.x + dx;
        const ny = p.y + dy;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        if (animate) {
          p.x = nx;
          p.y = ny;
        }
        if (p.x < 0 || p.y < 0 || p.x > view.w || p.y > view.h) Object.assign(p, spawn());
      }
      ctx.stroke();
    };

    const loop = () => {
      if (!moving) step(true);
      raf = requestAnimationFrame(loop);
    };

    const onMoveStart = () => {
      moving = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    const onMoveEnd = () => {
      moving = false;
      setup();
      if (reduced) step(false);
    };

    setup();
    // A projection or terrain change (switching map tabs) moves nothing, so re-measure once it has drawn.
    map.once('idle', onMoveEnd);
    if (reduced) {
      // Wait for the first wind frame, then draw once.
      const wait = setInterval(() => { if (fieldRef.current) { clearInterval(wait); step(false); } }, 200);
      map.on('movestart', onMoveStart);
      map.on('moveend', onMoveEnd);
      map.on('resize', onMoveEnd);
      return () => { clearInterval(wait); map.off('idle', onMoveEnd); map.off('movestart', onMoveStart); map.off('moveend', onMoveEnd); map.off('resize', onMoveEnd); canvas.remove(); };
    }
    raf = requestAnimationFrame(loop);
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('resize', onMoveEnd);
    return () => {
      cancelAnimationFrame(raf);
      map.off('idle', onMoveEnd);
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('resize', onMoveEnd);
      canvas.remove();
    };
  }, [current, coordsKey, range]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
