/**
 * shared.jsx
 * Style tokens, small shared components, static data, and geocoding helpers
 * used across the reporter dashboard's tabs.
 */

import { useState, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ── Style tokens ── */
export const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-600 text-white ' +
  'placeholder-sentinel-500 focus:outline-none focus:border-fire-600 ' +
  'focus:ring-1 focus:ring-fire-600/20 transition-colors text-sm';

export const LABEL_CLS =
  'block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5';

export const SECTION_CLS =
  'bg-sentinel-800 border border-sentinel-700 rounded-xl p-6';

/* ── Static data ── */
export const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

export const US_COUNTIES = [
  'Adams','Allen','Apache','Atlantic','Bexar','Boulder','Broward','Butte',
  'Canyon','Charlotte','Chelan','Cherokee','Clark','Clay','Cochise','Coconino',
  'Collin','Columbia','Cook','Dallas','Davidson','Davis','Deschutes','Douglas',
  'Duval','El Dorado','El Paso','Elko','Escambia','Fairfax','Flagler',
  'Flathead','Fresno','Garfield','Grant','Guilford','Hamilton','Harris',
  'Hillsborough','Hood River','Humboldt','Idaho','Jackson','Jefferson',
  'Josephine','Kootenai','Lake','Lane','Larimer','Lee','Lincoln','Linn',
  'Los Angeles','Maricopa','Marion','Mecklenburg','Miami-Dade','Mohave',
  'Monroe','Montgomery','Multnomah','Navajo','New Hanover','Okanogan','Orange',
  'Palm Beach','Pima','Pinal','Pinellas','Placer','Polk','Riverside',
  'Sacramento','Salt Lake','San Bernardino','San Diego','San Francisco',
  'San Joaquin','Santa Barbara','Santa Clara','Sarasota','Shasta','Siskiyou',
  'Snohomish','Spokane','Summit','Tarrant','Travis','Trinity','Tulare','Tulsa',
  'Utah','Ventura','Wake','Wasco','Washington','Washoe','Whatcom',
  'Yakima','Yavapai','Yolo','Yuma',
].sort();

export const EVENT_SEVERITY_OPTIONS = ['low', 'moderate', 'high', 'critical'];

/* ── Geocoding helpers ──
 * Direct Mapbox v5 geocoding — used as a fallback when the Supabase edge
 * function is unavailable or returns an error. Requires VITE_MAPBOX_TOKEN. */
export async function geocodeViaDirect(query, { limit = 5, types = '', autocomplete = true } = {}) {
  if (!MAPBOX_TOKEN) throw new Error('Mapbox token not configured');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'us',
    limit: String(limit),
    autocomplete: String(autocomplete),
  });
  if (types) params.set('types', types);
  const encoded = encodeURIComponent(query.trim());
  const resp = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params}`
  );
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const json = await resp.json();
  // Normalise v5 features to look like v6 so the rest of the code is unchanged.
  return (json?.features || []).map((f) => ({
    id: f.id,
    place_name: f.place_name,
    geometry: f.geometry,
    properties: {
      mapbox_id: f.id,
      full_address: f.place_name,
      address_line1: f.address
        ? `${f.address} ${f.text || ''}`.trim()
        : (f.text || ''),
      name: f.text || '',
      context: buildV5Context(f.context || []),
    },
  }));
}

export function buildV5Context(contextArr) {
  const ctx = {};
  for (const item of contextArr) {
    if (item.id?.startsWith('place'))     ctx.place      = { name: item.text };
    if (item.id?.startsWith('locality'))  ctx.locality   = { name: item.text };
    if (item.id?.startsWith('district'))  ctx.district   = { name: item.text };
    if (item.id?.startsWith('region'))    ctx.region     = { name: item.text };
    if (item.id?.startsWith('postcode'))  ctx.postcode   = { name: item.text };
  }
  return ctx;
}

/* ── Searchable county dropdown ── */
export function CountySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');

  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query.trim().length >= 1
    ? US_COUNTIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : US_COUNTIES;

  function select(county) {
    onChange(county);
    setQuery(county);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search county…"
          className={INPUT_CLS + ' pl-8 pr-7'}
        />
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-lg bg-sentinel-700 border border-sentinel-600 shadow-2xl">
          {filtered.slice(0, 40).map((county) => (
            <li key={county}>
              <button
                type="button"
                onMouseDown={() => select(county)}
                className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-600 transition-colors"
              >
                {county}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SectionHeader({ icon: Icon, iconColor = 'text-fire-500', children }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon size={15} className={iconColor} />
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">{children}</h2>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active:     'bg-red-500/15 border-red-500/30 text-red-400',
    contained:  'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    controlled: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    out:        'bg-green-500/15 border-green-500/30 text-green-400',
    approved:   'bg-green-500/15 border-green-500/30 text-green-400',
    pending:    'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    rejected:   'bg-red-500/15 border-red-500/30 text-red-400',
  };
  const cls = map[status] || 'bg-sentinel-700 border-sentinel-600 text-sentinel-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls} uppercase tracking-wider`}>
      {status}
    </span>
  );
}
