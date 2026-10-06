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
  // The cluster flame images are already registered, so the flame layer renders.
  useMap: () => ({ current: { hasImage: () => true, isStyleLoaded: () => true, on: () => {}, off: () => {} } }),
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
    expect(source.clusterProperties).toHaveProperty('redCount');
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

  it('draws clusters as logo flames whose outline shows status, distinct from containment dot colors', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible />);
    const { type, layout } = layerById('incident-locations-cluster');
    expect(type).toBe('symbol');
    expect(layout['icon-image']).toEqual([
      'case',
      ['all',
        ['>', ['coalesce', ['get', 'redCount'], 0], 0],
        ['>=', ['*', ['coalesce', ['get', 'redCount'], 0], 3], ['get', 'point_count']],
      ], 'fire-cluster-red',
      ['>', ['coalesce', ['get', 'activeCount'], 0], 0], 'fire-cluster-active',
      'fire-cluster-contained',
    ]);
    expect(CLUSTER_ACTIVE_RING_COLOR).not.toBe(CLUSTER_CONTAINED_RING_COLOR);
    // The flames can mount after the counts, so they must be slotted beneath them.
    expect(layerById('incident-locations-cluster').beforeId).toBe('incident-locations-cluster-count');
    const dotColors = JSON.stringify(layerById('incident-locations-circle').paint['circle-color']);
    expect(dotColors).not.toContain(CLUSTER_FILL_COLOR);
  });

  it('keeps individual markers and labels off clusters', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible />);
    const notCluster = ['!', ['has', 'point_count']];
    expect(layerById('incident-locations-label').filter).toEqual(notCluster);
    for (const [id, kind] of [
      ['incident-locations-glow', 'incident'],
      ['incident-locations-circle', 'incident'],
      ['fire-perimeter-centroids-glow', 'perimeter'],
      ['fire-perimeter-centroids-circle', 'perimeter'],
      ['fire-incidents-glow', 'dot'],
      ['fire-incidents-circle', 'dot'],
    ]) {
      expect(layerById(id).filter).toEqual(['all', notCluster, ['==', ['get', '_kind'], kind]]);
    }
  });

  it('clusters perimeter dots and incident dots in the same source as incident locations', () => {
    const perimeter = (props) => ({
      type: 'Feature',
      properties: { IncidentName: 'Perimeter fire', PercentContained: 10, GISAcres: 50, ...props },
      geometry: { type: 'Point', coordinates: [-121, 39] },
    });
    const dot = (GISAcres, PercentContained = 0) => ({
      type: 'Feature',
      properties: { IncidentName: 'Dot fire', GISAcres, PercentContained },
      geometry: { type: 'Point', coordinates: [-122, 40] },
    });
    render(
      <IncidentLocationsLayer
        geoJSON={{ type: 'FeatureCollection', features: [point(250, 40)] }}
        perimeterCentroidsGeoJSON={{
          type: 'FeatureCollection',
          // Perimeters follow the same rules as every fire dot: current
          // mappings of at least 0.4 acres, fully contained ones included.
          features: [
            perimeter(), perimeter({ PercentContained: 100 }),
            perimeter({ isStaleFire: true }), perimeter({ isHistoricalMapping: true }),
            perimeter({ GISAcres: 0.1 }), perimeter({ HideFromCentroid: true }),
          ],
        }}
        fireDotsGeoJSON={{ type: 'FeatureCollection', features: [dot(5, 100), dot(0.1)] }}
        visible
      />,
    );
    expect(sources).toHaveLength(1);
    const props = sources[0].data.features.map((f) => f.properties);
    expect(props.map((p) => p._kind)).toEqual(['incident', 'perimeter', 'perimeter', 'dot']);
    // Containment is normalized so the groups count fires of every kind alike.
    expect(props.map((p) => p._contained)).toEqual([40, 10, 100, 100]);
    // Original properties survive for MapView's click/hover handling.
    expect(props[1].IncidentName).toBe('Perimeter fire');
  });

  it('hides every layer when not visible', () => {
    render(<IncidentLocationsLayer geoJSON={{ type: 'FeatureCollection', features: [] }} visible={false} />);
    for (const layer of layers) {
      expect(layer.layout.visibility).toBe('none');
    }
  });
});
