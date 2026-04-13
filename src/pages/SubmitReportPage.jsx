/**
 * SubmitReportPage.jsx
 * Reporter dashboard — multi-section incident reporting form.
 * Sections: Address · Incident Details · Notes · Image Attachments
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Flame, Search, MapPin, ChevronDown, FileText, ImageIcon,
  Upload, X, LogOut, AlertCircle, CheckCircle2, Send, User,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { submitFireReport } from '../hooks/useFireReports';

/* ── Static data ── */

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

const US_COUNTIES = [
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

/* ── Mapbox token (shared with AddressAlertSearch) ── */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ── Searchable county dropdown ── */

function CountySelect({ value, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState(value || '');

  // Sync internal query when value is set externally (e.g. from address autofill)
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
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search county…"
          className={INPUT_CLS + ' pl-8 pr-7'}
        />
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none"
        />
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto
                       rounded-lg bg-sentinel-700 border border-sentinel-600 shadow-2xl">
          {filtered.slice(0, 40).map((county) => (
            <li key={county}>
              <button
                type="button"
                onMouseDown={() => select(county)}
                className="w-full text-left px-3 py-2 text-sm text-sentinel-100
                           hover:bg-sentinel-600 transition-colors"
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

/* ── Shared style tokens ── */
const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-700 text-white ' +
  'placeholder-sentinel-500 focus:outline-none focus:border-[#0096ff] ' +
  'focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm';

const LABEL_CLS =
  'block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5';

const SECTION_CLS =
  'bg-sentinel-800/40 border border-sentinel-700 rounded-xl p-6';

function SectionHeader({ icon: Icon, iconColor = 'text-[#0096ff]', children }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon size={15} className={iconColor} />
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">
        {children}
      </h2>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════ */

export default function SubmitReportPage() {
  const { user, profile, loading, signOut, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();

  /* Address */
  const [addressSearch, setAddressSearch] = useState('');
  const [isIntersection, setIsIntersection] = useState(false);
  const [address1,   setAddress1]   = useState('');
  const [address2,   setAddress2]   = useState('');
  const [city,       setCity]       = useState('');
  const [county,     setCounty]     = useState('');
  const [usState,    setUsState]    = useState('');
  const [zip,        setZip]        = useState('');
  const [jurisdiction, setJurisdiction] = useState('');

  /* Address autofill */
  const [suggestions,     setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchDebounceRef = useRef(null);
  const searchAbortRef    = useRef(null);

  /* Incident details */
  const [fireName, setFireName] = useState('');

  /* Notes */
  const [incidentNotes, setIncidentNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  /* Images */
  const [images,   setImages]   = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  /* Submission */
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(null);

  /* ── Guards ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c0e] flex items-center justify-center text-sentinel-300 text-sm">
        Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: '/submit-report' }} replace />;
  }

  /* ── Image helpers ── */
  function handleFiles(files) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const previews   = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    setImages((prev) => [...prev, ...previews]);
  }

  function removeImage(idx) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  /* ── Address autofill ── */
  function handleAddressSearchChange(e) {
    const val = e.target.value;
    setAddressSearch(val);
    clearTimeout(searchDebounceRef.current);
    if (!val.trim() || val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  async function fetchSuggestions(q) {
    if (!MAPBOX_TOKEN) return;
    if (searchAbortRef.current) searchAbortRef.current.abort();
    searchAbortRef.current = new AbortController();
    try {
      const encoded = encodeURIComponent(q);
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
        `?access_token=${MAPBOX_TOKEN}&country=us&autocomplete=true&limit=5&types=address`;
      const res = await fetch(url, { signal: searchAbortRef.current.signal });
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.features || []);
      setShowSuggestions((data.features || []).length > 0);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Address suggestion error:', err);
    }
  }

  function applySuggestion(feature) {
    const ctx = {};
    (feature.context || []).forEach((c) => {
      const key = c.id.split('.')[0];
      ctx[key] = c;
    });

    const streetAddress = feature.address
      ? `${feature.address} ${feature.text}`
      : feature.text;

    setAddress1(streetAddress || '');
    setCity(ctx.place?.text || ctx.locality?.text || '');
    setCounty(ctx.district?.text || '');
    setUsState(ctx.region?.text || '');
    setZip(ctx.postcode?.text || '');
    setAddressSearch(feature.place_name || '');
    setSuggestions([]);
    setShowSuggestions(false);
  }

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fireName.trim()) {
      setError('Fire name is required.');
      return;
    }
    if (!incidentNotes.trim()) {
      setError('Incident Notes are required.');
      return;
    }
    if (!address1.trim() || !city.trim() || !usState || !zip.trim() || !jurisdiction.trim()) {
      setError('Please complete all required (*) address fields.');
      return;
    }

    setBusy(true);
    try {
      const locationLine =
        [address1, address2].filter(Boolean).join(', ') +
        `, ${city}` +
        (county ? `, ${county} County` : '') +
        `, ${usState} ${zip}`;

      const description = [
        `ADDRESS: ${locationLine}`,
        `JURISDICTION: ${jurisdiction}`,
        isIntersection ? 'INTERSECTION SEARCH: Yes' : null,
        `\nINCIDENT NOTES:\n${incidentNotes}`,
        internalNotes.trim() ? `\nINTERNAL NOTES:\n${internalNotes}` : null,
      ].filter(Boolean).join('\n');

      await submitFireReport({
        title:       fireName.trim(),
        description,
        latitude:    0,
        longitude:   0,
        userId:      user.id,
      });

      setSuccess('Report submitted successfully! It will appear on the public map after moderator review.');

      /* Reset */
      setAddressSearch(''); setIsIntersection(false);
      setAddress1(''); setAddress2(''); setCity(''); setCounty('');
      setUsState(''); setZip(''); setJurisdiction('');
      setSuggestions([]); setShowSuggestions(false);
      setFireName(''); setIncidentNotes(''); setInternalNotes('');
      images.forEach((img) => URL.revokeObjectURL(img.preview));
      setImages([]);
    } catch (err) {
      setError(err?.message || 'Failed to submit report.');
    } finally {
      setBusy(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#0a0c0e] flex flex-col">

      {/* ── Dashboard header ── */}
      <header className="bg-sentinel-900 border-b border-sentinel-700/80 px-5 py-3
                         flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fire-600/15 border border-fire-500/25
                          flex items-center justify-center">
            <Flame size={16} className="text-fire-400" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">Sentinel</span>
          <span className="text-sentinel-600 text-sm">|</span>
          <span className="text-sentinel-300 text-sm">Reporter Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-sentinel-300">
            <User size={12} />
            <span className="max-w-[200px] truncate">
              {profile?.email || user.email}
            </span>
            {profile?.role === 'admin' && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-fire-600/20 border border-fire-600/40
                               text-fire-300 text-[10px] font-semibold">
                admin
              </span>
            )}
          </div>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-white">New Incident Report</h1>
          <p className="text-sentinel-400 text-sm mt-1">
            Complete all required (<span className="text-red-400">*</span>) fields and submit for NWTT moderator review.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ════════════════ ADDRESS SECTION ════════════════ */}
          <div className={SECTION_CLS}>
            <SectionHeader icon={MapPin}>Address</SectionHeader>

            {/* Search bar with autofill */}
            <div className="relative mb-4">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={addressSearch}
                  onChange={handleAddressSearchChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Search address to autofill fields below…"
                  autoComplete="off"
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-sentinel-700/60 border border-sentinel-600
                             text-white placeholder-sentinel-400 focus:outline-none focus:border-[#0096ff]
                             focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm"
                />
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-30 mt-1 w-full rounded-lg bg-sentinel-700 border border-sentinel-600 shadow-2xl overflow-hidden">
                  {suggestions.map((feature) => (
                    <li key={feature.id}>
                      <button
                        type="button"
                        onMouseDown={() => applySuggestion(feature)}
                        className="w-full text-left px-4 py-2.5 text-sm text-sentinel-100
                                   hover:bg-sentinel-600 transition-colors flex items-start gap-2.5"
                      >
                        <MapPin size={13} className="text-[#0096ff] shrink-0 mt-0.5" />
                        <span className="truncate">{feature.place_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Intersection checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none mb-5">
              <input
                type="checkbox"
                checked={isIntersection}
                onChange={(e) => setIsIntersection(e.target.checked)}
                className="w-4 h-4 rounded border-sentinel-600 bg-sentinel-800 accent-[#0096ff] cursor-pointer"
              />
              <span className="text-sm text-sentinel-200">Intersection Search</span>
            </label>

            {/* Address grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <label className={LABEL_CLS}>
                  Address 1 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  placeholder="123 Main Street"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Address 2</label>
                <input
                  type="text"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  placeholder="Apt, Suite, Unit (optional)"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>
                  City <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City name"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>County</label>
                <CountySelect value={county} onChange={setCounty} />
              </div>

              <div>
                <label className={LABEL_CLS}>
                  State <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={usState}
                  onChange={(e) => setUsState(e.target.value)}
                  className={INPUT_CLS + ' cursor-pointer'}
                >
                  <option value="">Select state…</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL_CLS}>
                  ZIP Code <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="e.g. 95602"
                  maxLength={10}
                  className={INPUT_CLS}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>
                  Jurisdiction <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="e.g. Placer County Fire, USFS Region 5, Cal Fire"
                  className={INPUT_CLS}
                />
              </div>

            </div>
          </div>

          {/* ════════════════ INCIDENT DETAILS SECTION ════════════════ */}
          <div className={SECTION_CLS}>
            <SectionHeader icon={Flame} iconColor="text-fire-400">
              Incident Details
            </SectionHeader>

            <div>
              <label className={LABEL_CLS}>
                Fire Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={fireName}
                onChange={(e) => setFireName(e.target.value)}
                placeholder="e.g. Caldor Fire, River Fire, Tahoe Fire"
                maxLength={120}
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* ════════════════ NOTES SECTION ════════════════ */}
          <div className={SECTION_CLS}>
            <SectionHeader icon={FileText}>Notes</SectionHeader>

            <div>
              <label className={LABEL_CLS}>
                Incident Notes <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                rows={7}
                value={incidentNotes}
                onChange={(e) => setIncidentNotes(e.target.value)}
                placeholder="Describe the incident: what you saw, when, landmarks, road names, wind direction, estimated fire size, activity level, structures threatened…"
                maxLength={5000}
                className={INPUT_CLS + ' resize-y min-h-[140px]'}
              />
              <div className="text-right text-xs text-sentinel-500 mt-1">
                {incidentNotes.length} / 5000
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL_CLS}>Internal Notes</label>
              <textarea
                rows={4}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Internal use only — not visible on the public map"
                maxLength={2000}
                className={INPUT_CLS + ' resize-y min-h-[100px]'}
              />
              <div className="text-right text-xs text-sentinel-500 mt-1">
                {internalNotes.length} / 2000
              </div>
            </div>
          </div>

          {/* ════════════════ IMAGE ATTACHMENTS SECTION ════════════════ */}
          <div className={SECTION_CLS}>
            <SectionHeader icon={ImageIcon}>Image Attachments</SectionHeader>

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${dragging
                  ? 'border-[#0096ff] bg-[#0096ff]/5 scale-[1.01]'
                  : 'border-sentinel-600 hover:border-sentinel-500 hover:bg-sentinel-800/30'
                }`}
            >
              <Upload size={28} className="mx-auto text-sentinel-400 mb-3" />
              <p className="text-sentinel-200 text-sm font-medium">
                Drag &amp; drop images here, or <span className="text-[#0096ff]">browse</span>
              </p>
              <p className="text-sentinel-500 text-xs mt-1">
                PNG, JPG, GIF, WEBP supported
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Preview grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg overflow-hidden
                               border border-sentinel-700 bg-sentinel-800"
                  >
                    <img
                      src={img.preview}
                      alt={img.name}
                      className="w-full h-24 object-cover"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100
                                    transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="p-1.5 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
                        title="Remove"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    {/* Filename */}
                    <div className="px-2 py-1 text-[10px] text-sentinel-400 truncate bg-sentinel-900/70">
                      {img.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Feedback messages ── */}
          {error && (
            <div className="flex items-start gap-2 p-4 rounded-lg bg-red-950/40
                            border border-red-800/60 text-red-300 text-sm">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-4 rounded-lg bg-green-950/40
                            border border-green-800/60 text-green-300 text-sm">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-8">
            <button
              type="button"
              onClick={() => navigate('/live-tracker')}
              className="px-6 py-3 rounded-lg text-sm font-medium text-sentinel-300
                         border border-sentinel-700 hover:border-sentinel-500 hover:text-white
                         transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !isSupabaseConfigured}
              style={{ backgroundColor: '#0096ff' }}
              className="flex items-center gap-2 px-8 py-3 rounded-lg font-bold text-sm text-white
                         hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={14} />
              {busy ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
