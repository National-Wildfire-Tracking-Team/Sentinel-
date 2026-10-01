/**
 * WeatherModelsMapLayer.jsx
 * Everything the Models tab draws on the live map (rendered inside MapView's
 * <Map>), by mode:
 *
 *   HRRR / GFS          the model's field for the selected variable and hour,
 *                       wind particles on top (when on), and the inspect popup
 *   Compare → Swipe     HRRR field here; GFS on a synced second map right of a divider
 *   Compare → Difference  HRRR − GFS field with a diverging scale
 *
 * Resolution: HRRR frames come in two sizes. The light one is used while
 * animating or zoomed out; the full 3 km one once paused at zoom ≥ 5.
 * The next few frames are pre-fetched so the timeline steps instantly.
 */

import { Component, useEffect, useMemo, useState } from 'react';
import { Marker, useMap } from 'react-map-gl';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { differenceUrl, fieldUrl, fieldsBase, hourAt, rasterPaint, windUrl } from '../../api/modelFields';
import ModelFieldLayer from './ModelFieldLayer';
import { usePreloadFrames } from '../../hooks/usePreloadFrames';
import ModelInspectPopup from './ModelInspectPopup';
import SwipeCompare from './SwipeCompare';
import WindParticles from './WindParticles';
import { zulu } from './modelTheme';

const HI_RES_ZOOM = 5;
const PRELOAD_AHEAD = 4;

function useZoom() {
  const { current } = useMap();
  const [zoom, setZoom] = useState(() => current?.getZoom() ?? 3);
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return undefined;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [current]);
  return zoom;
}

/** Field + particles for one model at the selected time (used on both maps in swipe). */
function ModelField({ base, manifest, model, variable, validTime, res, particles, idPrefix }) {
  const hour = hourAt(manifest, model, validTime);
  const spec = manifest.variables[variable];
  const m = manifest.models[model];
  const paint = useMemo(() => rasterPaint(spec), [spec]);
  if (hour == null) return null;
  return (
    <>
      {/* key = id: react-map-gl forbids changing a mounted Source's id (HRRR ↔ GFS), so remount instead */}
      <ModelFieldLayer key={`${idPrefix}-field`} id={`${idPrefix}-field`} url={fieldUrl(base, manifest, model, variable, hour, res)} coordinates={m.image.coordinates} paint={paint} />
      {particles && <WindParticles url={windUrl(base, manifest, model, hour)} coordinates={m.wind.coordinates} range={m.wind.range} />}
    </>
  );
}

/**
 * Keeps a Models-layer failure inside the Models overlay: the live map, its
 * other layers and the rest of the app keep working. Resets when the user
 * changes model, view or variable.
 */
class ModelLayerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('[WeatherModels] map layer failed:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function WeatherModelsMapLayer(props) {
  const wm = useWeatherModelsContext();
  return (
    <ModelLayerBoundary key={`${wm?.mode}|${wm?.compareView}|${wm?.variable}`}>
      <ModelsOverlay {...props} />
    </ModelLayerBoundary>
  );
}

function ModelsOverlay({ mapStyle, mapboxAccessToken }) {
  const wm = useWeatherModelsContext();
  const zoom = useZoom();
  const base = fieldsBase();
  const manifest = wm?.manifest;
  const { mode, compareView, variable, validTime, timeline, playing, particles, location } = wm ?? {};

  // Pre-fetch the next frames along the timeline.
  const upcoming = useMemo(() => {
    if (!manifest || !validTime || !base) return [];
    const i = timeline.indexOf(validTime);
    const next = timeline.slice(i + 1, i + 1 + PRELOAD_AHEAD);
    if (mode === 'compare' && compareView === 'difference') return next.map((t) => differenceUrl(base, manifest, variable, t));
    const models = mode === 'compare' ? ['hrrr', 'gfs'] : [mode];
    return next.flatMap((t) => models.map((m) => {
      const h = hourAt(manifest, m, t);
      return h == null ? null : fieldUrl(base, manifest, m, variable, h, 'lo');
    })).filter(Boolean);
  }, [manifest, base, timeline, validTime, mode, compareView, variable]);
  usePreloadFrames(upcoming);

  const diffPaint = useMemo(() => {
    const d = manifest?.variables?.[variable]?.difference;
    return d ? rasterPaint(d) : null;
  }, [manifest, variable]);

  if (!wm || !manifest || !validTime || !base) return null;
  const res = !playing && zoom >= HI_RES_ZOOM ? 'hi' : 'lo';
  const showParticles = particles && mode !== 'compare';

  let content;
  if (mode === 'compare' && compareView === 'difference') {
    content = manifest.difference && diffPaint && (
      <ModelFieldLayer
        id="wm-diff-field"
        url={differenceUrl(base, manifest, variable, validTime)}
        coordinates={manifest.difference.image.coordinates}
        paint={diffPaint}
      />
    );
  } else if (mode === 'compare') {
    const props = { base, manifest, variable, validTime, res, particles: false };
    content = (
      <>
        <ModelField {...props} model="hrrr" idPrefix="wm-hrrr" />
        <SwipeCompare
          mapStyle={mapStyle}
          mapboxAccessToken={mapboxAccessToken}
          leftLabel={`HRRR · run ${zulu(manifest.models.hrrr.current.runTime)} · +${hourAt(manifest, 'hrrr', validTime)} h`}
          rightLabel={`GFS · run ${zulu(manifest.models.gfs.current.runTime)} · +${hourAt(manifest, 'gfs', validTime)} h`}
        >
          <ModelField {...props} model="gfs" idPrefix="wm-gfs" res="lo" />
        </SwipeCompare>
      </>
    );
  } else {
    content = (
      <ModelField base={base} manifest={manifest} model={mode} variable={variable} validTime={validTime}
        res={res} particles={showParticles} idPrefix={`wm-${mode}`} />
    );
  }

  return (
    <>
      {content}
      {location && (
        <Marker longitude={location.lon} latitude={location.lat} anchor="center">
          <span className="block w-3 h-3 rounded-full border-2 border-white bg-sky-500 shadow" aria-label="Inspected point" />
        </Marker>
      )}
      <ModelInspectPopup />
    </>
  );
}
