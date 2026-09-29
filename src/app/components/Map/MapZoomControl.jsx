/**
 * MapZoomControl.jsx
 * Custom bottom-right control cluster replacing Mapbox's native NavigationControl:
 * zoom in, zoom out, orient north, and report a bug — one vertical rectangle.
 */

import { memo, useState, useEffect } from 'react';
import { Plus, Minus, Compass } from 'lucide-react';
import { useViewport } from '../../context/ViewportContext';

const REPORT_BUG_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSej35yFro7KsQ349MzgQ6Lek4_M67qfoK59UFssX9CaTKf07Q/viewform?usp=header';

const MapZoomControl = memo(function MapZoomControl({ mapRef }) {
  const { viewport, setViewport } = useViewport();

  const [scale, setScale] = useState({
    distance: 5,
    unit: 'mi',
  });
  
  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const orientNorth = () => {
    // In 3D (tilted) mode, orienting north also flattens the map back to a
    // 2D overhead view. In 2D mode, only the bearing is reset.
    if ((viewport?.pitch ?? 0) > 0) {
      setViewport({ pitch: 0, bearing: 0 });
    } else {
      mapRef.current?.resetNorth();
    }
  };

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const updateScale = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();

      if (!center || zoom == null) return;

      const earthCircumference = 40075016.686;
      const metersPerPixel = 
        (earthCircumference * Math.cos((center.lat * Math.PI) / 180)) /
         Math.pow(2, zoom + 8);

      const barWidth = 96;

      const meters = metersPerPixel * barWidth;

      const niceDistances = [
        1,
        2,
        5,
        10,
        20,
        50,
        100,
        200,
        500,
        1000,
        2000,
        5000,
        10000,
        20000,
        50000,
        100000,
        200000,
        500000,
        1000000,
      ];

      const miles = meters / 1609.344;

      const niceMiles = niceDistances
      .map((value) => value / 1.609344)
      .find((value) => value >= miles);

      if(!niceMiles) return;

      if (niceMiles < 1) {
        setScale({
          distance: Math.round(niceMiles * 5280),
          unit: 'ft',
        })
      } else {
        setScale({
          distance: niceMiles,
          unit: 'mi',
        });
      }
    };

    updateScale();

    map.on('zoom', updateScale);
    map.on('move', updateScale);

    return () => {
      map.off('zoom', updateScale);
      map.off('move', updateScale);
    };
  }, [mapRef]);

  const formattedDistance = 
    scale.unit === 'ft'
      ? `${Math.round(scale.distance).toLocaleString()} ft`
      : `${Number.isInteger(scale.distance) ? scale.distance : scale.distance.toFixed(1)} mi`;

  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end">

      <div className="mb-2 rounded-md border border-sentinel-600 bg-sentinel-900/90 px-2 py-1.5 backdrop-blur-sm shadow-lg">
        <div className="w-24">
          <div className="h-0 border-t-2 border-white" />

          <div className="mt-0.5 flex justify-between text-[9px] leading-none text-white">
            <span>0</span>
            <span>{formattedDistance}</span>
          </div>
        </div>
      </div>
      
    <div className="absolute bottom-4 right-4 z-20 flex flex-col w-9 rounded-lg overflow-hidden border border-sentinel-600 bg-sentinel-900/90 backdrop-blur-sm shadow-xl">
      <button
        type="button"
        onClick={zoomIn}
        aria-label="Zoom in"
        className="flex items-center justify-center h-9 text-white hover:bg-sentinel-700 transition-colors border-b border-sentinel-600"
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        onClick={zoomOut}
        aria-label="Zoom out"
        className="flex items-center justify-center h-9 text-white hover:bg-sentinel-700 transition-colors border-b border-sentinel-600"
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        onClick={orientNorth}
        aria-label="Reset map orientation to north"
        className="flex items-center justify-center h-9 text-white hover:bg-sentinel-700 transition-colors border-b border-sentinel-600"
      >
        <Compass size={16} />
      </button>
      <a
        href={REPORT_BUG_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Report a bug"
        aria-label="Report a bug"
        className="flex items-center justify-center h-9 text-white hover:bg-sentinel-700 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2h8l1 4H7L8 2z"/>
          <path d="M12 6v4"/>
          <circle cx="12" cy="14" r="6"/>
          <path d="M6 14H2M22 14h-4"/>
          <path d="M12 20v2"/>
          <path d="M6.34 17.66l-2.83 2.83M20.49 3.51l-2.83 2.83"/>
          <path d="M17.66 17.66l2.83 2.83M3.51 3.51l2.83 2.83"/>
        </svg>
      </a>
    </div>
  </div>
  );
});

export default MapZoomControl;
