/**
 * useFireBehaviorModeling.js
 * Derives spread-projection rings (+1h/+3h/+6h) for the user's currently
 * selected fire, driven by the Rothermel-based physics engine
 * (src/fireEngine/) rather than the simpler heuristic in
 * src/utils/fireBehaviorModel.js. Purely a client-side derivation of data
 * already fetched elsewhere (nearest RAWS station's wind + fuel moisture),
 * no additional network endpoint required.
 *
 * Modeling is opt-in per fire (selectedFireId) rather than running over
 * every active fire on the map — the projection math is only meaningful
 * for a fire the user is actively looking at, and computing it for dozens
 * of fires at once was wasted work with no UI to show it.
 *
 * Takes ONE combined fire-features layer (mapped perimeters and dot-only
 * incidents merged into a single FeatureCollection — see
 * LiveTrackerPage.jsx's `fireFeaturesForModeling`) rather than two separate
 * GeoJSON props. Which modeling path runs is decided purely by each
 * feature's own geometry, not by which source list it came from: a
 * Polygon/MultiPolygon feature (a mapped NIFC WFIGS perimeter) has its
 * actual footprint grown outward by the engine's Huygens-wavelet perimeter
 * growth; a Point feature (an incident with no perimeter yet reported) is
 * modeled from a point ignition instead.
 *
 * KNOWN LIMITATION (tracked in docs/fire-engine/ARCHITECTURE.md Phase 2):
 * this app has no LANDFIRE fuel-model or DEM slope/aspect ingestion yet, so
 * every fire is modeled with a single default fuel model (Anderson FM4,
 * chaparral — a reasonable default for the fire-prone western US this app
 * targets, but wrong for e.g. a fire in short grass or heavy timber) and a
 * flat-ground assumption. computeConfidence() is told this explicitly
 * (fuelModelIsReal: false, terrainIsReal: false), which is why these
 * projections should read as "moderate" confidence at best regardless of
 * how good the wind data is — see the confidence chip the layer/legend
 * surfaces.
 */

import { useMemo } from 'react';
import { useRAWSData } from './useRAWSData';
import { ringCentroid, outerRing } from '../utils/geoUtils';
import { findNearestStation } from '../utils/fireBehaviorModel';
import { simulateFireGrowth, createUniformGrid } from '../fireEngine';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Largest horizon first so smaller/nearer-term rings draw on top (painter's algorithm).
const HORIZONS_HOURS = [6, 3, 1];
const MIN_ACRES = 10;

// No LANDFIRE fuel-model ingestion yet (see module header) — Anderson FM4
// (chaparral) is used everywhere as a documented placeholder default.
const DEFAULT_FUEL_MODEL_ID = 4;
const DEFAULT_WIND_MPH = 6;
const DEFAULT_WIND_DIR_DEG = 270;
const DEFAULT_FUEL_MOISTURE_PCT = 12;

function isModelable(properties) {
  const p = properties || {};
  return Number(p.PercentContained) < 100 && Number(p.GISAcres) >= MIN_ACRES;
}

function findByFireId(features, fireId) {
  return features.find((f) => f.properties?.UniqueFireIdentifier === fireId) || null;
}

/**
 * Geometry-driven, not source-driven: a Polygon/MultiPolygon feature yields
 * a perimeter ring to grow; anything else (a Point incident dot) yields a
 * bare ignition point. This is what lets the hook accept one merged
 * FeatureCollection instead of branching on which of two separate GeoJSON
 * props a fire came from.
 */
function extractIgnitionAndPerimeter(feature) {
  const ring = outerRing(feature.geometry);
  if (ring) {
    return { ignitionPoint: ringCentroid(ring), perimeterRing: ring };
  }
  const coords = feature.geometry?.coordinates;
  if (Array.isArray(coords) && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
    return { ignitionPoint: [coords[0], coords[1]], perimeterRing: null };
  }
  return null;
}

function projectionFeatures({ incidentName, ignitionPoint, perimeterRing, rawsFeatures }) {
  const nearest = findNearestStation(ignitionPoint, rawsFeatures);
  const stationProps = nearest?.station?.properties;
  const windSpeedMph = stationProps?.windSpeed ?? DEFAULT_WIND_MPH;
  const fuelMoisturePct = stationProps?.fuelMoisture ?? DEFAULT_FUEL_MOISTURE_PCT;
  const windDirDeg = stationProps?.windDir ?? DEFAULT_WIND_DIR_DEG;

  const grid = createUniformGrid({
    fuelModelId: DEFAULT_FUEL_MODEL_ID,
    deadFuelMoisturePct: fuelMoisturePct,
    windSpeed20ftMph: windSpeedMph,
    windDirectionDegFrom: windDirDeg,
    slopePercent: 0, // no DEM ingestion yet — flat-ground assumption, see module header
  });

  const result = simulateFireGrowth({
    ignitionPoint,
    perimeterRing: perimeterRing || undefined,
    grid,
    horizonsHours: HORIZONS_HOURS,
    timeStepHours: 0.5,
    dataQuality: {
      fuelModelIsReal: false,
      windObservationAgeMin: nearest ? 20 : 240,
      windStationDistanceMi: nearest?.distanceMi ?? 999,
      moistureIsMeasured: stationProps?.fuelMoisture != null,
      terrainIsReal: false,
    },
  });

  // simulateFireGrowth() always returns features in ascending horizon order;
  // reverse to largest-first so smaller/nearer-term (more opaque) rings draw
  // on top of larger ones (painter's algorithm), matching HORIZONS_HOURS order.
  return result.features.slice().reverse().map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      incidentName,
      windSpeedMph: Math.round(windSpeedMph),
      windDirDeg: stationProps?.windDir ?? null,
      fuelMoisturePct: Math.round(fuelMoisturePct),
      stationName: stationProps?.stationName || null,
      stationDistanceMi: nearest ? Math.round(nearest.distanceMi) : null,
    },
  }));
}

/**
 * @param {boolean} enabled Layer toggle on AND user has fire-behavior-modeling entitlement
 * @param {object|null} fireFeaturesGeoJSON Combined FeatureCollection of mapped perimeters
 *   (Polygon/MultiPolygon) and dot-only incidents (Point) — see LiveTrackerPage.jsx's
 *   `fireFeaturesForModeling`, which merges filteredPerimetersGeoJSON + finalIncidentDotsGeoJSON.
 * @param {string|null} selectedFireId UniqueFireIdentifier of the fire the user has selected, if any
 */
export function useFireBehaviorModeling(enabled, fireFeaturesGeoJSON, selectedFireId) {
  const active = enabled && Boolean(selectedFireId);
  const { geoJSON: rawsGeoJSON, loading: rawsLoading } = useRAWSData(active);

  const geoJSON = useMemo(() => {
    if (!active) return EMPTY_GEOJSON;

    const fire = findByFireId(fireFeaturesGeoJSON?.features || [], selectedFireId);
    if (!fire || !isModelable(fire.properties)) return EMPTY_GEOJSON;

    const location = extractIgnitionAndPerimeter(fire);
    if (!location?.ignitionPoint) return EMPTY_GEOJSON;

    const features = projectionFeatures({
      incidentName: fire.properties?.IncidentName || 'Unnamed fire',
      ignitionPoint: location.ignitionPoint,
      perimeterRing: location.perimeterRing,
      rawsFeatures: rawsGeoJSON?.features,
    });

    return { type: 'FeatureCollection', features };
  }, [active, fireFeaturesGeoJSON, rawsGeoJSON, selectedFireId]);

  return { geoJSON, loading: active && rawsLoading };
}
