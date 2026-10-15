import { describe, it, expect } from 'vitest';
import { conusViewport, conusPadding, conusFitStep, CONUS_BOUNDS, CONUS_OUTLINE } from '../../src/app/utils/conusView';

// Pixel x/y of a lng/lat on a 512 px-tile Web Mercator map at the given camera.
function project([lng, lat], { longitude, latitude, zoom }, width, height) {
  const scale = 512 * 2 ** zoom;
  const x = (l) => ((l + 180) / 360) * scale;
  const y = (a) => {
    const s = Math.sin((a * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  };
  return [width / 2 + x(lng) - x(longitude), height / 2 + y(lat) - y(latitude)];
}

describe('conusViewport', () => {
  for (const [width, height] of [[1440, 836], [1024, 700], [390, 780], [2560, 1300]]) {
    it(`keeps the lower 48 fully in view and centered at ${width}×${height}`, () => {
      const cam = conusViewport(width, height);
      const pad = conusPadding();
      const [[w, s], [e, n]] = CONUS_BOUNDS;
      const [left, top] = project([w, n], cam, width, height);
      const [right, bottom] = project([e, s], cam, width, height);
      expect(left).toBeGreaterThanOrEqual(pad.left - 1);
      expect(right).toBeLessThanOrEqual(width - pad.right + 1);
      expect(top).toBeGreaterThanOrEqual(pad.top - 1);
      expect(bottom).toBeLessThanOrEqual(height - pad.bottom + 1);
      // Centered between the header (map top) and the bottom bar.
      expect(Math.abs((left + right) / 2 - width / 2)).toBeLessThan(1);
      expect(Math.abs((top + bottom) / 2 - (pad.top + height - pad.bottom) / 2)).toBeLessThan(1);
      // Tight: the limiting side touches its margin.
      const slack = Math.min(left - pad.left, width - pad.right - right, top - pad.top, height - pad.bottom - bottom);
      expect(slack).toBeLessThan(1);
      expect(cam.longitude).toBeCloseTo((w + e) / 2, 5);
    });
  }
});

// A stand-in for the live map: Web Mercator at the given camera.
function fakeMap(cam, width, height) {
  const scale = () => 512 * 2 ** cam.zoom;
  const mx = (l) => ((l + 180) / 360) * scale();
  const my = (a) => {
    const s = Math.sin((a * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale();
  };
  return {
    getContainer: () => ({ getBoundingClientRect: () => ({ width, height }) }),
    getZoom: () => cam.zoom,
    project: ([lng, lat]) => ({ x: width / 2 + mx(lng) - mx(cam.longitude), y: height / 2 + my(lat) - my(cam.latitude) }),
    unproject: ([x, y]) => {
      const X = mx(cam.longitude) + x - width / 2;
      const Y = my(cam.latitude) + y - height / 2;
      const lng = (X / scale()) * 360 - 180;
      const lat = (360 / Math.PI) * Math.atan(Math.exp((0.5 - Y / scale()) * 2 * Math.PI)) - 90;
      return { lng, lat };
    },
  };
}

describe('conusFitStep', () => {
  it('converges on the outline filling the band between the header and the bottom bar', () => {
    const width = 1440;
    const height = 844;
    const pad = conusPadding(70);
    const cam = { longitude: -100, latitude: 40, zoom: 3 };
    const map = fakeMap(cam, width, height);
    let step;
    for (let i = 0; i < 6; i += 1) {
      step = conusFitStep(map, pad);
      if (step.done) break;
      Object.assign(cam, step.camera);
    }
    expect(step.done).toBe(true);
    const pts = CONUS_OUTLINE.map((p) => map.project(p));
    const ys = pts.map((p) => p.y);
    const xs = pts.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(pad.left - 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width - pad.right + 2);
    // Tall enough screen → height limits: touches the header and the bar.
    expect(Math.min(...ys)).toBeCloseTo(pad.top, -0.5);
    expect(Math.max(...ys)).toBeCloseTo(height - pad.bottom, -0.5);
  });

  it('returns null when there is no room', () => {
    expect(conusFitStep(fakeMap({ longitude: 0, latitude: 0, zoom: 3 }, 10, 10), conusPadding(70))).toBeNull();
  });
});
