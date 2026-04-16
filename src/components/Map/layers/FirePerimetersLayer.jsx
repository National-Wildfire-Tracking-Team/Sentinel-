/**
 * FirePerimetersLayer.jsx
 * Renders NIFC fire perimeter polygons with fill and outline,
 * plus a centroid dot at the center of each perimeter.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/**
 * Compute the centroid of a polygon ring (array of [lng, lat] pairs).
 * Uses the signed-area weighted centroid formula for accuracy.
 */
function ringCentroid(ring) {
  const n = ring.length;
  if (n < 3) return null;

  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const cross = xi * yj - xj * yi;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }

  area *= 0.5;
  if (Math.abs(area) < 1e-10) return null;

  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/**
 * Get the centroid [lng, lat] for a GeoJSON Polygon or MultiPolygon geometry.
 */
function polygonCentroid(geometry) {
  if (geometry.type === 'Polygon') {
    return ringCentroid(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    // Use the largest sub-polygon (by vertex count) for centroid
    let largest = geometry.coordinates[0];
    for (const poly of geometry.coordinates) {
      if (poly[0].length > largest[0].length) largest = poly;
    }
    return ringCentroid(largest[0]);
  }
  return null;
}

export default function FirePerimetersLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  // Derive a Point FeatureCollection of perimeter centroids for the center dots
  const centroidGeoJSON = useMemo(() => {
    if (!geoJSON?.features?.length) return EMPTY_GEOJSON;

    const features = [];
    for (const f of geoJSON.features) {
      const center = polygonCentroid(f.geometry);
      if (center) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: center },
          properties: f.properties,
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [geoJSON]);

  // Grey out fully contained perimeters; active fires keep their normal color.
  const isContained = ['>=', ['coalesce', ['get', 'PercentContained'], 0], 100];

  return (
    <>
      <Source id="fire-perimeters" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
        <Layer
          id="fire-perimeters-fill"
          type="fill"
          source="fire-perimeters"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': [
              'case',
              isContained,
              '#6b7280',
              ['==', ['get', 'Source'], 'CA_FIRIS'],
              '#dc2626',
              '#ff6600',
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.35,
              0.14,
            ],
          }}
        />
        <Layer
          id="fire-perimeters-line"
          type="line"
          source="fire-perimeters"
          layout={{ visibility: vis }}
          paint={{
            'line-color': [
              'case',
              isContained,
              ['case', ['boolean', ['feature-state', 'selected'], false], '#9ca3af', '#6b7280'],
              ['boolean', ['feature-state', 'selected'], false],
              ['case', ['==', ['get', 'Source'], 'CA_FIRIS'], '#f87171', '#ffaa00'],
              ['case', ['==', ['get', 'Source'], 'CA_FIRIS'], '#dc2626', '#ff6600'],
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              3,
              1.8,
            ],
            'line-opacity': 0.9,
          }}
        />
        <Layer
          id="fire-perimeters-label"
          type="symbol"
          source="fire-perimeters"
          minzoom={7}
          layout={{
            visibility: vis,
            'text-field': ['get', 'IncidentName'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'center',
            'text-max-width': 10,
          }}
          paint={{
            'text-color': ['case', isContained, '#9ca3af', '#ffffff'],
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 2,
          }}
        />
      </Source>

      {/* Centroid dot at the center of each perimeter */}
      <Source id="fire-perimeter-centroids" type="geojson" data={centroidGeoJSON}>
        <Layer
          id="fire-perimeter-centroids-glow"
          type="circle"
          source="fire-perimeter-centroids"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': 14,
            'circle-color': [
              'case',
              isContained,
              '#6b7280',
              ['==', ['get', 'Source'], 'CA_FIRIS'],
              '#dc2626',
              '#ff8c00',
            ],
            'circle-opacity': 0.12,
            'circle-stroke-width': 0,
          }}
        />
        <Layer
          id="fire-perimeter-centroids-circle"
          type="circle"
          source="fire-perimeter-centroids"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': 7,
            'circle-color': [
              'case',
              isContained,
              '#9ca3af',
              ['==', ['get', 'Source'], 'CA_FIRIS'],
              '#f87171',
              '#ffaa00',
            ],
            'circle-opacity': 0.9,
            'circle-stroke-color': 'rgba(255,255,255,0.7)',
            'circle-stroke-width': 1.5,
          }}
        />
      </Source>
    </>
  );
}
