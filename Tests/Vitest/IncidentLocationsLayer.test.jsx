import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import IncidentLocationsLayer, {
  CLUSTER_FILL_COLOR,
  CLUSTER_ACTIVE_RING_COLOR,
  CLUSTER_CONTAINED_RING_COLOR,
} from '../../src/app/components/Map/layers/IncidentLocationsLayer';

// react-map-gl needs a real map, so record the props each Source/Layer gets.
const sources = [];
const layers = [];
vi.mock('react-map-gl', () => ({
  Source: (props) => {
    sources.push(props);
    return <>{props.children}</>;
  },
  Layer: (props) => {
    layers.push(props);
    return null;
  },
}));

const point = (acres, contained = 0) => ({
  type: 'Feature',
  properties: { acres, contained, name: `Fire ${acres}` },
  geometry: { type: 'Point', coordinates: [-120, 38] },
});

const layerById = (id) => layers.find((l) => l.id === id);

beforeEach(() => {
  sources.length = 0;
  layers.length = 0;
});

describe('IncidentLocationsLayer clustering', () => {
  it('clusters the incident source', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible />);
    const source = sources[0];
    expect(source.cluster).toBe(true);
    expect(source.clusterMaxZoom).toBe(8);
    expect(source.clusterRadius).toBeGreaterThan(0);
    expect(source.clusterProperties).toHaveProperty('activeCount');
  });

  it('drops fires under 0.4 acres before clustering so bubbles do not count them', () => {
    const geoJSON = { type: 'FeatureCollection', features: [point(0.1), point(0.4), point(250)] };
    render(<IncidentLocationsLayer geoJSON={geoJSON} visible />);
    expect(sources[0].data.features.map((f) => f.properties.acres)).toEqual([0.4, 250]);
  });

  it('handles missing data', () => {
    render(<IncidentLocationsLayer geoJSON={null} visible />);
    expect(sources[0].data.features).toEqual([]);
  });

  it('draws a count bubble and label for clusters', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible />);
    expect(layerById('incident-locations-cluster').filter).toEqual(['has', 'point_count']);
    const count = layerById('incident-locations-cluster-count');
    expect(count.filter).toEqual(['has', 'point_count']);
    expect(count.layout['text-field']).toEqual(['get', 'point_count_abbreviated']);
  });

  it('styles bubbles with a dark fill and a status ring, distinct from containment dot colors', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible />);
    const { paint } = layerById('incident-locations-cluster');
    expect(paint['circle-color']).toBe(CLUSTER_FILL_COLOR);
    expect(paint['circle-stroke-color']).toEqual(
      ['case', ['>', ['get', 'activeCount'], 0], CLUSTER_ACTIVE_RING_COLOR, CLUSTER_CONTAINED_RING_COLOR]
    );
    const dotColors = JSON.stringify(layerById('incident-locations-circle').paint['circle-color']);
    expect(dotColors).not.toContain(CLUSTER_FILL_COLOR);
  });

  it('keeps individual markers and labels off clusters', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible />);
    for (const id of ['incident-locations-glow', 'incident-locations-circle', 'incident-locations-label']) {
      expect(layerById(id).filter).toEqual(['!', ['has', 'point_count']]);
    }
  });

  it('hides every layer when not visible', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible={false} />);
    for (const layer of layers) {
      expect(layer.layout.visibility).toBe('none');
    }
  });
});
