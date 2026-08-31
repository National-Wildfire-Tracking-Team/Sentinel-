/**
 * MapZoomControl.jsx
 * Custom bottom-right control cluster replacing Mapbox's native NavigationControl:
 * zoom in, zoom out, orient north, and report a bug — one vertical rectangle.
 */

import { memo } from 'react';
import { Plus, Minus, Compass } from 'lucide-react';

const REPORT_BUG_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSej35yFro7KsQ349MzgQ6Lek4_M67qfoK59UFssX9CaTKf07Q/viewform?usp=header';

const MapZoomControl = memo(function MapZoomControl({ mapRef }) {
  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const orientNorth = () => mapRef.current?.resetNorth();

  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col w-9 rounded-lg overflow-hidden border border-zinc-700 bg-black/90 backdrop-blur-sm shadow-xl">
      <button
        type="button"
        onClick={zoomIn}
        aria-label="Zoom in"
        className="flex items-center justify-center h-9 text-white hover:bg-zinc-800 transition-colors border-b border-zinc-700"
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        onClick={zoomOut}
        aria-label="Zoom out"
        className="flex items-center justify-center h-9 text-white hover:bg-zinc-800 transition-colors border-b border-zinc-700"
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        onClick={orientNorth}
        aria-label="Reset map orientation to north"
        className="flex items-center justify-center h-9 text-white hover:bg-zinc-800 transition-colors border-b border-zinc-700"
      >
        <Compass size={16} />
      </button>
      <a
        href={REPORT_BUG_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Report a bug"
        aria-label="Report a bug"
        className="flex items-center justify-center h-9 text-white hover:bg-zinc-800 transition-colors"
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
  );
});

export default MapZoomControl;
