/**
 * MapScaleBar.jsx
 * Mapbox's native ScaleControl mounted into our own markup, so the map's
 * distance scale can sit under a legend instead of in a map corner. The bar
 * resizes and relabels as the map zooms; it re-mounts when the map does.
 */

import { useEffect, useRef } from 'react';

export default function MapScaleBar({ map, className = '' }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!map || !host) return undefined;

    let control;
    let cancelled = false;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return;
      control = new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'imperial' });
      host.appendChild(control.onAdd(map));
    });

    return () => {
      cancelled = true;
      control?.onRemove();
    };
  }, [map]);

  return <div ref={hostRef} className={`sentinel-scale flex ${className}`} />;
}
