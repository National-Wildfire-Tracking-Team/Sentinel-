/**
 * Animated wind streaks over the map, after the web's WindParticles.jsx: particles advected by the
 * model wind at their position, leaving fading trails (about one per 420 px², 0.11 px per frame
 * per m/s, trails kept at 93% per frame). They pause while the map moves and are drawn once,
 * without animation, for people who prefer reduced motion.
 *
 * Drawing happens on the UI thread: a Reanimated frame callback steps the particles and paints
 * into an offscreen Skia surface whose snapshot a Skia Canvas shows above the map. Screen ↔ map is
 * the flat Web Mercator transform from the settled camera (centre, zoom, bearing); a pitched map
 * shows no particles.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, PixelRatio } from 'react-native';
import { BlendMode, Canvas, Image, PaintStyle, Skia, StrokeCap, type SkImage } from '@shopify/react-native-skia';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import type { WindField } from '@/data/windField';

const SPEED = 0.11;
const FADE = 0.93;
const AREA_PER_PARTICLE = 420;
const MAX_PARTICLES = 6000;
const TILE = 512;

export interface WindView {
  center: [number, number];
  zoom: number;
  heading: number;
  pitch: number;
}

interface ViewState {
  version: number;
  w: number;
  h: number;
  /** Map centre in world pixels at this zoom, and the world size. */
  cx: number;
  cy: number;
  scale: number;
  cos: number;
  sin: number;
}

export function WindParticles({ field, view, moving }: { field: WindField | null; view: WindView | null; moving: boolean }) {
  const { width: w, height: h } = useWindowDimensions();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  const image = useSharedValue<SkImage | null>(null);
  const fieldSv = useSharedValue<WindField | null>(null);
  const viewSv = useSharedValue<ViewState | null>(null);
  const paused = useSharedValue(true);
  const reducedSv = useSharedValue(false);
  const state = useSharedValue<any>(null);

  useEffect(() => {
    fieldSv.value = field;
  }, [field, fieldSv]);
  useEffect(() => {
    reducedSv.value = reduced;
  }, [reduced, reducedSv]);
  useEffect(() => {
    paused.value = moving || !view || view.pitch > 1;
    if (!view || moving) return;
    const scale = TILE * 2 ** view.zoom;
    const [lng, lat] = view.center;
    const latR = (lat * Math.PI) / 180;
    const b = (view.heading * Math.PI) / 180;
    viewSv.value = {
      version: (viewSv.value?.version ?? 0) + 1,
      w,
      h,
      cx: ((lng + 180) / 360) * scale,
      cy: ((Math.PI - Math.log(Math.tan(Math.PI / 4 + latR / 2))) / (2 * Math.PI)) * scale,
      scale,
      cos: Math.cos(b),
      sin: Math.sin(b),
    };
  }, [view, moving, w, h, paused, viewSv]);

  const density = PixelRatio.get();

  useFrameCallback(() => {
    'worklet';
    const f = fieldSv.value;
    const v = viewSv.value;
    if (paused.value || !f || !v) {
      if (image.value) image.value = null;
      if (state.value) state.value.version = -1;
      return;
    }
    let st = state.value;
    if (!st || st.version !== v.version || st.field !== f.validTime) {
      const surface = Skia.Surface.MakeOffscreen(Math.round(v.w * density), Math.round(v.h * density));
      if (!surface) return;
      const n = Math.min(MAX_PARTICLES, Math.round((v.w * v.h) / AREA_PER_PARTICLE));
      const px: number[] = [];
      const py: number[] = [];
      const age: number[] = [];
      for (let i = 0; i < n; i++) {
        px.push(Math.random() * v.w);
        py.push(Math.random() * v.h);
        age.push(Math.floor(Math.random() * 90) + 30);
      }
      const stroke = Skia.Paint();
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(1.1 * density);
      stroke.setStrokeCap(StrokeCap.Round);
      stroke.setColor(Skia.Color('rgba(255,255,255,0.75)'));
      stroke.setAntiAlias(true);
      const fade = Skia.Paint();
      fade.setBlendMode(BlendMode.DstIn);
      fade.setColor(Skia.Color(`rgba(0,0,0,${FADE})`));
      st = { version: v.version, field: f.validTime, surface, px, py, age, stroke, fade, drawn: false };
      state.value = st;
    }
    if (reducedSv.value && st.drawn) return;
    const animate = !reducedSv.value;

    const canvas = st.surface.getCanvas();
    if (animate) canvas.drawPaint(st.fade);
    const path = Skia.PathBuilder.Make();
    const len = animate ? SPEED : SPEED * 6;
    const yN = f.mercN;
    const yS = f.mercS;
    for (let i = 0; i < st.px.length; i++) {
      const x = st.px[i];
      const y = st.py[i];
      // Screen → world pixels (rotated by the bearing) → lng and Mercator y.
      const dx = x - v.w / 2;
      const dy = y - v.h / 2;
      const wx = v.cx + dx * v.cos - dy * v.sin;
      const wy = v.cy + dx * v.sin + dy * v.cos;
      const lng = (wx / v.scale) * 360 - 180;
      const my = Math.PI - (2 * Math.PI * wy) / v.scale;
      let u = NaN;
      let vv = NaN;
      if (lng >= f.west && lng <= f.east && my <= yN && my >= yS) {
        const fx = Math.min(f.width - 1, Math.floor(((lng - f.west) / (f.east - f.west)) * f.width));
        const fy = Math.min(f.height - 1, Math.floor(((yN - my) / (yN - yS)) * f.height));
        u = f.u[fy * f.width + fx];
        vv = f.v[fy * f.width + fx];
      }
      st.age[i] -= 1;
      if (u !== u || vv !== vv || st.age[i] <= 0) {
        st.px[i] = Math.random() * v.w;
        st.py[i] = Math.random() * v.h;
        st.age[i] = Math.floor(Math.random() * 90) + 30;
        continue;
      }
      // East is +x and north is −y in world pixels; back to screen through the bearing.
      const wdx = u * len;
      const wdy = -vv * len;
      const nx = x + wdx * v.cos + wdy * v.sin;
      const ny = y - wdx * v.sin + wdy * v.cos;
      path.moveTo(x * density, y * density);
      path.lineTo(nx * density, ny * density);
      if (animate) {
        st.px[i] = nx;
        st.py[i] = ny;
      }
      if (st.px[i] < 0 || st.py[i] < 0 || st.px[i] > v.w || st.py[i] > v.h) {
        st.px[i] = Math.random() * v.w;
        st.py[i] = Math.random() * v.h;
        st.age[i] = Math.floor(Math.random() * 90) + 30;
      }
    }
    canvas.drawPath(path.detach(), st.stroke);
    st.surface.flush();
    st.drawn = true;
    const previous = image.value;
    image.value = st.surface.makeImageSnapshot();
    if (previous) previous.dispose();
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image image={image} x={0} y={0} width={w} height={h} />
    </Canvas>
  );
}
