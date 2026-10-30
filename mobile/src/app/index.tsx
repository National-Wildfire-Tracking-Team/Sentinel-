/**
 * The live map, matching the web's LiveTrackerPage at phone width: the Sentinel header (flame, name,
 * refresh), round corner buttons (menu, incident sidebar "!", locate; account on the right), the
 * full-bleed map, the zoom stack, and the floating bottom bar with the layers button and map tabs.
 * The sidebar and menu open as full-width panels and layers as a floating card, as on the web;
 * fire, zone and spot details open as a bottom sheet like the web's mobile incident sheet.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, CircleUserRound, Flame, LocateFixed, Menu, Navigation, X } from 'lucide-react-native';
import Constants from 'expo-constants';

import { useAuth } from '@/auth/AuthContext';
import { useAlertSettings } from '@/context/AlertSettingsContext';
import { usePlan } from '@/auth/usePlan';
import { BottomSheet } from '@/components/BottomSheet';
import { EvacZoneSheet } from '@/components/EvacZoneSheet';
import { FeatureSheet, type FeatureSelection } from '@/components/FeatureSheet';
import { IncidentSheet } from '@/components/IncidentSheet';
import { LayerPanel } from '@/components/LayerPanel';
import { MapBottomBar } from '@/components/MapBottomBar';
import { CornerButton, RefreshButton, ZoomControl } from '@/components/MapChrome';
import { MenuPanel } from '@/components/MenuPanel';
import { PointInfoSheet, type PointInfo } from '@/components/PointInfoSheet';
import { MeasurementPanel, measureShape, type MeasureMode, type MeasureState } from '@/components/MeasurementPanel';
import { RadarSitePanel } from '@/components/RadarSitePanel';
import { SidebarPanel, type FeedTab } from '@/components/SidebarPanel';
import { Banner, EmptyState } from '@/components/ui';
import { isMapboxConfigured } from '@/config/env';
import { useHomeSetup } from '@/context/HomeSetupContext';
import { ARCGIS_LAYERS, arcgisKeyFor, arcgisTileUrl, identifyArcgis, type IdentifyResult } from '@/data/arcgisLayers';
import type { Viewport } from '@/data/arcgisQuery';
import { STATION_LAYER_FIELD, STATION_LAYER_KEYS, fetchFuelModelAt } from '@/data/fireDanger';
import { mergeReporterIncidents } from '@/data/fireReports';
import { smokeHours } from '@/data/fireLayers';
import type { WindField } from '@/data/windField';
import { incidentsToFeatureCollection } from '@/data/incidents';
import { fetchAlertsAtPoint } from '@/data/weatherAlerts';
import { useEvacZones } from '@/hooks/useEvacZones';
import { useFeatureLayers, type FeatureLayerData } from '@/hooks/useFeatureLayers';
import { useFireReports } from '@/hooks/useFireReports';
import { useHazardEvents } from '@/hooks/useHazardEvents';
import { useRadarSite } from '@/hooks/useRadarSite';
import { useIncidents } from '@/hooks/useIncidents';
import { useSavedLocations } from '@/hooks/useSavedLocations';
import { useLightning, useMrms, useWeatherAlerts } from '@/hooks/useWeatherData';
import { circlePolygon, haversineMiles } from '@/lib/geocode';
import { FIRE_DANGER_LAYER_KEYS, TAB_PRESETS, type LayerState, type MapTab } from '@/map/catalog';
import { CATALOG_SOURCES } from '@/map/featureSources';
import { alertPolygonStyles, smokeStyles, stationStyles } from '@/map/featureStyles';
import { RASTER_OVERLAY_KEYS, rasterOverlaysFor } from '@/map/rasterSources';
import { HAS_SKIA } from '@/lib/skia';
import type { BasemapId } from '@/map/layers';
import { SentinelMap, type SentinelMapHandle } from '@/map/SentinelMap';
import { accent, fire, sentinel, sentinelText } from '@/theme';
import { formatRelative } from '@/utils/format';

// Wind particles draw with Skia; an app build without it skips them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WindParticles: typeof import('@/map/WindParticles').WindParticles | null = HAS_SKIA ? require('@/map/WindParticles').WindParticles : null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fetchWindField: typeof import('@/data/windField').fetchWindField | null = HAS_SKIA ? require('@/data/windField').fetchWindField : null;

type Panel =
  | { kind: 'none' }
  | { kind: 'feed' }
  | { kind: 'layers' }
  | { kind: 'menu' }
  | { kind: 'incident'; id: string }
  | { kind: 'evac'; zone: Record<string, any> }
  | { kind: 'point'; info: PointInfo }
  | { kind: 'feature'; selection: FeatureSelection };

const HEADER_HEIGHT = 56;
const BAR_SPACE = 76;
const APP_VERSION = Constants.expoConfig?.version ?? '';

const TAB_NOTICE: Partial<Record<MapTab, string>> = {
  models: 'HRRR, GFS and HAFS model forecasts are coming to the app in a later phase.',
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user } = useAuth();
  const plan = usePlan();
  const { incidents: feedIncidents, perimeters, loading, refreshing, error, lastUpdated, refresh } = useIncidents();
  // Reporter incidents from the dashboard: merged into matching fires (their updates, acreage and
  // containment show there) or shown on their own until an official feed lists the fire.
  const fireReports = useFireReports();
  const allIncidents = useMemo(() => mergeReporterIncidents(feedIncidents, fireReports), [feedIncidents, fireReports]);
  // Reporter event reports (hazmat, flooding, …): always shown, on every tab, as on the web.
  const hazardEvents = useHazardEvents();
  const { home, nearby, setNearby } = useHomeSetup();
  const { locations } = useSavedLocations();
  const params = useLocalSearchParams<{ incident?: string }>();

  const mapRef = useRef<SentinelMapHandle>(null);
  const [basemap, setBasemap] = useState<BasemapId>('satellite');
  const [tab, setTab] = useState<MapTab>('wildfire');
  const [layers, setLayers] = useState<LayerState>(TAB_PRESETS.wildfire);
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);

  const evacZones = useEvacZones(Boolean(layers.evacZones));
  const [feedTab, setFeedTab] = useState<FeedTab>('fires');
  const radar = useMrms(Boolean(layers.mrms));
  const lightning = useLightning(Boolean(layers.lightning));
  // The sidebar's stat pills count alerts too, so load them whenever it is open.
  const weatherAlerts = useWeatherAlerts(panel.kind === 'feed');
  const lastFeatureTap = useRef(0);
  // Measurement tool (ruler / hexagon in the layer card): map taps place points while it's on.
  const [measure, setMeasure] = useState<MeasureState | null>(null);
  const measuring = measure != null;

  // Layers that are on and allowed on this plan (the web turns locked layers off).
  const enabledKeys = useMemo(
    () =>
      Object.keys(layers).filter(k => {
        if (!layers[k]) return false;
        if (FIRE_DANGER_LAYER_KEYS.has(k)) return plan.hasFireDangerAccess;
        if (k === 'criticalInfrastructure' || k === 'landOwnership') return plan.hasProInfrastructureAccess;
        return true;
      }),
    [layers, plan.hasFireDangerAccess, plan.hasProInfrastructureAccess],
  );

  // NOAA overlays for the layers that are on; they refresh on their own cadence.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const rasterKeys = useMemo(
    () => enabledKeys.map(k => arcgisKeyFor(k)).filter((k): k is string => Boolean(k)),
    [enabledKeys],
  );
  const rasterLayers = useMemo(() => {
    const tenMinuteBucket = Math.floor(clock / 600_000);
    const overlays = enabledKeys.filter(k => RASTER_OVERLAY_KEYS.has(k)).flatMap(k => rasterOverlaysFor(k, tenMinuteBucket));
    const noaa = rasterKeys.map(key => {
      const def = ARCGIS_LAYERS[key];
      return { key, url: arcgisTileUrl(def, clock), opacity: def.opacity, minZoom: def.minZoom };
    });
    return [...overlays, ...noaa];
  }, [enabledKeys, rasterKeys, clock]);

  // The settled camera, for layers loaded by area and the wind particles.
  const [viewport, setViewport] = useState<Viewport | null>(null);

  // Individual Radar Site: station pills and the selected station's sweep.
  const radarSitesOn = enabledKeys.includes('radarSites');
  const radarSite = useRadarSite(radarSitesOn);

  // Wind particles: the current HRRR hour, refreshed every 15 minutes; paused while the map moves.
  const windOn = enabledKeys.includes('windParticles') && WindParticles != null;
  const [windField, setWindField] = useState<WindField | null>(null);
  const [cameraMoving, setCameraMoving] = useState(false);
  useEffect(() => {
    if (!windOn) return;
    let cancelled = false;
    const run = () =>
      fetchWindField!('hrrr')
        .then(f => !cancelled && setWindField(f))
        .catch(() => {});
    const first = setTimeout(run, 0);
    const timer = setInterval(run, 15 * 60_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [windOn]);
  const onViewportChange = useCallback((view: Viewport) => {
    setViewport(view);
    setCameraMoving(false);
  }, []);

  // GeoJSON layers (stations, cameras, gauges, TFRs, fire detections, …).
  const sourceKeys = useMemo(() => [...new Set(enabledKeys.flatMap(k => CATALOG_SOURCES[k] ?? []))], [enabledKeys]);
  const featureData = useFeatureLayers(sourceKeys, viewport);
  const stationKey = STATION_LAYER_KEYS.find(k => enabledKeys.includes(k));
  const hours = useMemo(() => smokeHours(featureData.data.ndgdSmokeForecast), [featureData.data.ndgdSmokeForecast]);
  // The forecast hour shown: starts at the hour nearest now, like the web's slider at its first hour.
  const [smokeHourPick, setSmokeHourPick] = useState<number | null>(null);
  const smokeHour = useMemo(() => {
    if (hours.length === 0) return null;
    if (smokeHourPick != null && hours.includes(smokeHourPick)) return smokeHourPick;
    return hours.reduce((best, h) => (Math.abs(h - clock) < Math.abs(best - clock) ? h : best), hours[0]);
  }, [hours, smokeHourPick, clock]);
  // Alert settings: hide types that are off and apply each type's colour, thickness and fill.
  const { settingsFor, overrides: alertOverrides } = useAlertSettings();
  const alertPolygons = useMemo<GeoJSON.FeatureCollection | undefined>(() => {
    const fc = featureData.data.nwsAlerts;
    if (!fc) return undefined;
    const features: GeoJSON.Feature[] = [];
    for (const f of fc.features) {
      const s = settingsFor(String(f.properties?.code));
      if (!s.enabled) continue;
      features.push({ ...f, properties: { ...f.properties, color: s.color, lineWidth: s.lineWidth, fillOpacity: s.fillOpacity } });
    }
    return { type: 'FeatureCollection', features };
  }, [featureData.data.nwsAlerts, settingsFor, alertOverrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const featureLayers = useMemo<FeatureLayerData[]>(
    () =>
      sourceKeys
        .filter(k => featureData.data[k])
        .map(k => ({
          key: k,
          data: k === 'nwsAlerts' && alertPolygons ? alertPolygons : featureData.data[k],
          specs:
            k === 'fireDangerStations' && stationKey
              ? stationStyles(STATION_LAYER_FIELD[stationKey])
              : k === 'ndgdSmokeForecast'
                ? smokeStyles(smokeHour)
                : k === 'nwsAlerts'
                  ? // The Wildfire tab's alerts row is Red Flag Warnings only.
                    alertPolygonStyles(tab === 'wildfire' ? ['FW.W'] : null)
                  : undefined,
        })),
    [sourceKeys, featureData.data, stationKey, smokeHour, tab, alertPolygons],
  );
  const mapFeatureLayers = useMemo<FeatureLayerData[]>(
    () => (hazardEvents.features.length ? [...featureLayers, { key: 'hazardEvents', data: hazardEvents }] : featureLayers),
    [featureLayers, hazardEvents],
  );

  const onMapPress = useCallback(
    (lng: number, lat: number, zoom: number) => {
      if (measuring) {
        setMeasure(m => (m ? { ...m, points: [...m.points, [lng, lat]] } : m));
        return;
      }
      // A tap on a fire or zone also reaches the map; that sheet wins.
      if (Date.now() - lastFeatureTap.current < 600) return;
      const wantAlerts = Boolean(layers.weatherAlerts);
      const wantFuel = enabledKeys.includes('fuelModels');
      if (!wantAlerts && !wantFuel && rasterKeys.length === 0) {
        setPanel({ kind: 'none' });
        return;
      }
      const base: PointInfo = { lat, lng, loading: true, alerts: [], features: [] };
      setPanel({ kind: 'point', info: base });
      setSheetIndex(0);
      const identifyKeys = rasterKeys;
      Promise.allSettled([
        wantAlerts ? fetchAlertsAtPoint(lat, lng) : Promise.resolve([]),
        ...identifyKeys.map(k => identifyArcgis(ARCGIS_LAYERS[k], lng, lat, zoom)),
        wantFuel ? fuelModelResult(lat, lng) : Promise.resolve([]),
      ]).then(([alertsResult, ...featureResults]) => {
        let alerts = alertsResult.status === 'fulfilled' ? (alertsResult.value as Awaited<ReturnType<typeof fetchAlertsAtPoint>>) : [];
        if (tab === 'wildfire') alerts = alerts.filter(a => a.event === 'Red Flag Warning');
        const features = featureResults.flatMap(r => (r.status === 'fulfilled' ? (r.value as Awaited<ReturnType<typeof identifyArcgis>>) : []));
        setPanel(prev =>
          prev.kind === 'point' && prev.info.lat === lat && prev.info.lng === lng
            ? { kind: 'point', info: { ...base, loading: false, alerts, features } }
            : prev,
        );
      });
    },
    [layers.weatherAlerts, enabledKeys, rasterKeys, tab, measuring],
  );

  // Near-me (web HomeNearbyStrip): fires within the Home radius of the live position.
  const nearMe = nearby && home ? { ...nearby, radiusMiles: home.radiusMiles } : null;
  const incidents = useMemo(
    () =>
      nearMe
        ? allIncidents.filter(i => haversineMiles(nearMe.latitude, nearMe.longitude, i.lat, i.lng) <= nearMe.radiusMiles)
        : allIncidents,
    [allIncidents, nearMe?.latitude, nearMe?.longitude, nearMe?.radiusMiles], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const placesShape = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    if (nearMe) features.push({ ...circlePolygon(nearMe.latitude, nearMe.longitude, nearMe.radiusMiles), properties: { kind: 'radius' } });
    if (home) features.push({ type: 'Feature', properties: { kind: 'home', name: 'Home' }, geometry: { type: 'Point', coordinates: [home.longitude, home.latitude] } });
    for (const l of locations) {
      features.push({ type: 'Feature', properties: { kind: 'saved', name: l.name }, geometry: { type: 'Point', coordinates: [l.longitude, l.latitude] } });
    }
    return { type: 'FeatureCollection', features };
  }, [nearMe?.latitude, nearMe?.longitude, nearMe?.radiusMiles, home, locations]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = useMemo(
    () => (panel.kind === 'incident' ? (allIncidents.find(i => i.id === panel.id) ?? null) : null),
    [allIncidents, panel],
  );
  const incidentShape = useMemo(() => incidentsToFeatureCollection(incidents), [incidents]);

  const snapPoints = useMemo(() => {
    const h = (f: number) => Math.round(height * f);
    switch (panel.kind) {
      case 'incident':
        return [h(0.5), h(0.92)];
      case 'evac':
        return [h(0.42), h(0.7)];
      default:
        return [h(0.45), h(0.85)];
    }
  }, [panel.kind, height]);

  // Detail panels are bottom sheets (the web's mobile IncidentSidebar); the feed, menu and layers are overlays.
  const sheetOpen = panel.kind === 'incident' || panel.kind === 'evac' || panel.kind === 'point' || panel.kind === 'feature';
  const overlayOpen = panel.kind === 'feed' || panel.kind === 'menu' || panel.kind === 'layers';
  const mapBottomInset = sheetOpen ? snapPoints[0] : BAR_SPACE + insets.bottom;
  const topInset = insets.top + HEADER_HEIGHT;

  const openPanel = useCallback((next: Panel) => {
    setPanel(next);
    setSheetIndex(0);
  }, []);
  /** Corner and bar buttons toggle their panel, like the web's. */
  const togglePanel = useCallback((kind: 'feed' | 'menu' | 'layers') => {
    setPanel(prev => (prev.kind === kind ? { kind: 'none' } : { kind }));
  }, []);
  const closePanel = useCallback(() => setPanel({ kind: 'none' }), []);

  const selectIncident = useCallback(
    (id: string) => {
      // While measuring, the tap places a point instead (the map's own press handles it).
      if (measuring) return;
      const inc = allIncidents.find(i => i.id === id);
      if (!inc) return;
      lastFeatureTap.current = Date.now();
      openPanel({ kind: 'incident', id });
      mapRef.current?.flyTo(inc.lng, inc.lat, inc.acres >= 5000 ? 9 : 10.5);
    },
    [allIncidents, openPanel, measuring],
  );

  const changeTab = useCallback((next: MapTab) => {
    setTab(next);
    setLayers(prev => ({ ...prev, ...TAB_PRESETS[next] }));
  }, []);

  const locateMe = useCallback(async () => {
    if (nearby) {
      setNearby(null);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location is off', 'Allow location access in Settings to see fires near you.');
      return;
    }
    setShowUserLocation(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      if (home) {
        setNearby({ latitude, longitude });
        // Roughly fit the radius on screen.
        const zoom = Math.max(4, Math.min(12, 13.6 - Math.log2(home.radiusMiles)));
        mapRef.current?.flyTo(longitude, latitude, zoom);
      } else {
        mapRef.current?.flyTo(longitude, latitude, 8);
        Alert.alert('See only fires near you', 'Set up Home with an alert radius, and the locate button will filter to fires near you.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Set up Home', onPress: () => router.push('/places') },
        ]);
      }
    } catch {
      Alert.alert('Location unavailable', 'Your position could not be determined right now.');
    }
  }, [home, nearby, setNearby]);

  // Opened from My Places → Following: select that fire once incidents are loaded.
  const handledParam = useRef<string | null>(null);
  useEffect(() => {
    const id = params.incident;
    if (!id || handledParam.current === id || allIncidents.length === 0) return;
    handledParam.current = id;
    const inc = allIncidents.find(i => i.fireId === id || i.id === id || i.aliasIds.includes(id));
    const timer = setTimeout(() => {
      if (inc) {
        setNearby(null);
        openPanel({ kind: 'incident', id: inc.id });
        mapRef.current?.flyTo(inc.lng, inc.lat, inc.acres >= 5000 ? 9 : 10.5);
      } else {
        Alert.alert('Fire not in the live feed', 'This fire is no longer in the active incident feeds.');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [params.incident, allIncidents, openPanel, setNearby]);

  if (!isMapboxConfigured) {
    return (
      <View style={[styles.root, styles.center]}>
        <EmptyState
          title="Map not configured"
          message="Set EXPO_PUBLIC_MAPBOX_TOKEN (a public pk. token) in mobile/.env.local, then restart Metro."
        />
      </View>
    );
  }

  const relative = lastUpdated ? formatRelative(lastUpdated) : null;
  const notice = TAB_NOTICE[tab];
  const bannerMessage =
    mapError ?? (error && incidents.length > 0 ? `Couldn't refresh fire data. Showing data from ${relative ?? 'earlier'}.` : notice);
  const barBottom = insets.bottom + 12;

  return (
    <View style={styles.root}>
      <SentinelMap
        ref={mapRef}
        basemap={basemap}
        showFires={Boolean(layers.incidentLocations)}
        showEvacZones={Boolean(layers.evacZones)}
        showUserLocation={showUserLocation}
        incidents={incidentShape}
        perimeters={perimeters}
        evacZones={evacZones}
        places={placesShape}
        selectedId={selected?.id ?? null}
        selectedFireKey={selected?.fireKey ?? null}
        bottomInset={mapBottomInset}
        topInset={topInset}
        onSelectIncident={selectIncident}
        rasterLayers={rasterLayers}
        featureLayers={mapFeatureLayers}
        onViewportChange={onViewportChange}
        onCameraMove={windOn ? () => setCameraMoving(true) : undefined}
        radarSites={radarSitesOn ? { shape: radarSite.sitesShape, selectedId: radarSite.selectedId } : null}
        radarSweep={radarSite.image ? { ...radarSite.image, opacity: radarSite.opacity } : null}
        measureShape={measure ? measureShape(measure) : null}
        onRadarSitePress={id => {
          if (measuring) return;
          lastFeatureTap.current = Date.now();
          radarSite.toggleSite(id);
        }}
        onFeaturePress={(sourceKey, feature) => {
          if (measuring) return;
          lastFeatureTap.current = Date.now();
          const center = featureCenter(feature);
          openPanel({ kind: 'feature', selection: { sourceKey, properties: feature.properties ?? {}, lng: center[0], lat: center[1] } });
        }}
        radar={layers.mrms ? radar.value : null}
        lightning={layers.lightning ? lightning.value : null}
        onSelectEvacZone={zone => {
          if (measuring) return;
          lastFeatureTap.current = Date.now();
          openPanel({ kind: 'evac', zone });
        }}
        onMapPress={onMapPress}
        onMapError={setMapError}
      />

      {windOn && WindParticles ? (
        <WindParticles
          field={windField}
          moving={cameraMoving}
          view={viewport ? { center: viewport.center, zoom: viewport.zoom, heading: viewport.heading ?? 0, pitch: viewport.pitch ?? 0 } : null}
        />
      ) : null}

      {/* Sidebar and menu panels sit under the corner buttons, like the web's at phone width. */}
      {panel.kind === 'feed' ? (
        <SidebarPanel
          tab={tab}
          feedTab={feedTab}
          onFeedTab={setFeedTab}
          incidents={incidents}
          loading={loading}
          refreshing={refreshing}
          error={error}
          onRefresh={refresh}
          selectedId={null}
          onSelectIncident={inc => selectIncident(inc.id)}
          alerts={weatherAlerts}
          top={topInset}
        />
      ) : null}
      {panel.kind === 'menu' ? (
        <MenuPanel
          basemap={basemap}
          onBasemapChange={setBasemap}
          onOpenPlaces={() => {
            closePanel();
            router.push('/places');
          }}
          top={topInset}
        />
      ) : null}

      {/* Header (web Header.jsx) */}
      <View style={[styles.header, { paddingTop: insets.top, height: topInset }]}>
        <View style={styles.brand}>
          <Flame size={22} color={fire[600]} />
          <Text style={styles.brandName}>Sentinel</Text>
        </View>
        <RefreshButton busy={refreshing || loading} onPress={refresh} />
      </View>

      {/* Corner buttons (web MapCornerButtons.jsx, AccountButton.jsx) */}
      {!sheetOpen || sheetIndex === 0 ? (
        <>
          <View style={[styles.cornerLeft, { top: topInset + 16 }]}>
            <CornerButton label="Open more features panel" onPress={() => togglePanel('menu')} active={panel.kind === 'menu'}>
              <Menu size={20} color={accent.white} />
            </CornerButton>
            <CornerButton
              label="Open incident sidebar"
              onPress={() => {
                setFeedTab(tab === 'weather' ? 'alerts' : 'fires');
                togglePanel('feed');
              }}
              active={panel.kind === 'feed'}
            >
              <Text style={styles.bang}>!</Text>
            </CornerButton>
            <CornerButton label={nearby ? 'Turn off near me' : 'Go to my current location'} onPress={locateMe} active={Boolean(nearby)}>
              <LocateFixed size={20} color={accent.white} />
            </CornerButton>
          </View>
          <View style={[styles.cornerRight, { top: topInset + 16 }]}>
            <CornerButton label={user ? 'Open account menu' : 'Sign in'} onPress={() => router.push('/account')}>
              <CircleUserRound size={20} color={accent.white} />
              {user ? <View style={styles.signedInDot} /> : null}
            </CornerButton>
          </View>
        </>
      ) : null}

      {/* Measurement results, between the corner buttons (web MeasurementPanel at phone width). */}
      {measure && !sheetOpen ? (
        <View style={[styles.measurePanel, { top: topInset + 16 }]}>
          <MeasurementPanel
            measure={measure}
            onUndo={() => setMeasure(m => (m ? { ...m, points: m.points.slice(0, -1) } : m))}
            onClear={() => setMeasure(m => (m ? { ...m, points: [] } : m))}
            onClose={() => setMeasure(null)}
          />
        </View>
      ) : null}

      {/* Near-me strip (web HomeNearbyStrip) */}
      {nearMe && !sheetOpen && !overlayOpen && !measure ? (
        <View style={[styles.nearStrip, { top: topInset + 16 }]}>
          <Navigation size={14} color={fire[400]} />
          <Pressable style={{ flex: 1 }} onPress={() => openPanel({ kind: 'feed' })} accessibilityRole="button">
            <Text style={styles.nearText}>
              {incidents.length === 0
                ? `No fires within ${nearMe.radiusMiles} mi`
                : `${incidents.length} fire${incidents.length === 1 ? '' : 's'} within ${nearMe.radiusMiles} mi`}
            </Text>
          </Pressable>
          <Pressable onPress={() => setNearby(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Turn off near me">
            <X size={16} color={sentinelText[200]} />
          </Pressable>
        </View>
      ) : null}

      {/* First load: say the fires are on their way rather than showing an empty map. */}
      {loading && allIncidents.length === 0 && !sheetOpen && !overlayOpen && !measure && !nearMe ? (
        <View style={[styles.loadingPill, { top: topInset + 20 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={fire[400]} />
          <Text style={styles.loadingText}>Loading fires…</Text>
        </View>
      ) : null}

      {/* Zoom stack and version (web MapZoomControl.jsx) */}
      {!sheetOpen && !overlayOpen ? (
        <View style={[styles.zoomWrap, { bottom: barBottom + 72 }]} pointerEvents="box-none">
          <ZoomControl
            onZoomIn={() => mapRef.current?.zoomBy(1)}
            onZoomOut={() => mapRef.current?.zoomBy(-1)}
            onResetNorth={() => mapRef.current?.resetNorth()}
          />
        </View>
      ) : null}
      {!sheetOpen ? <Text style={[styles.version, { bottom: insets.bottom - 2 }]}>v{APP_VERSION}</Text> : null}

      {bannerMessage && !sheetOpen && !overlayOpen ? (
        <View style={[styles.banner, { bottom: BAR_SPACE + insets.bottom + 8 }]}>
          <Banner message={bannerMessage} tone={mapError ? 'error' : 'warn'} onPress={!mapError && error ? refresh : undefined} />
        </View>
      ) : null}

      {radarSitesOn && !sheetOpen && !overlayOpen ? (
        <View style={[styles.radarPanel, { bottom: barBottom + 72 }]}>
          <RadarSitePanel radar={radarSite} />
        </View>
      ) : null}

      {smokeHour != null && hours.length > 1 && !sheetOpen && !overlayOpen && !radarSitesOn ? (
        <View style={[styles.smokeChip, { bottom: barBottom + 72 }]}>
          <Pressable
            onPress={() => setSmokeHourPick(hours[Math.max(0, hours.indexOf(smokeHour) - 1)])}
            disabled={hours.indexOf(smokeHour) === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Earlier smoke forecast hour"
            style={styles.smokeStep}
          >
            <ChevronLeft size={18} color={hours.indexOf(smokeHour) === 0 ? sentinelText[500] : accent.white} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.smokeTitle}>Smoke forecast</Text>
            <Text style={styles.smokeTime}>
              {new Date(smokeHour).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
          <Pressable
            onPress={() => setSmokeHourPick(hours[Math.min(hours.length - 1, hours.indexOf(smokeHour) + 1)])}
            disabled={hours.indexOf(smokeHour) === hours.length - 1}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Later smoke forecast hour"
            style={styles.smokeStep}
          >
            <ChevronRight size={18} color={hours.indexOf(smokeHour) === hours.length - 1 ? sentinelText[500] : accent.white} />
          </Pressable>
        </View>
      ) : null}

      {panel.kind === 'layers' ? (
        <View style={[styles.layersWrap, { bottom: barBottom + 72 }]}>
          <LayerPanel
            tab={tab}
            layers={layers}
            onToggle={(key, on) =>
              setLayers(prev => {
                const next = { ...prev, [key]: on };
                // The station layers share one map layer, so only one is on at a time (as on the web).
                if (on && STATION_LAYER_KEYS.includes(key)) for (const k of STATION_LAYER_KEYS) if (k !== key) next[k] = false;
                return next;
              })
            }
            maxHeight={height - topInset - barBottom - 140}
            measureMode={measure?.mode ?? null}
            onMeasure={(mode: MeasureMode | null) => {
              // Like the web, a new mode starts fresh; the card closes so the map is free to tap.
              setMeasure(mode ? { mode, points: [] } : null);
              if (mode) closePanel();
            }}
          />
        </View>
      ) : null}

      {!sheetOpen ? (
        <View style={[styles.barWrap, { bottom: barBottom }]} pointerEvents="box-none">
          <MapBottomBar
            tab={tab}
            onTabChange={changeTab}
            layersOpen={panel.kind === 'layers'}
            onLayersPress={() => togglePanel('layers')}
            layerCount={enabledKeys.length}
          />
        </View>
      ) : null}

      {sheetOpen ? (
        <BottomSheet
          key={panel.kind === 'incident' ? `incident-${panel.id}` : panel.kind}
          snapPoints={snapPoints}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          onClose={closePanel}
        >
          {panel.kind === 'incident' && selected && <IncidentSheet incident={selected} onClose={closePanel} />}
          {panel.kind === 'evac' && <EvacZoneSheet zone={panel.zone} onClose={closePanel} />}
          {panel.kind === 'point' && <PointInfoSheet info={panel.info} onClose={closePanel} />}
          {panel.kind === 'feature' && <FeatureSheet selection={panel.selection} onClose={closePanel} />}
        </BottomSheet>
      ) : null}
    </View>
  );
}

/** A fuel model reading at a tapped point, shaped like an ArcGIS identify result. */
async function fuelModelResult(lat: number, lng: number): Promise<IdentifyResult[]> {
  const fuel = await fetchFuelModelAt(lat, lng);
  if (!fuel) return [];
  return [
    {
      title: 'Fuel model',
      layerName: `${fuel.model} · ${fuel.name}`,
      attributes: { 'Fuel group': fuel.group, Burnable: fuel.burnable ? 'Yes' : 'No', Dataset: fuel.dataset },
    },
  ];
}

/** Where to anchor a tapped feature's sheet: its point, or the first vertex of a line or area. */
function featureCenter(feature: GeoJSON.Feature): [number, number] {
  let g: any = feature.geometry;
  if (!g) return [0, 0];
  if (g.type === 'GeometryCollection') g = g.geometries[0];
  let c: any = g.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return [Number(c?.[0]) || 0, Number(c?.[1]) || 0];
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sentinel[900] },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(10,12,14,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: sentinel[700],
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { color: accent.white, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  cornerLeft: { position: 'absolute', left: 16, gap: 12 },
  cornerRight: { position: 'absolute', right: 16 },
  bang: { color: accent.white, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  signedInDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: sentinel[900],
  },
  nearStrip: {
    position: 'absolute',
    left: 72,
    right: 72,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.5)',
    backgroundColor: 'rgba(10,12,14,0.9)',
    ...shadow,
  },
  nearText: { color: accent.white, fontSize: 14, fontWeight: '600' },
  zoomWrap: { position: 'absolute', right: 16 },
  version: { position: 'absolute', right: 8, color: sentinelText[300], fontSize: 11, fontVariant: ['tabular-nums'] },
  // Clears the zoom stack on the right.
  banner: { position: 'absolute', left: 12, right: 64 },
  loadingPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: 'rgba(10,12,14,0.9)',
    ...shadow,
  },
  loadingText: { color: sentinelText[100], fontSize: 13, fontWeight: '600' },
  layersWrap: { position: 'absolute', left: 16, right: 16 },
  smokeChip: {
    position: 'absolute',
    left: 16,
    // Clears the zoom stack on the right.
    right: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: 'rgba(10,12,14,0.92)',
    ...shadow,
  },
  measurePanel: { position: 'absolute', left: 72, right: 72 },
  radarPanel: { position: 'absolute', left: 16, right: 72 },
  smokeStep: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  smokeTitle: { color: sentinelText[300], fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  smokeTime: { color: accent.white, fontSize: 14, fontWeight: '600', marginTop: 1 },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
