/**
 * useFireBehaviorModeling.js
 * Derives spread-projection rings (+1h/+3h/+6h) for active fire perimeters,
 * driven by each fire's nearest RAWS station (wind + fuel moisture). Sentinel
 * Pro / Team entitlement only — purely a client-side derivation of data
 * already fetched elsewhere, no additional network endpoint required.
 */

import { useMemo } from 'react';
import { useRAWSData } from './useRAWSData';
import { polygonCentroid } from '../utils/geoUtils';
import { findNearestStation, estimateFireBehavior, buildSpreadPolygon } from '../utils/fireBehaviorModel';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Largest horizon first so smaller/nearer-term rings draw on top (painter's algorithm).
const HORIZONS_HOURS = [6, 3, 1];
const MIN_ACRES = 10;
const MAX_FIRES_MODELED = 60;

/**
 * @param {boolean} enabled Layer toggle on AND user has fire-behavior-modeling entitlement
 * @param {object|null} perimetersGeoJSON Active fire perimeter polygons (NIFC WFIGS)
 */
export function useFireBehaviorModeling(enabled, perimetersGeoJSON) {
  const { geoJSON: rawsGeoJSON, loading: rawsLoading } = useRAWSData(enabled);

  const geoJSON = useMemo(() => {
    if (!enabled || !perimetersGeoJSON?.features?.length) return EMPTY_GEOJSON;

    const activeFires = perimetersGeoJSON.features
      .filter((f) => {
        const p = f.properties || {};
        return Number(p.PercentContained) < 100 && Number(p.GISAcres) >= MIN_ACRES;
      })
      .slice(0, MAX_FIRES_MODELED);

    const features = [];
    for (const fire of activeFires) {
      const ignition = polygonCentroid(fire.geometry);
      if (!ignition) continue;

      const nearest = findNearestStation(ignition, rawsGeoJSON?.features);
      const stationProps = nearest?.station?.properties;
      const behavior = estimateFireBehavior({
        windSpeedMph: stationProps?.windSpeed,
        fuelMoisturePct: stationProps?.fuelMoisture,
      });

      for (const hours of HORIZONS_HOURS) {
        features.push({
          type: 'Feature',
          geometry: buildSpreadPolygon({
            ignition,
            windDirDeg: stationProps?.windDir,
            behavior,
            hours,
          }),
          properties: {
            incidentName: fire.properties?.IncidentName || 'Unnamed fire',
            horizonHours: hours,
            rosHeadChPerHr: Math.round(behavior.rosHeadChPerHr * 10) / 10,
            flameLengthFt: Math.round(behavior.flameLengthFt * 10) / 10,
            windSpeedMph: Math.round(behavior.windSpeedMph),
            windDirDeg: stationProps?.windDir ?? null,
            fuelMoisturePct: Math.round(behavior.fuelMoisturePct),
            stationName: stationProps?.stationName || null,
            stationDistanceMi: nearest ? Math.round(nearest.distanceMi) : null,
          },
        });
      }
    }

    return { type: 'FeatureCollection', features };
  }, [enabled, perimetersGeoJSON, rawsGeoJSON]);

  return { geoJSON, loading: enabled && rawsLoading };
}
