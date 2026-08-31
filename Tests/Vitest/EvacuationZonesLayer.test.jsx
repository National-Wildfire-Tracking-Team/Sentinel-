import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvacuationZonesLayer from '../../src/app/components/Map/layers/EvacuationZonesLayer';

const layerProps = [];

vi.mock('react-map-gl', () => ({
  Source: ({ children }) => children,
  Layer: (props) => {
    layerProps.push(props);
    return null;
  },
  useMap: () => ({ current: null }),
}));

beforeEach(() => {
  layerProps.length = 0;
});

describe('EvacuationZonesLayer', () => {
  it('keeps a distinct evacuation marker visible at every zoom', () => {
    render(
      <EvacuationZonesLayer
        visible
        geoJSON={{
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            id: 'zone-1',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-120, 35], [-119, 35], [-119, 36], [-120, 35]]],
            },
            properties: {
              warningType: 'Evacuation Order',
              zoneName: 'Zone 1',
              source: 'hosted',
            },
          }],
        }}
      />,
    );

    const marker = layerProps.find(({ id }) => id === 'evac-zones-dot');
    const halo = layerProps.find(({ id }) => id === 'evac-zones-dot-halo');
    const alert = layerProps.find(({ id }) => id === 'evac-zones-dot-alert');

    expect(marker).toBeDefined();
    expect(marker.maxzoom).toBeUndefined();
    expect(marker.layout.visibility).toBe('visible');
    expect(halo).toBeDefined();
    expect(alert.layout['text-field']).toBe('!');
  });
});