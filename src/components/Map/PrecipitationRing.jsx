/**
 * PrecipitationRing.jsx
 * Center-locked crosshair ring that samples NEXRAD reflectivity (dBZ)
 * at the current map center via IEM WMS GetFeatureInfo.
 *
 * Exports:
 * PrecipitationRing  – absolute-positioned overlay (renders outside <Map>)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const IEM_WMS = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi';

// dBZ value → display color
function dbzColor(dbz) {
  if (dbz === null) return '#4b5563';
  if (dbz < 20)    return '#22d3ee'; // cyan   – very light
  if (dbz < 30)    return '#4ade80'; // green  – light
  if (dbz < 40)    return '#facc15'; // yellow – moderate
  if (dbz < 50)    return '#f97316'; // orange – heavy
  if (dbz < 60)    return '#ef4444'; // red    – very heavy / severe
  return '#a855f7';                  // purple – extreme
}

// dBZ value → intensity label
function dbzLabel(dbz) {
  if (dbz === null) return null;
  if (dbz < 20)    return 'Very Light';
  if (dbz < 30)    return 'Light';
  if (dbz < 40)    return 'Moderate';
  if (dbz < 50)    return 'Heavy';
  if (dbz < 60)    return 'Very Heavy';
  return 'Extreme';
}

/**
 * Query NEXRAD N0Q reflectivity at a geographic point via IEM WMS GetFeatureInfo.
 * Returns the reflectivity in dBZ, or null when no precipitation is detected.
 */
async function queryDbzAtPoint(lat, lng, signal) {
  const d = 0.1; // bbox half-width in degrees (~11 km)
  const params = new URLSearchParams({
    SERVICE:       'WMS',
    VERSION:       '1.1.1',
    REQUEST:       'GetFeatureInfo',
    LAYERS:        'nexrad-n0q', // Use native layer for EPSG:4326 queries
    QUERY_LAYERS:  'nexrad-n0q', // Use native layer for EPSG:4326 queries
    INFO_FORMAT:   'text/plain',
    SRS:           'EPSG:4326',
    BBOX:          `${lng - d},${lat - d},${lng + d},${lat + d}`,
    WIDTH:         '11',
    HEIGHT:        '11',
    X:             '5',
    Y:             '5',
  });

  console.log(`[Radar Ring] Fetching coordinates: Lat ${lat}, Lng ${lng}`);

  const res = await fetch(`${IEM_WMS}?${params}`, { signal });
  if (!res.ok) throw new Error(`WMS ${res.status}`);
  
  const text = await res.text();
  console.log(`[Radar Ring] Raw Server Response:`, text);

  // MapServer text/plain usually wraps values in quotes e.g., value_0 = '42'
  const match = text.match(/value_0\s*=\s*['"]?([-\d.]+)['"]?/i)
             ?? text.match(/band_?1\s*=\s*['"]?([-\d.]+)['"]?/i)
             ?? text.match(/gray_index\s*=\s*['"]?([-\d.]+)['"]?/i);

  if (!match) {
    console.log(`[Radar Ring] ❌ Could not find a value in the response text.`);
    return null;
  }

  const raw = parseFloat(match[1]);
  console.log(`[Radar Ring] Raw parsed value:`, raw);

  if (!raw || raw <= 0) {
    console.log(`[Radar Ring] ☁️ Value is 0 or below threshold (No precipitation here).`);
    return null; 
  }

  // Calculate dBZ
  let dbz = raw;
  if (raw > 0 && raw <= 255) {
      dbz = raw * 0.5 - 32.5;
  }
  
  console.log(`[Radar Ring] 🌧️ Success! Calculated dBZ:`, dbz);
  return dbz;
}

// ── PrecipitationRing ─────────────────────────────────────────────────────────

/**
 * Renders a crosshair ring fixed to the map center with a dBZ readout bubble.
 * Must be rendered as a sibling of <Map> inside the map container div.
 *
 * @param {{ active: boolean, lat: number, lng: number }} props
 */
export function PrecipitationRing({ active, lat, lng }) {
  const [dbz,    setDbz]    = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle'|'loading'|'ok'|'error'
  const abortRef   = useRef(null);
  const debounceRef = useRef(null);

  const doQuery = useCallback(async (latitude, longitude) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('loading');
    try {
      const val = await queryDbzAtPoint(latitude, longitude, ctrl.signal);
      setDbz(val);
      setStatus('ok');
    } catch (e) {
      if (e.name !== 'AbortError') setStatus('error');
    }
  }, []);

  // Debounce on lat/lng change (user panning), then poll every 15 s
  useEffect(() => {
    if (!active) { setDbz(null); setStatus('idle'); return; }
    if (lat == null || lng == null) return; // Fixed to allow lat/lng of exactly 0

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doQuery(lat, lng), 700);

    const interval = setInterval(() => doQuery(lat, lng), 15_000);
    return () => {
      clearTimeout(debounceRef.current);
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [active, lat, lng, doQuery]);

  if (!active) return null;

  const color    = dbzColor(dbz);
  const hasData  = status === 'ok' && dbz !== null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30">
      <div className="relative flex items-center justify-center">

        {/* ── Crosshair ring (SVG) ── */}
        <svg
          width="56" height="56" viewBox="0 0 56 56"
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
        >
          {/* Subtle outer halo */}
          <circle cx="28" cy="28" r="25"
            fill="none" stroke={color} strokeWidth="1" opacity="0.2" />

          {/* Main dashed ring */}
          <circle cx="28" cy="28" r="19"
            fill="none" stroke={color} strokeWidth="2"
            strokeDasharray="6 3" opacity="0.9" />

          {/* Center dot */}
          <circle cx="28" cy="28" r="2.5" fill={color} opacity="1" />

          {/* Cardinal tick marks */}
          <line x1="28" y1="2"  x2="28" y2="9"  stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          <line x1="28" y1="47" x2="28" y2="54" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          <line x1="2"  y1="28" x2="9"  y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          <line x1="47" y1="28" x2="54" y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
        </svg>

        {/* ── dBZ readout bubble (below the ring) ── */}
        <div
          className="absolute"
          style={{ top: '100%', left: '50%', transform: 'translate(-50%, 7px)' }}
        >
          <div
            className="rounded-lg px-3 py-1.5 shadow-2xl backdrop-blur-sm text-center"
            style={{
              background:   'rgba(10, 12, 14, 0.88)',
              border:       `1px solid ${color}55`,
              minWidth:     '116px',
            }}
          >
            {status === 'loading' && (
              <span className="text-gray-400 text-[11px]">Sampling…</span>
            )}
            {status === 'error' && (
              <span className="text-red-400 text-[11px]">Radar unavailable</span>
            )}
            {(status === 'idle' || (status === 'ok' && !hasData)) && (
              <span className="text-gray-400 text-[11px]">No precipitation</span>
            )}
            {hasData && (
              <>
                <div
                  className="font-bold text-[17px] leading-tight tabular-nums"
                  style={{ color }}
                >
                  {dbz.toFixed(1)} dBZ
                </div>
                <div className="text-gray-300 text-[10px] mt-0.5 uppercase tracking-wide">
                  {dbzLabel(dbz)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
