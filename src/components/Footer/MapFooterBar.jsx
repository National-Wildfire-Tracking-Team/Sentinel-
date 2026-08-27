/**
 * MapFooterBar.jsx
 * Slim, always-visible footer strip for the live map view — brand mark,
 * a few source-agency links, and legal, without taking real estate away
 * from the map the way the full marketing Footer.jsx would.
 */

import { Link } from 'react-router-dom';

const AGENCY_LINKS = [
  { label: 'NIFC', href: 'https://www.nifc.gov' },
  { label: 'InciWeb', href: 'https://inciweb.wildfire.gov' },
  { label: 'NWS', href: 'https://www.weather.gov' },
];

export default function MapFooterBar() {
  return (
    <div className="absolute bottom-0 inset-x-0 z-10 h-6 px-3 flex items-center justify-between gap-3 text-[10px] text-sentinel-500 bg-black/70 backdrop-blur-sm overflow-x-auto whitespace-nowrap scrollbar-none">
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-semibold text-sentinel-300">Sentinel · NWTT</span>
        {AGENCY_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sentinel-200 transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/privacy-policy" className="hover:text-sentinel-200 transition-colors">Privacy</Link>
        <Link to="/terms" className="hover:text-sentinel-200 transition-colors">Terms</Link>
      </div>
    </div>
  );
}
