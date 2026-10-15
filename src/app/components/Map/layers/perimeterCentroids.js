/**
 * perimeterCentroids.js
 * Centroid points for fire perimeters, shared by FirePerimetersLayer and the
 * live map's clustered fire points (IncidentLocationsLayer, via MapView).
 */

import { polygonCentroid } from '../../../utils/geoUtils';
import { getFireMatchKey } from '../../../hooks/useMergedFireData';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/** Fires smaller than this aren't drawn as dots or counted in fire groups. */
export const MIN_FIRE_ACRES = 0.4;

/**
 * Whether a perimeter's centroid draws a fire dot on the live map: a current
 * mapping (not stale, not historical), at least MIN_FIRE_ACRES, and not
 * covered by a repositioned IRWIN dot (HideFromCentroid). Fully contained
 * fires still draw (grey) until the page drops them as stale. Duplicate
 * incident dots are only hidden in favour of perimeters that pass this.
 */
export function drawsCentroidDot(props = {}) {
  return !props.HideFromCentroid
    && !props.isStaleFire
    && !props.isHistoricalMapping
    && (Number(props.GISAcres) || 0) >= MIN_FIRE_ACRES;
}

/**
 * Derive a Point FeatureCollection of perimeter centroids for the center dots
 * and name labels. A single fire can arrive as several separate polygon
 * fragments sharing one name (e.g. FIRIS "Heat Perimeter" chunks) — all
 * fragments still get drawn as fill/line, but only the largest fragment per
 * fire contributes a dot + label so each fire shows once.
 * Perimeters with HideFromCentroid=true have their centroid dot suppressed
 * because a repositioned IRWIN incident dot already covers that location.
 */
export function perimeterCentroids(geoJSON) {
  if (!geoJSON?.features?.length) return EMPTY_GEOJSON;

  const candidates = geoJSON.features.filter(f => !f.properties?.HideFromCentroid);
  // Prefer the active record over historical ones for the dot/label.
  candidates.sort((a, b) => {
    const histDelta = (a.properties?.isHistoricalMapping ? 1 : 0) - (b.properties?.isHistoricalMapping ? 1 : 0);
    if (histDelta !== 0) return histDelta;
    return (b.properties?.GISAcres || 0) - (a.properties?.GISAcres || 0);
  });

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
}
