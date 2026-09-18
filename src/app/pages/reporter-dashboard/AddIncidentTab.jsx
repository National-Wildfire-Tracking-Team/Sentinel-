/**
 * AddIncidentTab.jsx
 * Multi-section form for submitting a new wildfire incident: address (with
 * Mapbox autocomplete), incident details, notes, and photo attachments.
 */

import { useState, useRef } from 'react';
import {
  MapPin, Search, Flame, FileText, ImageIcon, Upload, AlertCircle,
  CheckCircle2, Send, RefreshCw, ArrowLeft, Loader2,
} from 'lucide-react';

import { supabase, isSupabaseConfigured } from '../../../shared/api/supabaseClient';
import { getAppOrigin } from '../../../shared/utils/getAppOrigin';
import { acquireSlot } from '../../utils/mapboxRateLimiter';
import { submitFireReport } from '../../hooks/useFireReports';
import { insertReporterUpdate } from '../../hooks/useIncidentUpdates';
import { useImageAttachments } from '../../hooks/useImageAttachments';
import { uploadIncidentPhotos } from '../../api/incidentPhotos';
import { Analytics, AnalyticsEvent } from '../../../shared/services/analytics';
import PhotoThumbnailGrid from '../../components/PhotoAttachments/PhotoThumbnailGrid';
import {
  INPUT_CLS, LABEL_CLS, SECTION_CLS, SectionHeader, CountySelect,
  US_STATES, MAPBOX_TOKEN, geocodeViaDirect,
} from './shared';

export default function AddIncidentTab({ userId, profile, onSubmitted }) {
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
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchDebounceRef = useRef(null);

  const [incidentName, setIncidentName] = useState('');
  const [initialAcres, setInitialAcres] = useState('');
  const [initialContainment, setInitialContainment] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const { images, addFiles: handleFiles, removeImage, reset: resetImages, error: imagesError } = useImageAttachments();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  function handleAddressSearchChange(e) {
    const val = e.target.value;
    setAddressSearch(val);
    setSearchError(null);
    clearTimeout(searchDebounceRef.current);
    if (!val.trim() || val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  async function fetchSuggestions(q) {
    setSearchLoading(true);
    setSearchError(null);
    let features = null;

    if (isSupabaseConfigured) {
      try {
        await acquireSlot();
        const { data, error: err } = await supabase.functions.invoke('mapbox-geocoding', {
          body: { query: q, country: 'us', autocomplete: true, limit: 5, types: 'address' },
        });
        if (!err && Array.isArray(data?.features)) {
          features = data.features;
        }
      } catch {
        // fall through to direct fallback below
      }
    }

    if (features === null && MAPBOX_TOKEN) {
      try {
        features = await geocodeViaDirect(q, { limit: 5, types: 'address', autocomplete: true });
      } catch (err) {
        console.error('Address suggestion fallback error:', err);
      }
    }

    setSearchLoading(false);

    if (features === null) {
      setSearchError('Address search unavailable. Check your connection or enter the address manually.');
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSuggestions(features);
    setShowSuggestions(features.length > 0);
  }

  function applySuggestion(feature) {
    const props = feature.properties || {};
    const ctx = props.context || {};
    const coords = feature.geometry?.coordinates;
    setAddress1(props.address_line1 || props.name || '');
    setCity(ctx.place?.name || ctx.locality?.name || '');
    setCounty((ctx.district?.name || '').replace(/\s+county$/i, '').trim());
    setUsState(ctx.region?.name || '');
    setZip(ctx.postcode?.name || '');
    setAddressSearch(props.full_address || feature.place_name || props.name || '');
    setReportLng(Array.isArray(coords) ? Number(coords[0]) : null);
    setReportLat(Array.isArray(coords) ? Number(coords[1]) : null);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError(null);
  }

  async function geocodeAddressForReport() {
    const query = [address1, city, usState, zip].filter(Boolean).join(', ');
    if (!query) return { latitude: null, longitude: null };

    if (isSupabaseConfigured) {
      try {
        await acquireSlot();
        const { data, error: err } = await supabase.functions.invoke('mapbox-geocoding', {
          body: { query, country: 'us', autocomplete: false, limit: 1 },
        });
        if (!err) {
          const first = data?.features?.[0];
          if (Array.isArray(first?.geometry?.coordinates)) {
            return {
              latitude: Number(first.geometry.coordinates[1]),
              longitude: Number(first.geometry.coordinates[0]),
            };
          }
        }
      } catch {
        // fall through
      }
    }

    if (MAPBOX_TOKEN) {
      try {
        const features = await geocodeViaDirect(query, { limit: 1, autocomplete: false });
        const first = features?.[0];
        if (Array.isArray(first?.geometry?.coordinates)) {
          return {
            latitude: Number(first.geometry.coordinates[1]),
            longitude: Number(first.geometry.coordinates[0]),
          };
        }
      } catch {
        // both paths failed
      }
    }

    return { latitude: null, longitude: null };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!incidentName.trim()) { setError('Incident name is required.'); return; }
    if (!incidentNotes.trim()) { setError('Incident notes are required.'); return; }
    if (!address1.trim() || !city.trim() || !usState || !zip.trim() || !jurisdiction.trim()) {
      setError('Please complete all required (*) address fields.');
      return;
    }
    const rawInitAcres = initialAcres.toString().trim();
    if (rawInitAcres !== '' && !Number.isFinite(Number(rawInitAcres))) {
      setError('Estimated acres must be a valid number.');
      return;
    }
    const rawInitContain = initialContainment.toString().trim();
    if (rawInitContain !== '' && !Number.isFinite(Number(rawInitContain))) {
      setError('Containment must be a number between 0 and 100.');
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

      const opsLines = [];
      if (initialAcres.toString().trim()) {
        opsLines.push(`Acreage: ${initialAcres.toString().trim()}`);
      }
      if (rawInitContain !== '') {
        const c = Math.min(100, Math.max(0, Math.round(Number(rawInitContain))));
        opsLines.push(`Containment: ${c}%`);
      }
      const opsBlock = opsLines.length > 0 ? `\n\n${opsLines.join('\n')}` : '';

      const description = [
        `ADDRESS: ${locationLine}`,
        `JURISDICTION: ${jurisdiction}`,
        isIntersection ? 'INTERSECTION SEARCH: Yes' : null,
        `\nINCIDENT NOTES:\n${incidentNotes}`,
        opsBlock || null,
        internalNotes.trim() ? `\nINTERNAL NOTES:\n${internalNotes}` : null,
      ].filter(Boolean).join('\n');

      const created = await submitFireReport({
        title: incidentName.trim(),
        description,
        latitude,
        longitude,
        userId,
      });

      const sourceName = profile?.email?.split('@')[0] || 'Reporter';
      const initialTimelineParts = [
        `Initial report: ${incidentName.trim()}`,
        '',
        ...opsLines,
        opsLines.length > 0 ? '' : null,
        incidentNotes.trim(),
      ].filter((line) => line !== null && line !== '');
      const initialTimelineBody = initialTimelineParts.join('\n');
      const photoUrls = images.length
        ? await uploadIncidentPhotos(images.map((img) => img.file), { userId, incidentId: created.id })
        : [];
      await insertReporterUpdate({
        incidentId: created.id,
        content: initialTimelineBody,
        sourceName,
        userId,
        photoUrls,
      });

      Analytics.trackEvent(AnalyticsEvent.EVENT_REPORT_SUBMITTED, { report_type: 'incident', fire_state: usState });
      setSuccess('Incident submitted and is now live on the map.');

      setAddressSearch(''); setIsIntersection(false);
      setAddress1(''); setAddress2(''); setCity(''); setCounty('');
      setUsState(''); setZip(''); setJurisdiction('');
      setReportLat(null); setReportLng(null);
      setSuggestions([]); setShowSuggestions(false);
      setIncidentName(''); setIncidentNotes(''); setInternalNotes('');
      setInitialAcres(''); setInitialContainment('');
      resetImages();
      onSubmitted();
    } catch (err) {
      setError(err?.message || 'Failed to submit incident.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Address */}
      <div className={SECTION_CLS}>
        <SectionHeader icon={MapPin}>Location</SectionHeader>

        <div className="relative mb-4">
          <div className="relative">
            {searchLoading
              ? <Loader2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fire-500 pointer-events-none animate-spin" />
              : <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sentinel-500 pointer-events-none" />
            }
            <input
              type="text"
              value={addressSearch}
              onChange={handleAddressSearchChange}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search address to auto-fill fields below…"
              autoComplete="off"
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-sentinel-900 border border-sentinel-600
                         text-white placeholder-sentinel-500 focus:outline-none focus:border-fire-600
                         focus:ring-1 focus:ring-fire-600/20 transition-colors text-sm"
            />
          </div>
          {searchError && (
            <p className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle size={12} className="shrink-0" />
              {searchError}
            </p>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full rounded-lg bg-sentinel-900 border border-sentinel-600 shadow-2xl overflow-hidden">
              {suggestions.map((feature, idx) => (
                <li key={feature.properties?.mapbox_id || feature.id || idx}>
                  <button
                    type="button"
                    onMouseDown={() => applySuggestion(feature)}
                    className="w-full text-left px-4 py-2.5 text-sm text-sentinel-200 hover:bg-sentinel-700 transition-colors flex items-start gap-2.5"
                  >
                    <MapPin size={13} className="text-fire-500 shrink-0 mt-0.5" />
                    <span className="truncate">{feature.properties?.full_address || feature.place_name || feature.text}</span>
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
            className="w-4 h-4 rounded border-sentinel-600 bg-sentinel-800 accent-fire-600 cursor-pointer"
          />
          <span className="text-sm text-sentinel-200">Intersection Search</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Address Line 1 <span className="text-red-400">*</span></label>
            <input type="text" required value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main Street" className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Address Line 2</label>
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
            <input
              type="text"
              required
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="e.g. Placer County Fire, USFS Region 5, CAL FIRE"
              className={INPUT_CLS}
            />
          </div>
        </div>
      </div>

      {/* Incident Details */}
      <div className={SECTION_CLS}>
        <SectionHeader icon={Flame} iconColor="text-orange-400">Incident Details</SectionHeader>
        <div>
          <label className={LABEL_CLS}>Incident Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            required
            value={incidentName}
            onChange={(e) => setIncidentName(e.target.value)}
            placeholder="e.g. Caldor Fire, River Fire, Tahoe Fire"
            maxLength={120}
            className={INPUT_CLS}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={LABEL_CLS}>Estimated acres</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={initialAcres}
              onChange={(e) => setInitialAcres(e.target.value)}
              placeholder="Optional — shows on public map"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Containment (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={initialContainment}
              onChange={(e) => setInitialContainment(e.target.value)}
              placeholder="Optional — 0–100"
              className={INPUT_CLS}
            />
          </div>
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
            placeholder="Describe the incident: what you observed, when, landmarks, road names, wind direction, estimated fire size, activity level, structures threatened…"
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
            ${dragging
              ? 'border-fire-600 bg-fire-600/5 scale-[1.01]'
              : 'border-sentinel-600 hover:border-sentinel-400 hover:bg-sentinel-900'}`}
        >
          <Upload size={28} className="mx-auto text-sentinel-500 mb-3" />
          <p className="text-sentinel-200 text-sm font-medium">
            Drag &amp; drop images here, or <span className="text-fire-500">browse files</span>
          </p>
          <p className="text-sentinel-500 text-xs mt-1">PNG, JPG, GIF, WEBP supported</p>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} className="hidden" />
        </div>
        {imagesError && <p className="text-[11px] text-red-400 mt-2">{imagesError}</p>}
        <PhotoThumbnailGrid images={images} onRemove={removeImage} />
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
      <div className="flex items-center justify-between gap-3 pt-2 pb-8">
        <a
          href={getAppOrigin()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-sentinel-300 border border-sentinel-600 hover:border-sentinel-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          View Live Map
        </a>
        <button
          type="submit"
          disabled={busy || !isSupabaseConfigured}
          className="flex items-center gap-2 px-8 py-2.5 rounded-lg font-bold text-sm text-white bg-fire-600 hover:bg-fire-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy ? (
            <><RefreshCw size={15} className="animate-spin" /> Submitting…</>
          ) : (
            <><Send size={15} /> Submit Incident</>
          )}
        </button>
      </div>
    </form>
  );
}
