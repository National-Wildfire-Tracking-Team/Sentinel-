/**
 * The live map, drawn like the web's MapView layers:
 *   - fire points (IncidentLocationsLayer.jsx): containment-colored dots with a white stroke and glow;
 *     clusters up to zoom 8 (radius 45) shown as the Sentinel flame, its outline red when a third or
 *     more of its fires are uncontained, orange when any are active, grey otherwise
 *   - perimeters (FirePerimetersLayer.jsx): orange fill and outline
 *   - evacuation zones (EvacuationZonesLayer.jsx): order/warning/watch fills, reporter zones dashed
 */
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Mapbox from '@rnmapbox/maps';

import { ENV } from '@/config/env';
import { mrmsRasterColor, type MrmsFrame } from '@/data/mrms';
import { colors } from '@/theme';
import { BASEMAPS, CONUS_BOUNDS, type BasemapId } from './layers';

Mapbox.setAccessToken(ENV.mapboxToken || null);

type OnPressEvent = Parameters<NonNullable<React.ComponentProps<typeof Mapbox.ShapeSource>['onPress']>>[0];

export interface SentinelMapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  zoomBy: (delta: number) => void;
  resetNorth: () => void;
  resetView: () => void;
}

interface Props {
  basemap: BasemapId;
  showFires: boolean;
  showEvacZones: boolean;
  showUserLocation: boolean;
  incidents: GeoJSON.FeatureCollection;
  perimeters: GeoJSON.FeatureCollection;
  evacZones: GeoJSON.FeatureCollection;
  /** Home, saved locations and the near-me radius. */
  places: GeoJSON.FeatureCollection;
  /** NOAA ArcGIS raster overlays to draw, bottom to top. */
  rasterLayers: { key: string; url: string; opacity: number; minZoom?: number }[];
  /** Latest MRMS radar frame, when radar is on. */
  radar: MrmsFrame | null;
  /** GLM lightning flashes, when lightning is on. */
  lightning: GeoJSON.FeatureCollection | null;
  selectedId: string | null;
  selectedFireKey: string | null;
  /** Extra bottom padding (px) so camera moves keep targets above sheets and the bottom bar. */
  bottomInset: number;
  topInset: number;
  onSelectIncident: (id: string) => void;
  onSelectEvacZone: (props: Record<string, any>) => void;
  /** A tap on the map itself (not on a fire or zone). */
  onMapPress: (lng: number, lat: number, zoom: number) => void;
  onMapError: (message: string) => void;
}

const FLAME_IMAGES = {
  'fire-cluster-red': require('@/assets/map/flame-red.png'),
  'fire-cluster-active': require('@/assets/map/flame-active.png'),
  'fire-cluster-contained': require('@/assets/map/flame-contained.png'),
};

const CLUSTER_MAX_ZOOM = 8;
const CLUSTER_RADIUS = 45;
const TEXT_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];
const fire600 = '#ff5a00';

// `contained` is -1 when unknown (treated as 0%, like the web's coalesce(…, 0)).
const IS_FULLY_CONTAINED = ['>=', ['get', 'contained'], 100];
const IS_RED_DOT = ['<', ['get', 'contained'], 1];
const CONTAINMENT_COLOR = [
  'case',
  IS_FULLY_CONTAINED, colors.contained,
  IS_RED_DOT, colors.uncontained,
  ['interpolate', ['linear'], ['get', 'contained'],
    25, colors.containment25,
    50, colors.containment50,
    75, colors.containment75],
];

const CLUSTER_PROPERTIES = {
  activeCount: ['+', ['case', IS_FULLY_CONTAINED, 0, 1]],
  redCount: ['+', ['case', IS_RED_DOT, 1, 0]],
};
const CLUSTER_COUNT = (name: string) => ['coalesce', ['get', name], 0];
const CLUSTER_ICON = [
  'case',
  ['all', ['>', CLUSTER_COUNT('redCount'), 0], ['>=', ['*', CLUSTER_COUNT('redCount'), 3], ['get', 'point_count']]],
  'fire-cluster-red',
  ['>', CLUSTER_COUNT('activeCount'), 0],
  'fire-cluster-active',
  'fire-cluster-contained',
];
const CLUSTER_SIZE_STEP = (small: number, medium: number, large: number) =>
  ['step', ['get', 'point_count'], small, 10, medium, 50, large];

// ['zoom'] may only appear in a top-level interpolate, so each ring gets its own ramp.
const zoomRamp = (scale: number, add = 0) =>
  ['interpolate', ['linear'], ['zoom'], 3, 6 * scale + add, 8, 8 * scale + add, 12, 10 * scale + add];
const DOT_RADIUS = zoomRamp(1);
const GLOW_RADIUS = zoomRamp(2);
const SELECTED_RADIUS = zoomRamp(1, 5);

// Evacuation zones (evacZonesPaint.js)
const EVAC_COLOR = [
  'match', ['get', 'warningType'],
  'Evacuation Order', '#ef4444',
  'Evacuation Warning', '#f97316',
  'Evacuation Watch', '#eab308',
  '#f97316',
];
const EVAC_FILL_OPACITY = [
  'match', ['get', 'warningType'],
  'Evacuation Order', 0.1,
  'Evacuation Warning', 0.08,
  'Evacuation Watch', 0.06,
  0.07,
];
const EVAC_LINE_WIDTH = ['match', ['get', 'warningType'], 'Evacuation Order', 2.5, 'Evacuation Warning', 2, 1.5];
const IS_REPORTER_ZONE = ['==', ['get', 'source'], 'reporter'] as const;

export const SentinelMap = forwardRef<SentinelMapHandle, Props>(function SentinelMap(
  {
    basemap,
    showFires,
    showEvacZones,
    showUserLocation,
    incidents,
    perimeters,
    evacZones,
    places,
    rasterLayers,
    radar,
    lightning,
    selectedId,
    selectedFireKey,
    bottomInset,
    topInset,
    onSelectIncident,
    onSelectEvacZone,
    onMapPress,
    onMapError,
  },
  ref,
) {
  const camera = useRef<Mapbox.Camera>(null);
  const mapView = useRef<Mapbox.MapView>(null);
  const incidentSource = useRef<Mapbox.ShapeSource>(null);
  const padding = { paddingTop: topInset + 16, paddingBottom: bottomInset + 16, paddingLeft: 24, paddingRight: 24 };

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 9) =>
      camera.current?.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: zoom,
        padding,
        animationDuration: 900,
        animationMode: 'flyTo',
      }),
    zoomBy: async delta => {
      const zoom = (await mapView.current?.getZoom()) ?? 4;
      camera.current?.setCamera({ zoomLevel: zoom + delta, animationDuration: 300 });
    },
    resetNorth: () => camera.current?.setCamera({ heading: 0, pitch: 0, animationDuration: 400 }),
    resetView: () =>
      camera.current?.fitBounds(
        CONUS_BOUNDS.ne,
        CONUS_BOUNDS.sw,
        [padding.paddingTop, 24, padding.paddingBottom, 24],
        900,
      ),
  }));

  const handleIncidentPress = useCallback(
    async (event: OnPressEvent) => {
      const feature = event.features[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      if (props.cluster) {
        try {
          const zoom = await incidentSource.current?.getClusterExpansionZoom(feature);
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          camera.current?.setCamera({
            centerCoordinate: [lng, lat],
            zoomLevel: Math.min((zoom ?? CLUSTER_MAX_ZOOM) + 0.5, 14),
            animationDuration: 600,
          });
        } catch {
          // Cluster vanished mid-refresh; ignore.
        }
        return;
      }
      if (props.id) onSelectIncident(String(props.id));
    },
    [onSelectIncident],
  );

  const handleEvacPress = useCallback(
    (event: OnPressEvent) => {
      const props = event.features[0]?.properties;
      if (props) onSelectEvacZone(props);
    },
    [onSelectEvacZone],
  );

  return (
    <Mapbox.MapView
      ref={mapView}
      style={StyleSheet.absoluteFill}
      styleURL={BASEMAPS[basemap].styleURL}
      projection="mercator"
      scaleBarEnabled={false}
      compassEnabled={false}
      logoPosition={{ bottom: bottomInset + 4, left: 8 }}
      attributionPosition={{ bottom: bottomInset + 4, left: 100 }}
      onPress={async (feature: GeoJSON.Feature) => {
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        const zoom = (await mapView.current?.getZoom()) ?? 4;
        onMapPress(lng, lat, zoom);
      }}
      onMapLoadingError={() => onMapError('The map style failed to load. Check your connection.')}
    >
      <Mapbox.Camera
        ref={camera}
        defaultSettings={{
          bounds: { ne: CONUS_BOUNDS.ne, sw: CONUS_BOUNDS.sw, paddingTop: topInset, paddingBottom: bottomInset, paddingLeft: 12, paddingRight: 12 },
        }}
        minZoomLevel={1}
        maxZoomLevel={18}
      />
      <Mapbox.Images images={FLAME_IMAGES} />

      {rasterLayers.map(layer => (
        <Mapbox.RasterSource key={`${layer.key}:${layer.url}`} id={`wx-${layer.key}`} tileUrlTemplates={[layer.url]} tileSize={512}>
          <Mapbox.RasterLayer
            id={`wx-${layer.key}-layer`}
            minZoomLevel={layer.minZoom}
            style={{ rasterOpacity: layer.opacity, rasterFadeDuration: 0 }}
          />
        </Mapbox.RasterSource>
      ))}

      {radar ? (
        <Mapbox.ImageSource id="mrms" url={radar.url} coordinates={radar.coordinates}>
          <Mapbox.RasterLayer
            id="mrms-layer"
            style={{
              rasterColor: mrmsRasterColor(radar.spec) as any,
              rasterColorMix: [255, 0, 0, 0],
              rasterColorRange: [0, 255],
              rasterResampling: 'linear',
              rasterFadeDuration: 0,
              rasterOpacity: 0.85,
            }}
          />
        </Mapbox.ImageSource>
      ) : null}

      {lightning ? (
        <Mapbox.ShapeSource id="lightning" shape={lightning}>
          <Mapbox.CircleLayer
            id="lightning-flashes"
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6] as any,
              circleColor: [
                'step',
                ['get', 'age'],
                '#ffffff',
                120,
                '#ffe14d',
                300,
                '#ff9f1c',
                600,
                '#ff4d2e',
              ] as any,
              circleStrokeColor: '#000000',
              circleStrokeWidth: 0.5,
              circleOpacity: 0.95,
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}

      {showUserLocation && <Mapbox.LocationPuck puckBearingEnabled puckBearing="heading" pulsing={{ isEnabled: true }} />}

      <Mapbox.ShapeSource id="places" shape={places}>
        <Mapbox.FillLayer id="places-radius-fill" filter={['==', ['get', 'kind'], 'radius']} style={{ fillColor: fire600, fillOpacity: 0.06 }} />
        <Mapbox.LineLayer
          id="places-radius-line"
          filter={['==', ['get', 'kind'], 'radius']}
          style={{ lineColor: fire600, lineWidth: 2, lineDasharray: [2, 2], lineOpacity: 0.9 }}
        />
        <Mapbox.CircleLayer
          id="places-points"
          filter={['!=', ['get', 'kind'], 'radius']}
          style={{
            circleRadius: ['match', ['get', 'kind'], 'home', 7, 5] as any,
            circleColor: ['match', ['get', 'kind'], 'home', '#38bdf8', '#a78bfa'] as any,
            circleStrokeColor: '#ffffff',
            circleStrokeWidth: 2,
          }}
        />
        <Mapbox.SymbolLayer
          id="places-labels"
          filter={['!=', ['get', 'kind'], 'radius']}
          minZoomLevel={6}
          style={{
            textField: ['get', 'name'] as any,
            textFont: TEXT_FONT,
            textSize: 11,
            textColor: '#ffffff',
            textHaloColor: 'rgba(0,0,0,0.85)',
            textHaloWidth: 1.2,
            textOffset: [0, 1.2],
            textAnchor: 'top',
            textOptional: true,
          }}
        />
      </Mapbox.ShapeSource>

      {showEvacZones && (
        <Mapbox.ShapeSource id="evac-zones" shape={evacZones} onPress={handleEvacPress}>
          <Mapbox.FillLayer id="evac-zones-fill" style={{ fillColor: EVAC_COLOR as any, fillOpacity: EVAC_FILL_OPACITY as any }} />
          <Mapbox.LineLayer
            id="evac-zones-line"
            filter={['!', IS_REPORTER_ZONE] as any}
            style={{ lineColor: EVAC_COLOR as any, lineWidth: EVAC_LINE_WIDTH as any, lineOpacity: 0.9 }}
          />
          <Mapbox.LineLayer
            id="evac-zones-line-reporter-halo"
            filter={IS_REPORTER_ZONE as any}
            style={{ lineColor: '#ffffff', lineWidth: 4, lineOpacity: 0.35 }}
          />
          <Mapbox.LineLayer
            id="evac-zones-line-reporter"
            filter={IS_REPORTER_ZONE as any}
            style={{ lineColor: EVAC_COLOR as any, lineWidth: 2.5, lineDasharray: [3, 2] }}
          />
        </Mapbox.ShapeSource>
      )}

      {showFires && (
        <Mapbox.ShapeSource id="perimeters" shape={perimeters}>
          <Mapbox.FillLayer id="perimeters-fill" style={{ fillColor: colors.perimeter, fillOpacity: 0.22 }} />
          <Mapbox.LineLayer id="perimeters-line" style={{ lineColor: colors.perimeter, lineWidth: 1.5, lineOpacity: 0.9 }} />
          <Mapbox.LineLayer
            id="perimeters-selected"
            filter={['==', ['get', 'fireKey'], selectedFireKey ?? '']}
            style={{ lineColor: '#ffffff', lineWidth: 3 }}
          />
        </Mapbox.ShapeSource>
      )}

      {showFires && (
        <Mapbox.ShapeSource
          ref={incidentSource}
          id="incidents"
          shape={incidents}
          cluster
          clusterRadius={CLUSTER_RADIUS}
          clusterMaxZoomLevel={CLUSTER_MAX_ZOOM}
          clusterProperties={CLUSTER_PROPERTIES}
          hitbox={{ width: 44, height: 44 }}
          onPress={handleIncidentPress}
        >
          <Mapbox.SymbolLayer
            id="incident-clusters"
            filter={['has', 'point_count']}
            style={{
              iconImage: CLUSTER_ICON as any,
              iconSize: CLUSTER_SIZE_STEP(0.8, 0.95, 1.1) as any,
              iconOffset: [0, -8],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              textField: ['get', 'point_count_abbreviated'] as any,
              textFont: ['DIN Pro Medium', 'Arial Unicode MS Bold'],
              textSize: CLUSTER_SIZE_STEP(9, 10, 11) as any,
              textColor: '#ffffff',
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <Mapbox.CircleLayer
            id="incident-glow"
            filter={['!', ['has', 'point_count']]}
            style={{ circleRadius: GLOW_RADIUS as any, circleColor: CONTAINMENT_COLOR as any, circleOpacity: 0.12 }}
          />
          <Mapbox.CircleLayer
            id="incident-dots"
            filter={['!', ['has', 'point_count']]}
            style={{
              circleRadius: DOT_RADIUS as any,
              circleColor: CONTAINMENT_COLOR as any,
              circleOpacity: 0.8,
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: 1.5,
              circleStrokeOpacity: 0.6,
            }}
          />
          <Mapbox.CircleLayer
            id="incident-selected"
            filter={['==', ['get', 'id'], selectedId ?? '']}
            style={{
              circleRadius: SELECTED_RADIUS as any,
              circleColor: 'rgba(0,0,0,0)',
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: 3,
            }}
          />
          <Mapbox.SymbolLayer
            id="incident-labels"
            filter={['!', ['has', 'point_count']]}
            minZoomLevel={7}
            style={{
              textField: ['get', 'name'] as any,
              textFont: TEXT_FONT,
              textSize: 12,
              textColor: '#ffffff',
              textHaloColor: 'rgba(0,0,0,0.85)',
              textHaloWidth: 1.4,
              textOffset: [0, 1.3],
              textAnchor: 'top',
              textOptional: true,
            }}
          />
        </Mapbox.ShapeSource>
      )}
    </Mapbox.MapView>
  );
});
