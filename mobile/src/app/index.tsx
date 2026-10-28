/**
 * The live map, matching the web's LiveTrackerPage at phone width: the Sentinel header (flame, name,
 * refresh), round corner buttons (menu, incident sidebar "!", locate; account on the right), the
 * full-bleed map, the zoom stack, and the floating bottom bar with the layers button and map tabs.
 * The sidebar and menu open as full-width panels and layers as a floating card, as on the web;
 * fire, zone and spot details open as a bottom sheet like the web's mobile incident sheet.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleUserRound, Flame, LocateFixed, Menu, Navigation, RefreshCw, X } from 'lucide-react-native';
import Constants from 'expo-constants';

import { useAuth } from '@/auth/AuthContext';
import { BottomSheet } from '@/components/BottomSheet';
import { EvacZoneSheet } from '@/components/EvacZoneSheet';
import { IncidentSheet } from '@/components/IncidentSheet';
import { LayerPanel } from '@/components/LayerPanel';
import { MapBottomBar } from '@/components/MapBottomBar';
import { CornerButton, ZoomControl } from '@/components/MapChrome';
import { MenuPanel } from '@/components/MenuPanel';
import { PointInfoSheet, type PointInfo } from '@/components/PointInfoSheet';
import { SidebarPanel, type FeedTab } from '@/components/SidebarPanel';
import { Banner, EmptyState } from '@/components/ui';
import { isMapboxConfigured } from '@/config/env';
import { useHomeSetup } from '@/context/HomeSetupContext';
import { ARCGIS_LAYERS, arcgisKeyFor, arcgisTileUrl, identifyArcgis } from '@/data/arcgisLayers';
import { incidentsToFeatureCollection } from '@/data/incidents';
import { fetchAlertsAtPoint } from '@/data/weatherAlerts';
import { useEvacZones } from '@/hooks/useEvacZones';
import { useIncidents } from '@/hooks/useIncidents';
import { useSavedLocations } from '@/hooks/useSavedLocations';
import { useLightning, useMrms, useWeatherAlerts } from '@/hooks/useWeatherData';
import { circlePolygon, haversineMiles } from '@/lib/geocode';
import { TAB_PRESETS, type LayerState, type MapTab } from '@/map/catalog';
import type { BasemapId } from '@/map/layers';
import { SentinelMap, type SentinelMapHandle } from '@/map/SentinelMap';
import { accent, fire, sentinel, sentinelText } from '@/theme';
import { formatRelative } from '@/utils/format';

type Panel =
  | { kind: 'none' }
  | { kind: 'feed' }
  | { kind: 'layers' }
  | { kind: 'menu' }
  | { kind: 'incident'; id: string }
  | { kind: 'evac'; zone: Record<string, any> }
  | { kind: 'point'; info: PointInfo };

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
  const { incidents: allIncidents, perimeters, loading, refreshing, error, lastUpdated, refresh } = useIncidents();
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

  // NOAA overlays for the layers that are on; they refresh on their own cadence.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const rasterKeys = useMemo(
    () =>
      Object.keys(layers)
        .filter(k => layers[k])
        .map(k => arcgisKeyFor(k, tab))
        .filter((k): k is string => Boolean(k)),
    [layers, tab],
  );
  const rasterLayers = useMemo(
    () =>
      rasterKeys.map(key => {
        const def = ARCGIS_LAYERS[key];
        return { key, url: arcgisTileUrl(def, clock), opacity: def.opacity, minZoom: def.minZoom };
      }),
    [rasterKeys, clock],
  );

  const onMapPress = useCallback(
    (lng: number, lat: number, zoom: number) => {
      // A tap on a fire or zone also reaches the map; that sheet wins.
      if (Date.now() - lastFeatureTap.current < 600) return;
      const wantAlerts = Boolean(layers.weatherAlerts);
      if (!wantAlerts && rasterKeys.length === 0) {
        setPanel({ kind: 'none' });
        return;
      }
      const base: PointInfo = { lat, lng, loading: true, alerts: [], features: [] };
      setPanel({ kind: 'point', info: base });
      setSheetIndex(0);
      const identifyKeys = rasterKeys.filter(k => k !== 'weatherAlerts' && k !== 'redFlagWarnings');
      Promise.allSettled([
        wantAlerts ? fetchAlertsAtPoint(lat, lng) : Promise.resolve([]),
        ...identifyKeys.map(k => identifyArcgis(ARCGIS_LAYERS[k], lng, lat, zoom)),
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
    [layers.weatherAlerts, rasterKeys, tab],
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
  const sheetOpen = panel.kind === 'incident' || panel.kind === 'evac' || panel.kind === 'point';
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
      const inc = allIncidents.find(i => i.id === id);
      if (!inc) return;
      lastFeatureTap.current = Date.now();
      openPanel({ kind: 'incident', id });
      mapRef.current?.flyTo(inc.lng, inc.lat, inc.acres >= 5000 ? 9 : 10.5);
    },
    [allIncidents, openPanel],
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
        radar={layers.mrms ? radar.value : null}
        lightning={layers.lightning ? lightning.value : null}
        onSelectEvacZone={zone => {
          lastFeatureTap.current = Date.now();
          openPanel({ kind: 'evac', zone });
        }}
        onMapPress={onMapPress}
        onMapError={setMapError}
      />

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
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh data"
          accessibilityState={{ busy: refreshing || loading }}
          hitSlop={8}
          style={({ pressed }) => [styles.refresh, pressed && { backgroundColor: sentinel[700] }]}
        >
          <RefreshCw size={18} color={refreshing || loading ? sentinelText[500] : sentinelText[200]} />
        </Pressable>
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

      {/* Near-me strip (web HomeNearbyStrip) */}
      {nearMe && !sheetOpen && !overlayOpen ? (
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

      {/* Zoom stack and version (web MapZoomControl.jsx) */}
      {!sheetOpen && !overlayOpen ? (
        <View style={[styles.zoomWrap, { bottom: barBottom + 4 }]} pointerEvents="box-none">
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

      {panel.kind === 'layers' ? (
        <View style={[styles.layersWrap, { bottom: barBottom + 64 }]}>
          <LayerPanel
            tab={tab}
            layers={layers}
            onToggle={(key, on) => setLayers(prev => ({ ...prev, [key]: on }))}
            maxHeight={height - topInset - barBottom - 140}
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
        </BottomSheet>
      ) : null}
    </View>
  );
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
  refresh: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
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
  banner: { position: 'absolute', left: 12, right: 12 },
  layersWrap: { position: 'absolute', left: 16, right: 16 },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
