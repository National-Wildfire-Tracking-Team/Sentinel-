import { describe, it, expect, vi } from 'vitest';
import { applyLayerStack } from '../../src/app/components/Map/layers/layerStack';

/** Minimal map stub: a layer list that moveLayer(id) reorders to the top. */
function fakeMap(layers) {
  const map = {
    layers: [...layers],
    getStyle: () => ({ layers: map.layers }),
    moveLayer: vi.fn((id) => {
      const i = map.layers.findIndex((l) => l.id === id);
      const [layer] = map.layers.splice(i, 1);
      map.layers.push(layer);
    }),
  };
  return map;
}

const ids = (map) => map.layers.map((l) => l.id);

describe('applyLayerStack', () => {
  it('puts fire points, perimeters, evac zones, then NWS alerts on top of other data, under borders', () => {
    const map = fakeMap([
      { id: 'background' },
      { id: 'incident-locations-circle', source: 'incident-locations' },
      { id: 'evac-zones-fill', source: 'evac-zones' },
      { id: 'fire-perimeters-fill', source: 'fire-perimeters' },
      { id: 'weather-alerts-fill', source: 'weather-alerts' },
      { id: 'state-boundaries-line', source: 'state-boundaries' },
      // Mounted late (e.g. GOES switched on) — lands on top until restacked.
      { id: 'goes-raster', source: 'goes' },
      { id: 'fire-perimeter-centroids-circle', source: 'fire-perimeter-centroids' },
    ]);

    applyLayerStack(map);

    expect(ids(map)).toEqual([
      'background',
      'goes-raster',
      'weather-alerts-fill',
      'evac-zones-fill',
      'fire-perimeters-fill',
      'fire-perimeter-centroids-circle',
      'incident-locations-circle',
      'state-boundaries-line',
    ]);
  });

  it('keeps map tools above fire data and does nothing when already in order', () => {
    const map = fakeMap([
      { id: 'weather-alerts-fill', source: 'weather-alerts' },
      { id: 'incident-locations-circle', source: 'incident-locations' },
      { id: 'measure-line', source: 'measure-line' },
      { id: 'country-outlines-casing', source: 'country-outlines' },
      { id: 'country-outlines-line', source: 'country-outlines' },
    ]);

    applyLayerStack(map);

    expect(map.moveLayer).not.toHaveBeenCalled();
  });
});
