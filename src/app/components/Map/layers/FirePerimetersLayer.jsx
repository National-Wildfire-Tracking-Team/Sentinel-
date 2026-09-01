/**
 * FirePerimetersLayer.jsx
 * Renders NIFC fire perimeter polygons with fill and outline,
 * plus a centroid dot at the center of each perimeter.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { useMemo, memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { polygonCentroid } from '../../../utils/geoUtils';
import { getFireMatchKey } from '../../../hooks/useMergedFireData';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const FirePerimetersLayer = memo(function FirePerimetersLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  // Derive a Point FeatureCollection of perimeter centroids for the center dots
  // and name labels. A single fire can arrive as several separate polygon
  // fragments sharing one name (e.g. FIRIS "Heat Perimeter" chunks) — all
  // fragments still get drawn as fill/line, but only the largest fragment per
  // fire contributes a dot + label so each fire shows once.
  // Perimeters with HideFromCentroid=true have their centroid dot suppressed
  // because a repositioned IRWIN incident dot already covers that location.
  const centroidGeoJSON = useMemo(() => {
    if (!geoJSON?.features?.length) return EMPTY_GEOJSON;

    const candidates = geoJSON.features.filter(f => !f.properties?.HideFromCentroid);
    candidates.sort((a, b) => (b.properties?.GISAcres || 0) - (a.properties?.GISAcres || 0));

    const seen = new Set();
    const features = [];
    for (const f of candidates) {
      const key =
        getFireMatchKey(f.properties?.IncidentName) ||
        f.properties?.UniqueFireIdentifier ||
        f.properties?.IncidentManagementOrganization;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
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

  // Grey out fully contained perimeters, and perimeters that haven't been
  // updated in 30+ days (isStaleFire, set in LiveTrackerPage); active fires
  // keep their normal color.
  const isContained = ['>=', ['coalesce', ['get', 'PercentContained'], 0], 100];
  const isStale = ['boolean', ['get', 'isStaleFire'], false];
  const isGreyedOut = ['any', isContained, isStale];

  return (
    <>
      <Source id="fire-perimeters" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
        <Layer
          id="fire-perimeters-fill"
          type="fill"
          source="fire-perimeters"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': ['case', isGreyedOut, '#6b7280', '#ff6600'],
            'fill-opacity': [
              'case',
              isGreyedOut,
              ['case', ['boolean', ['feature-state', 'selected'], false], 0.3, 0.15],
              ['case', ['boolean', ['feature-state', 'selected'], false], 0.35, 0.14],
            ],
          }}
        />
        {/* Dark casing beneath the colored line so the boundary stays legible
            over busy overlays (e.g. the evac-zone hatch fill) */}
        <Layer
          id="fire-perimeters-line-casing"
          type="line"
          source="fire-perimeters"
          layout={{ visibility: vis }}
          paint={{
            'line-color': '#000000',
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              5,
              3.2,
            ],
            'line-opacity': 0.55,
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
              isGreyedOut,
              ['case', ['boolean', ['feature-state', 'selected'], false], '#9ca3af', '#6b7280'],
              ['boolean', ['feature-state', 'selected'], false],
              '#ffaa00',
              '#ff6600',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              3,
              2.2,
            ],
            'line-opacity': 1,
          }}
        />
      </Source>

      {/* Centroid dot + name label, once per fire (deduped in centroidGeoJSON above) */}
      <Source id="fire-perimeter-centroids" type="geojson" data={centroidGeoJSON}>
        <Layer
          id="fire-perimeter-centroids-glow"
          type="circle"
          source="fire-perimeter-centroids"
          filter={['all', ['<', ['coalesce', ['get', 'PercentContained'], 0], 100], ['!', isStale]]}
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': 14,
            'circle-color': '#ff8c00',
            'circle-opacity': 0.12,
            'circle-stroke-width': 0,
          }}
        />
        <Layer
          id="fire-perimeter-centroids-circle"
          type="circle"
          source="fire-perimeter-centroids"
          filter={['all', ['<', ['coalesce', ['get', 'PercentContained'], 0], 100], ['!', isStale]]}
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': 7,
            'circle-color': '#ffaa00',
            'circle-opacity': 0.9,
            'circle-stroke-color': 'rgba(255,255,255,0.7)',
            'circle-stroke-width': 1.5,
          }}
        />
        <Layer
          id="fire-perimeters-label"
          type="symbol"
          source="fire-perimeter-centroids"
          minzoom={7}
          layout={{
            visibility: vis,
            'text-field': ['get', 'IncidentName'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'top',
            'text-offset': [0, 1.2],
            'text-max-width': 10,
          }}
          paint={{
            'text-color': ['case', isGreyedOut, '#9ca3af', '#ffffff'],
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 2,
          }}
        />
      </Source>
    </>
  );
});
export default FirePerimetersLayer;
