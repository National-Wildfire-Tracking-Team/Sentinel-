/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useMergedFireData, getFireMatchKey } from '../hooks/useMergedFireData';
import { useAQIData } from '../hooks/useAQIData';
import { useWeatherAlerts } from '../hooks/useWeatherAlerts';
import { useIncidents } from '../hooks/useIncidents';
import { useStormReports } from '../hooks/useStormReports';
import { useSpcOutlooks } from '../hooks/useSpcOutlooks';
import { useFireReports, reportsToGeoJSON } from '../hooks/useFireReports';
import { useEvacZones } from '../hooks/useEvacZones';
import { useCaPerimeters } from '../hooks/useCaPerimeters';
import { polygonCentroid } from '../utils/geoUtils';

// Components
import Header from '../components/Header/Header';
import AlertBanner from '../components/AlertBanner/AlertBanner';
import Sidebar from '../components/Sidebar/Sidebar';
import MapView from '../components/Map/MapView';
import LayerControl from '../components/LayerControl/LayerControl';
import Legend from '../components/Legend/Legend';
import FireDetailPanel from '../components/FireDetailPanel/FireDetailPanel';

// US continental bounding box for data fetches
const US_BOUNDS = { west: -130, south: 24, east: -65, north: 50 };

const MAP_TABS = {
  wildfire: 'wildfire',
  weather: 'weather',
};

const WILDFIRE_LAYER_PRESET = {
  fireHotspots: true,
  firePerimeters: true,
  incidentLocations: true,
  userReports: true,
  weatherAlerts: false,
  aqi: false,
  smoke: false,
  goesEast: false,
  goesWest: false,
  spcOutlooks: false,
  radar: false,
  evacZones: false,
};

const WEATHER_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: false,
  incidentLocations: false,
  userReports: false,
  weatherAlerts: true,
  aqi: true,
  smoke: true,
  goesEast: true,
  goesWest: false,
  spcOutlooks: true,
  radar: true,
  evacZones: false,
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Returns true if a fire is 100% contained AND has not been updated in 3+ days.
 * These fires should be removed from the map entirely.
 */
function isStaleContained(contained, updatedTimestamp) {
  if (Number(contained) < 100) return false;
  if (!updatedTimestamp) return false;
  return Date.now() - new Date(updatedTimestamp).getTime() >= THREE_DAYS_MS;
}

/**
 * Remove fully-contained fires that haven't been updated in 3+ days from a GeoJSON collection.
 */
function filterStaleContainedGeoJSON(geoJSON, containedKey, updatedKey) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.filter(
      f => !isStaleContained(f.properties[containedKey], f.properties[updatedKey])
    ),
  };
}

/**
 * Remove fully-contained fires that haven't been updated in 3+ days from an incidents array.
 */
function filterStaleContainedIncidents(incidents) {
  return incidents.filter(inc => !isStaleContained(inc.contained, inc.updated));
}

/**
 * Filter a GeoJSON FeatureCollection to only include fires less than 95% contained.
 * Used in "Active Fires" mode across all data sources.
 */
function filterActiveFiresGeoJSON(geoJSON, { containedKey }) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.filter(f => {
      const contained = Number(f.properties[containedKey]) || 0;
      return contained < 95;
    }),
  };
}

export default function LiveTrackerPage() {
  const { layers, setLayer, setRefreshed, setLoading, feedFilter } = useApp();
  const [activeMapTab, setActiveMapTab] = useState(MAP_TABS.wildfire);

  // Apply layer presets only when the active tab changes
  useEffect(() => {
    const presets = {
      [MAP_TABS.wildfire]: WILDFIRE_LAYER_PRESET,
      [MAP_TABS.weather]:  WEATHER_LAYER_PRESET,
    };
    const preset = presets[activeMapTab] || WILDFIRE_LAYER_PRESET;
    Object.entries(preset).forEach(([layer, value]) => {
      setLayer(layer, value);
    });
  }, [activeMapTab, setLayer]);

  // ── Data feeds ──
  const {
    geoJSON: hotspotsGeoJSON,
    loading: hotspotsLoading,
    count: hotspotsCount,
    sourceCounts: hotspotsSourceCounts,
    refresh: refreshHotspots,
  } = useFireHotspots(US_BOUNDS);

  const {
    perimetersGeoJSON,
    incidentDotsGeoJSON,
    loading: perimetersLoading,
    perimetersCount,
    dotsCount,
    refresh: refreshPerimeters,
  } = useMergedFireData(100);

  const {
    geoJSON: aqiGeoJSON,
    refresh: refreshAQI,
  } = useAQIData(layers.aqi);

  const {
    geoJSON: alertsGeoJSON,
    loading: alertsLoading,
    error: alertsError,
    refresh: refreshAlerts,
  } = useWeatherAlerts();

  const {
    incidents,
    geoJSON: incidentsGeoJSON,
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents,
  } = useIncidents(0.1);

  const {
    spcGeoJSON,
    iemGeoJSON,
    refresh: refreshStormReports,
  } = useStormReports(activeMapTab === MAP_TABS.weather);

  const {
    geoJSON: spcOutlooksGeoJSON,
    refresh: refreshSpcOutlooks,
  } = useSpcOutlooks(activeMapTab === MAP_TABS.weather);

  // California evacuation zones (Cal OES NRT)
  const {
    geoJSON: evacZonesGeoJSON,
    refresh: refreshEvacZones,
  } = useEvacZones();

  // California perimeters (NIFC FIRIS CA public view)
  const {
    geoJSON: caPerimetersGeoJSON,
    refresh: refreshCaPerimeters,
  } = useCaPerimeters();

  // Community-submitted reports – only approved ones, realtime-subscribed
  const { reports: approvedReports, refresh: refreshUserReports } = useFireReports('approved');
  const userReportsGeoJSON = useMemo(
    () => reportsToGeoJSON(approvedReports),
    [approvedReports]
  );

  // ── Enrich CA FIRIS perimeters with matching IRWIN incident data ──
  // Builds: enriched perimeter GeoJSON + centroid map for dot repositioning.
  // For each FIRIS perimeter whose name matches an IRWIN incident we:
  //   1. Merge IRWIN fields (cause, personnel, containment) into the perimeter
  //   2. Set HideFromCentroid=true so FirePerimetersLayer skips the redundant
  //      centroid dot (the repositioned IRWIN dot takes its place)
  const { enrichedCaPerimetersGeoJSON, firisPerimeterCentroidMap } = useMemo(() => {
    const centroidMap = new Map();

    if (!caPerimetersGeoJSON?.features?.length) {
      return { enrichedCaPerimetersGeoJSON: caPerimetersGeoJSON, firisPerimeterCentroidMap: centroidMap };
    }

    // Index IRWIN incidents by normalised name key
    const incidentByKey = new Map();
    incidents.forEach(inc => {
      const key = getFireMatchKey(inc.name);
      if (key) incidentByKey.set(key, inc);
    });

    // Build centroid map (all FIRIS perimeters, matched or not)
    caPerimetersGeoJSON.features.forEach(f => {
      const key = getFireMatchKey(f.properties.IncidentName);
      if (!key || !f.geometry) return;
      const centroid = polygonCentroid(f.geometry);
      if (centroid) centroidMap.set(key, centroid);
    });

    const enrichedFeatures = caPerimetersGeoJSON.features.map(f => {
      const key = getFireMatchKey(f.properties.IncidentName);
      if (!key || !incidentByKey.has(key)) return f;
      const inc = incidentByKey.get(key);
      return {
        ...f,
        properties: {
          ...f.properties,
          FireCause: f.properties.FireCause !== 'Under Investigation'
            ? f.properties.FireCause
            : (inc.cause || 'Under Investigation'),
          GISAcres: Math.max(f.properties.GISAcres || 0, inc.acres || 0),
          TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || inc.personnel || 0,
          PercentContained: Math.max(f.properties.PercentContained || 0, inc.contained || 0),
          StructuresDestroyed: f.properties.StructuresDestroyed || inc.structures_destroyed || 0,
          StructuresDamaged: f.properties.StructuresDamaged || inc.structures_damaged || 0,
          // Suppress the duplicate perimeter centroid dot — IRWIN dot is moved here instead
          HideFromCentroid: true,
        },
      };
    });

    return {
      enrichedCaPerimetersGeoJSON: { ...caPerimetersGeoJSON, features: enrichedFeatures },
      firisPerimeterCentroidMap: centroidMap,
    };
  }, [caPerimetersGeoJSON, incidents]);

  // ── FIRIS-only incidents for sidebar ──
  // Fires that have a CA FIRIS perimeter but no matching IRWIN incident
  // are invisible in the sidebar. Build incident objects from their perimeter
  // data so they appear in the feed.
  const firisOnlyIncidents = useMemo(() => {
    if (!enrichedCaPerimetersGeoJSON?.features?.length) return [];
    const irwinKeys = new Set(incidents.map(i => getFireMatchKey(i.name)).filter(Boolean));
    return enrichedCaPerimetersGeoJSON.features
      .filter(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        return key && !irwinKeys.has(key);
      })
      .map(f => {
        const p = f.properties;
        const contained = Number(p.PercentContained) || 0;
        const centroid = firisPerimeterCentroidMap.get(getFireMatchKey(p.IncidentName));
        return {
          id: p.UniqueFireIdentifier || `firis-${p.IncidentName}`,
          name: p.IncidentName,
          state: p.POOState || 'CA',
          county: p.POOCounty || '',
          lat: centroid ? centroid[1] : 0,
          lng: centroid ? centroid[0] : 0,
          acres: Math.round(p.GISAcres) || 0,
          contained,
          started: p.FireDiscoveryDateTime || null,
          updated: p.ModifiedOnDateTime || null,
          cause: p.FireCause || 'Under Investigation',
          status: contained >= 100 ? 'controlled' : 'active',
          personnel: p.TotalIncidentPersonnel || 0,
          structures_destroyed: p.StructuresDestroyed || 0,
          structures_damaged: p.StructuresDamaged || 0,
          structures_threatened: 0,
          source: 'CA_FIRIS',
        };
      });
  }, [enrichedCaPerimetersGeoJSON, incidents, firisPerimeterCentroidMap]);

  // ── Remove stale fully-contained fires (100% contained, no update in 3+ days) ──
  const freshIncidents = useMemo(
    () => filterStaleContainedIncidents(incidents),
    [incidents]
  );

  const freshIncidentsGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(incidentsGeoJSON, 'contained', 'updated'),
    [incidentsGeoJSON]
  );

  const freshPerimetersGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(perimetersGeoJSON, 'PercentContained', 'ModifiedOnDateTime'),
    [perimetersGeoJSON]
  );

  const freshCaPerimetersGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(enrichedCaPerimetersGeoJSON, 'PercentContained', 'ModifiedOnDateTime'),
    [enrichedCaPerimetersGeoJSON]
  );

  const freshIncidentDotsGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(incidentDotsGeoJSON, 'PercentContained', 'ModifiedOnDateTime'),
    [incidentDotsGeoJSON]
  );

  // ── Apply feed filter to map fire layers ──
  const isFocused = feedFilter === 'focused';

  const filteredIncidentsGeoJSON = useMemo(() => {
    if (!isFocused) return freshIncidentsGeoJSON;
    return filterActiveFiresGeoJSON(freshIncidentsGeoJSON, { containedKey: 'contained' });
  }, [isFocused, freshIncidentsGeoJSON]);

  const filteredPerimetersGeoJSON = useMemo(() => {
    const basePerimeters = isFocused
      ? filterActiveFiresGeoJSON(freshPerimetersGeoJSON, { containedKey: 'PercentContained' })
      : freshPerimetersGeoJSON;

    const baseCaPerimeters = isFocused
      ? filterActiveFiresGeoJSON(freshCaPerimetersGeoJSON, { containedKey: 'PercentContained' })
      : freshCaPerimetersGeoJSON;

    if (!baseCaPerimeters?.features?.length) return basePerimeters;
    return {
      type: 'FeatureCollection',
      features: [
        ...(basePerimeters?.features || []),
        ...baseCaPerimeters.features,
      ],
    };
  }, [isFocused, freshPerimetersGeoJSON, freshCaPerimetersGeoJSON]);

  const filteredIncidentDotsGeoJSON = useMemo(() => {
    if (!isFocused) return freshIncidentDotsGeoJSON;
    return filterActiveFiresGeoJSON(freshIncidentDotsGeoJSON, { containedKey: 'PercentContained' });
  }, [isFocused, freshIncidentDotsGeoJSON]);

  // Fires with perimeter overlays already render a centered perimeter centroid
  // indicator. Build a set of those names so we can hide off-center IRWIN dots.
  const perimeterMatchKeys = useMemo(() => {
    if (!filteredPerimetersGeoJSON?.features?.length) return new Set();
    const keys = new Set();
    filteredPerimetersGeoJSON.features.forEach(f => {
      const key = getFireMatchKey(f.properties.IncidentName);
      if (key) keys.add(key);
    });
    return keys;
  }, [filteredPerimetersGeoJSON]);

  // ── Combine IRWIN incidents with FIRIS-only fires for sidebar ──
  // FIRIS-only fires have no IRWIN record; add them so they appear in the feed.
  const allIncidents = useMemo(
    () => [...freshIncidents, ...filterStaleContainedIncidents(firisOnlyIncidents)],
    [freshIncidents, firisOnlyIncidents]
  );

  // ── Reporter incidents replace matching external data incidents ──
  // When an approved reporter report shares a fire name with an IRWIN incident,
  // the external incident is replaced in the sidebar feed with a merged record
  // that keeps authoritative external stats but surfaces reporter-contributed data.
  const mergedIncidents = useMemo(() => {
    if (!approvedReports.length) return allIncidents;

    // Index reporter reports by normalised fire name key (same algorithm used
    // in useMergedFireData to match perimeters to incident dots).
    const reporterByKey = new Map();
    approvedReports.forEach(r => {
      const key = getFireMatchKey(r.title);
      if (key) reporterByKey.set(key, r);
    });

    return allIncidents.map(inc => {
      const key = getFireMatchKey(inc.name);
      if (!key || !reporterByKey.has(key)) return inc;

      const report = reporterByKey.get(key);
      // Extract acreage from reporter description if the reporter supplied it
      // (format: "Acreage: <number>").
      const reportAcresMatch = /^Acreage:\s*(\d+\.?\d*)/mi.exec(report.description || '');
      const reportAcres = reportAcresMatch ? Math.round(Number(reportAcresMatch[1])) : null;

      return {
        ...inc,
        // Use reporter coordinates when available – reporter location is often
        // more precise than the IRWIN centroid.
        lat: Number(report.latitude) || inc.lat,
        lng: Number(report.longitude) || inc.lng,
        // Reporter-provided acreage overrides the external value when present.
        acres: reportAcres ?? inc.acres,
        // Attach reporter metadata so downstream components can reference it.
        hasReporterData: true,
        reportId: report.id,
        reportDescription: report.description,
        reportedAt: report.created_at,
      };
    });
  }, [allIncidents, approvedReports]);

  // Build the set of reporter-matched fire name keys once for GeoJSON filtering.
  const reporterMatchKeys = useMemo(() => {
    if (!approvedReports.length) return new Set();
    return new Set(
      approvedReports.map(r => getFireMatchKey(r.title)).filter(Boolean)
    );
  }, [approvedReports]);

  // Deduplicate and reposition IRWIN incident markers:
  //  - Reporter match → suppress (reporter dot takes over)
  //  - CA FIRIS perimeter match → move dot to perimeter centroid so it sits
  //    at the geographic center of the fire and carries full IRWIN detail
  //  - NIFC perimeter match → suppress (enriched perimeter centroid shows instead)
  const deduplicatedIncidentsGeoJSON = useMemo(() => {
    if (!filteredIncidentsGeoJSON?.features)
      return filteredIncidentsGeoJSON;
    return {
      ...filteredIncidentsGeoJSON,
      features: filteredIncidentsGeoJSON.features
        .map(f => {
          const key = getFireMatchKey(f.properties.name);
          if (!key) return f;
          if (reporterMatchKeys.has(key)) return null;
          if (firisPerimeterCentroidMap.has(key)) {
            // Move dot to FIRIS perimeter centroid for accurate placement
            const centroid = firisPerimeterCentroidMap.get(key);
            return { ...f, geometry: { type: 'Point', coordinates: centroid } };
          }
          if (perimeterMatchKeys.has(key)) return null;
          return f;
        })
        .filter(Boolean),
    };
  }, [filteredIncidentsGeoJSON, reporterMatchKeys, perimeterMatchKeys, firisPerimeterCentroidMap]);

  // Same deduplication for incident dot markers (fires without NIFC perimeters).
  const deduplicatedIncidentDotsGeoJSON = useMemo(() => {
    if (!reporterMatchKeys.size || !filteredIncidentDotsGeoJSON?.features)
      return filteredIncidentDotsGeoJSON;
    return {
      ...filteredIncidentDotsGeoJSON,
      features: filteredIncidentDotsGeoJSON.features.filter(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        return !key || !reporterMatchKeys.has(key);
      }),
    };
  }, [filteredIncidentDotsGeoJSON, reporterMatchKeys]);

  // ── Cross-deduplicate FireIncidentsLayer dots against IncidentLocationsLayer ──
  // Both layers source data from IRWIN, so the same fire can appear as two
  // overlapping dots.  Keep only the IncidentLocationsLayer marker (richer
  // styling: containment-based color, acreage-based sizing) and suppress the
  // FireIncidentsLayer duplicate.
  //   - Fire with a perimeter + two dots → hides the non-centered duplicate,
  //     keeps only the perimeter-centered centroid indicator.
  //   - Fire without a perimeter + two dots → collapses to a single dot with
  //     one consistent color from IncidentLocationsLayer.
  const finalIncidentDotsGeoJSON = useMemo(() => {
    if (!deduplicatedIncidentDotsGeoJSON?.features?.length)
      return deduplicatedIncidentDotsGeoJSON;
    if (!deduplicatedIncidentsGeoJSON?.features?.length)
      return deduplicatedIncidentDotsGeoJSON;

    // Build lookup sets from IncidentLocationsLayer features
    const locationNameKeys = new Set();
    const locationIds = new Set();
    deduplicatedIncidentsGeoJSON.features.forEach(f => {
      const key = getFireMatchKey(f.properties.name);
      if (key) locationNameKeys.add(key);
      if (f.properties.id) locationIds.add(f.properties.id);
    });

    // Also include perimeter name keys so any FireIncidentsLayer dot that
    // slipped through name-matching in useMergedFireData is still caught.
    if (filteredPerimetersGeoJSON?.features) {
      filteredPerimetersGeoJSON.features.forEach(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        if (key) locationNameKeys.add(key);
      });
    }

    return {
      ...deduplicatedIncidentDotsGeoJSON,
      features: deduplicatedIncidentDotsGeoJSON.features.filter(f => {
        const nameKey = getFireMatchKey(f.properties.IncidentName);
        const id = f.properties.UniqueFireIdentifier;
        if (nameKey && locationNameKeys.has(nameKey)) return false;
        if (id && locationIds.has(id)) return false;
        return true;
      }),
    };
  }, [deduplicatedIncidentDotsGeoJSON, deduplicatedIncidentsGeoJSON, filteredPerimetersGeoJSON]);

  // ── Global loading state ──
  const anyLoading = hotspotsLoading || perimetersLoading || incidentsLoading;
  useEffect(() => { setLoading(anyLoading); }, [anyLoading, setLoading]);
  useEffect(() => {
    if (!anyLoading) setRefreshed(new Date());
  }, [anyLoading, setRefreshed]);

  // ── Manual refresh ──
  const handleRefresh = useCallback(() => {
    refreshHotspots();
    refreshPerimeters();
    refreshAlerts();
    refreshIncidents();
    refreshStormReports();
    refreshSpcOutlooks();
    refreshUserReports();
    refreshEvacZones();
    refreshCaPerimeters();
    if (layers.aqi) refreshAQI();
  }, [refreshHotspots, refreshPerimeters, refreshAlerts, refreshIncidents, refreshStormReports, refreshSpcOutlooks, refreshUserReports, refreshEvacZones, refreshCaPerimeters, refreshAQI, layers.aqi]);

  return (
    <div className="h-screen w-screen flex flex-col bg-sentinel-900 text-white overflow-hidden select-none">
      {/* ── Top bar ── */}
      <Header onRefresh={handleRefresh} />

      {/* ── Active alert banner ── */}
      <AlertBanner />

      {/* ── Main content area ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar */}
        <Sidebar
          incidents={mergedIncidents}
          loading={incidentsLoading}
          error={incidentsError}
          activeMapTab={activeMapTab}
          onTabChange={setActiveMapTab}
          weatherAlertsLoading={alertsLoading}
          weatherAlertsError={alertsError}
        />

        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          <MapView
            activeMapTab={activeMapTab}
            hotspotsGeoJSON={hotspotsGeoJSON}
            perimetersGeoJSON={filteredPerimetersGeoJSON}
            incidentsGeoJSON={deduplicatedIncidentsGeoJSON}
            incidentDotsGeoJSON={finalIncidentDotsGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={alertsGeoJSON}
            spcReportsGeoJSON={spcGeoJSON}
            iemReportsGeoJSON={iemGeoJSON}
            spcOutlooksGeoJSON={spcOutlooksGeoJSON}
            userReportsGeoJSON={userReportsGeoJSON}
            evacZonesGeoJSON={evacZonesGeoJSON}
          />

          <LayerControl
            activeMapTab={activeMapTab}
          />

          <Legend />
          <FireDetailPanel />
        </div>
      </div>
    </div>
  );
}
