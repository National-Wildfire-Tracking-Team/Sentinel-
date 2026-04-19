/**
 * SubmitReportPage.jsx
 * Reporter dashboard — two tabs:
 *   1. Add New Fire      — multi-section incident submission form
 *   2. My Fires          — edit, update, and delete own submissions only
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import {
  Flame, Search, MapPin, ChevronDown, FileText, ImageIcon,
  Upload, X, LogOut, AlertCircle, CheckCircle2, Send, User,
  PlusCircle, Settings, Pencil, Trash2, RefreshCw,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';
import { acquireSlot } from '../utils/mapboxRateLimiter';
import {
  appendFireReportUpdate,
  updateFireReport,
  deleteFireReport,
  submitFireReport,
  useFireReports,
} from '../hooks/useFireReports';
import { insertReporterUpdate } from '../hooks/useIncidentUpdates';
import IncidentTimeline from '../components/IncidentTimeline/IncidentTimeline';

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

/* ── Shared style tokens ── */
const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-lg bg-sentinel-800 border border-sentinel-700 text-white ' +
  'placeholder-sentinel-500 focus:outline-none focus:border-[#0096ff] ' +
  'focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm';

const LABEL_CLS =
  'block text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-1.5';

const SECTION_CLS =
  'bg-sentinel-800/40 border border-sentinel-700 rounded-xl p-6';

/* ── Searchable county dropdown ── */
function CountySelect({ value, onChange }) {
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
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search county…"
          className={INPUT_CLS + ' pl-8 pr-7'}
        />
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-lg bg-sentinel-700 border border-sentinel-600 shadow-2xl">
          {filtered.slice(0, 40).map((county) => (
            <li key={county}>
              <button
                type="button"
                onMouseDown={() => select(county)}
                className="w-full text-left px-3 py-2 text-sm text-sentinel-100 hover:bg-sentinel-600 transition-colors"
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

function SectionHeader({ icon: Icon, iconColor = 'text-[#0096ff]', children }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon size={15} className={iconColor} />
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">{children}</h2>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════ */

export default function SubmitReportPage() {
  const { user, profile, loading, profileLoading, signOut, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();

  /* Tab navigation: 'add' | 'manage' */
  const [activeTab, setActiveTab] = useState('add');

  /* ── Add New Fire form state ── */
  const [addressSearch, setAddressSearch] = useState('');
  const [isIntersection, setIsIntersection] = useState(false);
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');
  const [usState, setUsState] = useState('');
  const [zip, setZip] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [reportLat, setReportLat] = useState(null);
  const [reportLng, setReportLng] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchDebounceRef = useRef(null);
  const [fireName, setFireName] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [images, setImages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  /* ── My Fires tab state ── */
  const { reports: allReports, refresh: refreshReports } = useFireReports('all');

  /* Only show fires submitted by this reporter */
  const myFires = useMemo(
    () => allReports.filter((r) => r.user_id === user?.id && r.status !== 'rejected'),
    [allReports, user?.id],
  );

  /* Per-fire update form state */
  const [updateState, setUpdateState] = useState({});
  const [updateBusy, setUpdateBusy] = useState({});
  const [updateFeedback, setUpdateFeedback] = useState({});

  /* Per-fire edit state */
  const [editingId, setEditingId] = useState(null);
  const [editState, setEditState] = useState({});
  const [editBusy, setEditBusy] = useState({});
  const [editFeedback, setEditFeedback] = useState({});

  /* Per-fire delete state */
  const [deletingId, setDeletingId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState({});

  /* ── Guards ── */
  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-[#0a0c0e] flex items-center justify-center text-sentinel-300 text-sm">
        Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/reporter-login" state={{ from: '/submit-report' }} replace />;
  }
  if (profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (profile?.role === 'public') {
    return <Navigate to="/reporter-register" replace />;
  }

  /* ── Image helpers ── */
  function handleFiles(files) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({ file, preview: URL.createObjectURL(file), name: file.name })),
    ]);
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
    if (!isSupabaseConfigured) return;
    try {
      await acquireSlot();
      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: { query: q, country: 'us', autocomplete: true, limit: 5, types: 'address' },
      });
      if (error) return;
      setSuggestions(data?.features || []);
      setShowSuggestions((data?.features || []).length > 0);
    } catch (err) {
      console.error('Address suggestion error:', err);
    }
  }

  function applySuggestion(feature) {
    const props = feature.properties || {};
    const ctx = props.context || {};
    const coords = feature.geometry?.coordinates;
    setAddress1(props.address_line1 || props.name || '');
    setCity(ctx.place?.name || ctx.locality?.name || '');
    setCounty(ctx.district?.name || '');
    setUsState(ctx.region?.name || '');
    setZip(ctx.postcode?.name || '');
    setAddressSearch(props.full_address || props.name || '');
    setReportLng(Array.isArray(coords) ? Number(coords[0]) : null);
    setReportLat(Array.isArray(coords) ? Number(coords[1]) : null);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function geocodeAddressForReport() {
    if (!isSupabaseConfigured) return { latitude: null, longitude: null };
    const query = [address1, city, usState, zip].filter(Boolean).join(', ');
    if (!query) return { latitude: null, longitude: null };
    try {
      await acquireSlot();
      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: { query, country: 'us', autocomplete: false, limit: 1 },
      });
      if (error) return { latitude: null, longitude: null };
      const first = data?.features?.[0];
      if (!Array.isArray(first?.geometry?.coordinates)) return { latitude: null, longitude: null };
      return {
        latitude: Number(first.geometry.coordinates[1]),
        longitude: Number(first.geometry.coordinates[0]),
      };
    } catch {
      return { latitude: null, longitude: null };
    }
  }

  /* ── Submit new fire ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fireName.trim()) { setError('Fire name is required.'); return; }
    if (!incidentNotes.trim()) { setError('Incident Notes are required.'); return; }
    if (!address1.trim() || !city.trim() || !usState || !zip.trim() || !jurisdiction.trim()) {
      setError('Please complete all required (*) address fields.');
      return;
    }

    setBusy(true);
    try {
      let latitude = Number.isFinite(reportLat) ? reportLat : null;
      let longitude = Number.isFinite(reportLng) ? reportLng : null;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const geocoded = await geocodeAddressForReport();
        latitude = geocoded.latitude;
        longitude = geocoded.longitude;
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError('Unable to locate this address on the map. Please select a suggested address result.');
        return;
      }

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

      await submitFireReport({ title: fireName.trim(), description, latitude, longitude, userId: user.id });

      setSuccess('Report submitted successfully!');
      /* Reset form */
      setAddressSearch(''); setIsIntersection(false);
      setAddress1(''); setAddress2(''); setCity(''); setCounty('');
      setUsState(''); setZip(''); setJurisdiction('');
      setReportLat(null); setReportLng(null);
      setSuggestions([]); setShowSuggestions(false);
      setFireName(''); setIncidentNotes(''); setInternalNotes('');
      images.forEach((img) => URL.revokeObjectURL(img.preview));
      setImages([]);
      refreshReports();
    } catch (err) {
      setError(err?.message || 'Failed to submit report.');
    } finally {
      setBusy(false);
    }
  }

  /* ── My Fires: post update ── */
  async function handlePostUpdate(report) {
    const state = updateState[report.id] || { acreage: '', notes: '' };
    if (!state.acreage?.toString().trim() && !state.notes?.trim()) {
      setUpdateFeedback((prev) => ({ ...prev, [report.id]: { type: 'error', message: 'Enter acreage or notes before posting.' } }));
      return;
    }
    setUpdateBusy((prev) => ({ ...prev, [report.id]: true }));
    setUpdateFeedback((prev) => ({ ...prev, [report.id]: null }));
    try {
      await appendFireReportUpdate({
        id: report.id,
        description: report.description || '',
        acreage: state.acreage,
        notes: state.notes,
      });

      const parts = [];
      if (state.acreage?.toString().trim()) parts.push(`Acreage: ${state.acreage.toString().trim()}`);
      if (state.notes?.trim()) parts.push(state.notes.trim());
      await insertReporterUpdate({
        incidentId: report.id,
        content: parts.join('\n'),
        sourceName: profile?.email?.split('@')[0] || 'Reporter',
        userId: user.id,
      });

      setUpdateState((prev) => ({ ...prev, [report.id]: { acreage: '', notes: '' } }));
      setUpdateFeedback((prev) => ({ ...prev, [report.id]: { type: 'success', message: 'Update posted.' } }));
      refreshReports();
    } catch (err) {
      setUpdateFeedback((prev) => ({ ...prev, [report.id]: { type: 'error', message: err?.message || 'Failed to post update.' } }));
    } finally {
      setUpdateBusy((prev) => ({ ...prev, [report.id]: false }));
    }
  }

  /* ── My Fires: edit ── */
  function startEdit(report) {
    setEditingId(report.id);
    setEditState((prev) => ({ ...prev, [report.id]: { title: report.title, description: report.description || '' } }));
    setEditFeedback((prev) => ({ ...prev, [report.id]: null }));
  }

  function cancelEdit(id) {
    setEditingId(null);
    setEditFeedback((prev) => ({ ...prev, [id]: null }));
  }

  async function handleEditSave(id) {
    const state = editState[id] || {};
    if (!state.title?.trim()) {
      setEditFeedback((prev) => ({ ...prev, [id]: { type: 'error', message: 'Title is required.' } }));
      return;
    }
    setEditBusy((prev) => ({ ...prev, [id]: true }));
    setEditFeedback((prev) => ({ ...prev, [id]: null }));
    try {
      await updateFireReport(id, { title: state.title.trim(), description: state.description });
      setEditingId(null);
      setEditFeedback((prev) => ({ ...prev, [id]: { type: 'success', message: 'Fire updated.' } }));
      refreshReports();
    } catch (err) {
      setEditFeedback((prev) => ({ ...prev, [id]: { type: 'error', message: err?.message || 'Failed to save.' } }));
    } finally {
      setEditBusy((prev) => ({ ...prev, [id]: false }));
    }
  }

  /* ── My Fires: delete ── */
  async function handleDelete(id) {
    setDeleteBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await deleteFireReport(id);
      setDeletingId(null);
      refreshReports();
    } catch (err) {
      setDeleteBusy((prev) => ({ ...prev, [id]: false }));
      setEditFeedback((prev) => ({ ...prev, [id]: { type: 'error', message: err?.message || 'Failed to delete.' } }));
    }
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#0a0c0e] flex flex-col">

      {/* ── Header ── */}
      <header className="bg-sentinel-900 border-b border-sentinel-700/80 px-5 py-3
                         flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fire-600/15 border border-fire-500/25 flex items-center justify-center">
            <Flame size={16} className="text-fire-400" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">Sentinel</span>
          <span className="text-sentinel-600 text-sm">|</span>
          <span className="text-sentinel-300 text-sm">Reporter Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-sentinel-300">
            <User size={12} />
            <span className="max-w-[200px] truncate">{profile?.email || user.email}</span>
          </div>
          <Link
            to="/account"
            className="flex items-center gap-1.5 text-xs text-sentinel-400 hover:text-white transition-colors"
            title="Account Settings"
          >
            <Settings size={12} />
            <span className="hidden sm:inline">Account</span>
          </Link>
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

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {activeTab === 'add' ? 'Add New Fire' : 'My Fires'}
          </h1>
          <p className="text-sentinel-400 text-sm mt-1">
            {activeTab === 'add'
              ? 'Submit a new wildfire incident. Complete all required (*) fields and submit your report.'
              : 'Edit, update, or delete fires you have submitted. Only your own incidents are shown here.'}
          </p>
        </div>

        {/* ── Tab bar ── */}
        <div
          role="tablist"
          aria-label="Reporter dashboard sections"
          className="flex gap-1 p-1 mb-6 rounded-xl bg-sentinel-800/50 border border-sentinel-700 w-fit"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'add'}
            onClick={() => setActiveTab('add')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'add'
                ? 'bg-[#0096ff] text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700/60'}`}
          >
            <PlusCircle size={13} />
            Add New Fire
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'manage'}
            onClick={() => { setActiveTab('manage'); refreshReports(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeTab === 'manage'
                ? 'bg-[#0096ff] text-white shadow'
                : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700/60'}`}
          >
            <RefreshCw size={13} />
            My Fires
            {myFires.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {myFires.length}
              </span>
            )}
          </button>
        </div>

        {/* ════════════════ TAB 1: ADD NEW FIRE ════════════════ */}
        {activeTab === 'add' && (
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Address */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={MapPin}>Address</SectionHeader>

              <div className="relative mb-4">
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-400 pointer-events-none" />
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
                          className="w-full text-left px-4 py-2.5 text-sm text-sentinel-100 hover:bg-sentinel-600 transition-colors flex items-start gap-2.5"
                        >
                          <MapPin size={13} className="text-[#0096ff] shrink-0 mt-0.5" />
                          <span className="truncate">{feature.properties?.full_address}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none mb-5">
                <input
                  type="checkbox"
                  checked={isIntersection}
                  onChange={(e) => setIsIntersection(e.target.checked)}
                  className="w-4 h-4 rounded border-sentinel-600 bg-sentinel-800 accent-[#0096ff] cursor-pointer"
                />
                <span className="text-sm text-sentinel-200">Intersection Search</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Address 1 <span className="text-red-400">*</span></label>
                  <input type="text" required value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main Street" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Address 2</label>
                  <input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Apt, Suite, Unit (optional)" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>City <span className="text-red-400">*</span></label>
                  <input type="text" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="City name" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>County</label>
                  <CountySelect value={county} onChange={setCounty} />
                </div>
                <div>
                  <label className={LABEL_CLS}>State <span className="text-red-400">*</span></label>
                  <select required value={usState} onChange={(e) => setUsState(e.target.value)} className={INPUT_CLS + ' cursor-pointer'}>
                    <option value="">Select state…</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>ZIP Code <span className="text-red-400">*</span></label>
                  <input type="text" required value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 95602" maxLength={10} className={INPUT_CLS} />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Jurisdiction <span className="text-red-400">*</span></label>
                  <input type="text" required value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. Placer County Fire, USFS Region 5, Cal Fire" className={INPUT_CLS} />
                </div>
              </div>
            </div>

            {/* Incident Details */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={Flame} iconColor="text-fire-400">Incident Details</SectionHeader>
              <div>
                <label className={LABEL_CLS}>Fire Name <span className="text-red-400">*</span></label>
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

            {/* Notes */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={FileText}>Notes</SectionHeader>
              <div>
                <label className={LABEL_CLS}>Incident Notes <span className="text-red-400">*</span></label>
                <textarea
                  required
                  rows={7}
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                  placeholder="Describe the incident: what you saw, when, landmarks, road names, wind direction, estimated fire size, activity level, structures threatened…"
                  maxLength={5000}
                  className={INPUT_CLS + ' resize-y min-h-[140px]'}
                />
                <div className="text-right text-xs text-sentinel-500 mt-1">{incidentNotes.length} / 5000</div>
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
                <div className="text-right text-xs text-sentinel-500 mt-1">{internalNotes.length} / 2000</div>
              </div>
            </div>

            {/* Image Attachments */}
            <div className={SECTION_CLS}>
              <SectionHeader icon={ImageIcon}>Image Attachments</SectionHeader>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${dragging ? 'border-[#0096ff] bg-[#0096ff]/5 scale-[1.01]' : 'border-sentinel-600 hover:border-sentinel-500 hover:bg-sentinel-800/30'}`}
              >
                <Upload size={28} className="mx-auto text-sentinel-400 mb-3" />
                <p className="text-sentinel-200 text-sm font-medium">
                  Drag &amp; drop images here, or <span className="text-[#0096ff]">browse</span>
                </p>
                <p className="text-sentinel-500 text-xs mt-1">PNG, JPG, GIF, WEBP supported</p>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
              </div>
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-sentinel-700 bg-sentinel-800">
                      <img src={img.preview} alt={img.name} className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                          className="p-1.5 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className="px-2 py-1 text-[10px] text-sentinel-400 truncate bg-sentinel-900/70">{img.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Feedback */}
            {error && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-sm">
                <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 pb-8">
              <button
                type="button"
                onClick={() => navigate('/sentinel')}
                className="px-6 py-3 rounded-lg text-sm font-medium text-sentinel-300 border border-sentinel-700 hover:border-sentinel-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !isSupabaseConfigured}
                style={{ backgroundColor: '#0096ff' }}
                className="flex items-center gap-2 px-8 py-3 rounded-lg font-bold text-sm text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={14} />
                {busy ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>

          </form>
        )}

        {/* ════════════════ TAB 2: MY FIRES ════════════════ */}
        {activeTab === 'manage' && (
          <div className={SECTION_CLS}>
            <SectionHeader icon={Flame} iconColor="text-fire-400">
              My Submitted Fires ({myFires.length})
            </SectionHeader>

            {myFires.length === 0 ? (
              <div className="text-center py-12">
                <Flame size={32} className="mx-auto text-sentinel-600 mb-3" />
                <p className="text-sentinel-300 text-sm font-medium">You haven't submitted any fires yet.</p>
                <p className="text-sentinel-500 text-xs mt-1">
                  Use the{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('add')}
                    className="text-[#0096ff] hover:underline"
                  >
                    Add New Fire
                  </button>{' '}
                  tab to report an incident.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {myFires.map((report) => {
                  const isEditing = editingId === report.id;
                  const eState = editState[report.id] || { title: report.title, description: report.description || '' };
                  const efb = editFeedback[report.id];
                  const uState = updateState[report.id] || { acreage: '', notes: '' };
                  const ufb = updateFeedback[report.id];

                  return (
                    <div key={report.id} className="rounded-xl border border-sentinel-700 bg-sentinel-900/50 overflow-hidden">

                      {/* Fire header */}
                      <div className="px-5 py-4 border-b border-sentinel-700 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-white">{report.title}</h3>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider
                              ${report.status === 'approved'
                                ? 'bg-green-600/15 border border-green-600/40 text-green-300'
                                : 'bg-sentinel-700 border border-sentinel-600 text-sentinel-400'}`}>
                              {report.status}
                            </span>
                          </div>
                          <p className="text-xs text-sentinel-400 mt-0.5">
                            Submitted {new Date(report.created_at).toLocaleString()}
                          </p>
                        </div>

                        {/* Edit / Delete buttons */}
                        {!isEditing && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEdit(report)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sentinel-700 text-sentinel-200 hover:bg-sentinel-600 transition-colors"
                            >
                              <Pencil size={11} /> Edit
                            </button>
                            {deletingId === report.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={!!deleteBusy[report.id]}
                                  onClick={() => handleDelete(report.id)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:brightness-110 disabled:opacity-50"
                                >
                                  {deleteBusy[report.id] ? 'Deleting…' : 'Confirm Delete'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sentinel-700 text-sentinel-200 hover:bg-sentinel-600"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(report.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sentinel-700 text-red-400 hover:bg-red-900/40 transition-colors"
                              >
                                <Trash2 size={11} /> Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="p-5 space-y-5">

                        {/* Inline edit form */}
                        {isEditing && (
                          <div className="space-y-3 p-4 rounded-lg bg-sentinel-800 border border-[#0096ff]/30">
                            <p className="text-xs font-semibold text-[#7dc6ff] uppercase tracking-wider">Edit Fire Details</p>
                            <div>
                              <label className={LABEL_CLS}>Fire Name *</label>
                              <input
                                type="text"
                                value={eState.title}
                                onChange={(e) => setEditState((prev) => ({ ...prev, [report.id]: { ...eState, title: e.target.value } }))}
                                className={INPUT_CLS}
                              />
                            </div>
                            <div>
                              <label className={LABEL_CLS}>Description / Notes</label>
                              <textarea
                                rows={5}
                                value={eState.description}
                                onChange={(e) => setEditState((prev) => ({ ...prev, [report.id]: { ...eState, description: e.target.value } }))}
                                className={INPUT_CLS + ' resize-y'}
                              />
                            </div>
                            {efb && (
                              <p className={`text-xs ${efb.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>{efb.message}</p>
                            )}
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => cancelEdit(report.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sentinel-700 text-sentinel-200 hover:bg-sentinel-600"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!!editBusy[report.id]}
                                onClick={() => handleEditSave(report.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0096ff] text-white hover:brightness-110 disabled:opacity-50"
                              >
                                {editBusy[report.id] ? 'Saving…' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Post-edit success/error banner (shown outside edit form) */}
                        {efb && !isEditing && (
                          <p className={`text-xs ${efb.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>{efb.message}</p>
                        )}

                        {/* Post update */}
                        <div>
                          <p className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider mb-3">Post an Update</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={LABEL_CLS}>Updated Acreage</label>
                              <input
                                type="text"
                                value={uState.acreage}
                                onChange={(e) => setUpdateState((prev) => ({ ...prev, [report.id]: { ...uState, acreage: e.target.value } }))}
                                placeholder="e.g. 1,200 acres"
                                className={INPUT_CLS}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={LABEL_CLS}>Notes</label>
                              <textarea
                                rows={3}
                                value={uState.notes}
                                onChange={(e) => setUpdateState((prev) => ({ ...prev, [report.id]: { ...uState, notes: e.target.value } }))}
                                placeholder="Intel updates, behavior changes, evacuations, Watch Duty references…"
                                className={INPUT_CLS + ' resize-y'}
                              />
                            </div>
                          </div>
                          {ufb && (
                            <p className={`text-xs mt-2 ${ufb.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>{ufb.message}</p>
                          )}
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              disabled={!!updateBusy[report.id]}
                              onClick={() => handlePostUpdate(report)}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0096ff] text-white hover:brightness-110 disabled:opacity-50"
                            >
                              <Send size={12} />
                              {updateBusy[report.id] ? 'Posting…' : 'Post Update'}
                            </button>
                          </div>
                        </div>

                        {/* Incident timeline */}
                        <div className="border-t border-sentinel-700 pt-4">
                          <IncidentTimeline incidentId={report.id} allowPost={false} />
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
