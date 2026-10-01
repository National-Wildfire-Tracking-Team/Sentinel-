/**
 * WindParticles.jsx
 * Animated wind streaks over the model field, drawn on a canvas above the
 * map. Each particle is advected by the model's earth-relative u/v wind at
 * its position for the selected forecast hour, and leaves a fading trail.
 *
 * The wind comes from the builder's wind-vector frame (R = u, G = v, 8-bit,
 * ±range m/s; alpha 0 = no data), decoded once per frame change.
 *
 * Cost control: the Models map is flat Mercator, so screen ↔ lon/lat is a
 * linear map rebuilt once per view; there's no per-particle projection call.
 * Particles pause while the map moves, are hidden if the map is rotated or
 * pitched, and are drawn once without animation for reduced-motion users.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-map-gl';

const SPEED = 0.11; // screen px per frame per m/s
const FADE = 0.93; // trail persistence per frame
const AREA_PER_PARTICLE = 420; // px² per particle
const MAX_PARTICLES = 6000;

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
      const b = map.getBounds();
      // Rotated or pitched views break the linear screen ↔ Mercator map; skip particles there.
      view = map.getBearing() === 0 && map.getPitch() === 0
        ? { w, h, west: b.getWest(), east: b.getEast(), yN: mercY(b.getNorth()), yS: mercY(b.getSouth()) }
        : null;
      const n = Math.min(MAX_PARTICLES, Math.round((w * h) / AREA_PER_PARTICLE));
      particles = Array.from({ length: view ? n : 0 }, () => spawn());
      ctx.clearRect(0, 0, w, h);
    };

    const spawn = () => ({ x: Math.random() * (view?.w ?? 0), y: Math.random() * (view?.h ?? 0), age: Math.floor(Math.random() * 90) + 30 });
    const toLngLat = (x, y) => [view.west + (x / view.w) * (view.east - view.west), invMercY(view.yN - (y / view.h) * (view.yN - view.yS))];

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
        const [lng, lat] = toLngLat(p.x, p.y);
        const uv = sample(lng, lat);
        if (!uv || p.age-- <= 0) {
          Object.assign(p, spawn());
          continue;
        }
        const len = animate ? SPEED : SPEED * 6; // static streaks for reduced motion
        const nx = p.x + uv[0] * len;
        const ny = p.y - uv[1] * len; // north is up
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
    if (reduced) {
      // Wait for the first wind frame, then draw once.
      const wait = setInterval(() => { if (fieldRef.current) { clearInterval(wait); step(false); } }, 200);
      map.on('movestart', onMoveStart);
      map.on('moveend', onMoveEnd);
      map.on('resize', onMoveEnd);
      return () => { clearInterval(wait); map.off('movestart', onMoveStart); map.off('moveend', onMoveEnd); map.off('resize', onMoveEnd); canvas.remove(); };
    }
    raf = requestAnimationFrame(loop);
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('resize', onMoveEnd);
    return () => {
      cancelAnimationFrame(raf);
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('resize', onMoveEnd);
      canvas.remove();
    };
  }, [current, coordsKey, range]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
