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
  it('renders the zone polygon fill, outline, and label — visible at the given zoom', () => {
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

    const fill = layerProps.find(({ id }) => id === 'evac-zones-fill');
    const line = layerProps.find(({ id }) => id === 'evac-zones-line');
    const label = layerProps.find(({ id }) => id === 'evac-zones-label');

    expect(fill).toBeDefined();
    expect(fill.layout.visibility).toBe('visible');
    expect(line).toBeDefined();
    expect(label).toBeDefined();
  });

  it('does not render a centroid dot/halo/"!" marker for zones — polygons only', () => {
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

    expect(layerProps.find(({ id }) => id === 'evac-zones-dot')).toBeUndefined();
    expect(layerProps.find(({ id }) => id === 'evac-zones-dot-halo')).toBeUndefined();
    expect(layerProps.find(({ id }) => id === 'evac-zones-dot-alert')).toBeUndefined();
  });

  it('hides all polygon layers when visible is false', () => {
    render(
      <EvacuationZonesLayer
        visible={false}
        geoJSON={{
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            id: 'zone-1',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-120, 35], [-119, 35], [-119, 36], [-120, 35]]],
            },
            properties: { warningType: 'Evacuation Order', zoneName: 'Zone 1', source: 'hosted' },
          }],
        }}
      />,
    );

    const fill = layerProps.find(({ id }) => id === 'evac-zones-fill');
    expect(fill.layout.visibility).toBe('none');
  });
});
