/**
 * IncidentLocationPicker.jsx
 * Small map with a draggable pin for moving an incident. Reporters can drag
 * the pin or click anywhere on the map to drop it there; either way the new
 * coordinates are reported through `onChange({ latitude, longitude })`.
 *
 * When the coordinates change from outside (e.g. an address was picked from
 * search) and the pin is no longer on screen, the map flies to it.
 */

import { useEffect, useRef } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const US_VIEW = { longitude: -114.5, latitude: 39.5, zoom: 4 };
const PIN_ZOOM = 13;

export default function IncidentLocationPicker({ latitude, longitude, onChange, height = 260 }) {
  const mapRef = useRef(null);
  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasPin) return;
    if (!map.getBounds()?.contains([longitude, latitude])) {
      map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), PIN_ZOOM), duration: 800 });
    }
  }, [latitude, longitude, hasPin]);

  function report(lngLat) {
    onChange({ latitude: lngLat.lat, longitude: lngLat.lng });
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-sentinel-600" style={{ height }}>
      <Map
        ref={mapRef}
        initialViewState={hasPin ? { longitude, latitude, zoom: PIN_ZOOM } : US_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={
          MAPBOX_TOKEN
            ? 'mapbox://styles/mapbox/dark-v11'
            : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        }
        mapboxAccessToken={MAPBOX_TOKEN || undefined}
        onClick={(evt) => report(evt.lngLat)}
        cursor="crosshair"
      >
        <NavigationControl position="top-right" showCompass={false} />
        {hasPin && (
          <Marker
            longitude={longitude}
            latitude={latitude}
            anchor="bottom"
            draggable
            onDragEnd={(evt) => report(evt.lngLat)}
          >
            <MapPin size={34} className="text-fire-500 fill-fire-600/40 drop-shadow-lg cursor-grab active:cursor-grabbing" />
          </Marker>
        )}
      </Map>
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-sentinel-900/85 text-[11px] text-sentinel-300 pointer-events-none">
        {hasPin ? 'Drag the pin or click the map to move the incident' : 'Click the map to place the incident'}
      </div>
    </div>
  );
}
