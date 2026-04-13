/**
 * SubmitReportPage.jsx
 * Form for signed-in reporters to submit a new wildfire report.
 * Location can be set by clicking on the map OR by typing coordinates manually.
 * All new reports default to status = "pending" (enforced by RLS).
 */

import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Flame, MapPin, Send, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { submitFireReport } from '../hooks/useFireReports';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const MAP_STYLE = MAPBOX_TOKEN
  ? 'mapbox://styles/mapbox/satellite-streets-v12'
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function SubmitReportPage() {
  const { user, profile, loading, signOut, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [lat, setLat]                 = useState('');
  const [lng, setLng]                 = useState('');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState(null);
  const [success, setSuccess]         = useState(null);

  const handleMapClick = useCallback((evt) => {
    const { lat: clickedLat, lng: clickedLng } = evt.lngLat || {};
    if (Number.isFinite(clickedLat) && Number.isFinite(clickedLng)) {
      setLat(clickedLat.toFixed(5));
      setLng(clickedLng.toFixed(5));
    }
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-sentinel-300">Loading…</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: '/submit-report' }} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (!title.trim() || !description.trim()) {
      setError('Please provide a title and description.');
      return;
    }
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      setError('Please provide a valid location (click the map or enter coordinates).');
      return;
    }

    setBusy(true);
    try {
      await submitFireReport({
        title: title.trim(),
        description: description.trim(),
        latitude: latNum,
        longitude: lngNum,
        userId: user.id,
      });
      setSuccess('Report submitted! It will appear on the public map after review.');
      setTitle('');
      setDescription('');
      setLat('');
      setLng('');
    } catch (err) {
      setError(err?.message || 'Failed to submit report.');
    } finally {
      setBusy(false);
    }
  }

  const markerLat = parseFloat(lat);
  const markerLng = parseFloat(lng);
  const hasMarker = Number.isFinite(markerLat) && Number.isFinite(markerLng);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Flame size={22} className="text-fire-500" />
          <h1 className="text-2xl font-bold text-white">Submit a Fire Report</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-sentinel-300">
          <span>
            Signed in as <span className="text-white">{profile?.email || user.email}</span>
            {profile?.role === 'admin' && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-fire-600/20 border border-fire-600/40 text-fire-300">
                admin
              </span>
            )}
          </span>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="inline-flex items-center gap-1 text-sentinel-300 hover:text-white"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      <p className="text-sentinel-300 text-sm mb-6">
        Reports are reviewed by NWTT moderators before appearing on the public
        live map. Please include clear details and an accurate location.
      </p>

      <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-6">
        {/* Left – form inputs */}
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-xs font-semibold text-sentinel-200 uppercase mb-1.5">
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Smoke column visible on Hwy 20"
              className="w-full px-3 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700
                         text-white placeholder-sentinel-400 focus:border-fire-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-xs font-semibold text-sentinel-200 uppercase mb-1.5">
              Description
            </label>
            <textarea
              id="description"
              required
              rows={5}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you see? When? Any landmarks, road names, wind direction…"
              className="w-full px-3 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700
                         text-white placeholder-sentinel-400 focus:border-fire-500 focus:outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sentinel-200 uppercase mb-1.5">
              <MapPin size={12} className="inline mr-1" />
              Location (click the map or enter manually)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                min={-90}
                max={90}
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitude"
                className="w-full px-3 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700
                           text-white placeholder-sentinel-400 focus:border-fire-500 focus:outline-none"
              />
              <input
                type="number"
                step="any"
                min={-180}
                max={180}
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Longitude"
                className="w-full px-3 py-2 rounded-lg bg-sentinel-800 border border-sentinel-700
                           text-white placeholder-sentinel-400 focus:border-fire-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-950/40 border border-green-800/60 text-green-300 text-xs">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                       bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed
                       text-white font-semibold transition-colors"
          >
            <Send size={14} />
            {busy ? 'Submitting…' : 'Submit Report'}
          </button>

          <div className="text-center">
            <Link to="/live-tracker" className="text-xs text-sentinel-400 hover:text-white">
              ← Back to live tracker
            </Link>
          </div>
        </div>

        {/* Right – interactive map */}
        <div className="h-[420px] md:h-[520px] rounded-xl overflow-hidden border border-sentinel-700 bg-sentinel-800">
          <Map
            mapboxAccessToken={MAPBOX_TOKEN || 'pk.free'}
            mapStyle={MAP_STYLE}
            initialViewState={{ longitude: -114.5, latitude: 44.0, zoom: 3.8 }}
            style={{ width: '100%', height: '100%' }}
            onClick={handleMapClick}
            attributionControl={false}
            projection="mercator"
          >
            <NavigationControl position="top-right" />
            {hasMarker && (
              <Marker longitude={markerLng} latitude={markerLat} anchor="bottom">
                <div className="flex flex-col items-center">
                  <MapPin size={28} className="text-cyan-400 drop-shadow-lg" />
                </div>
              </Marker>
            )}
          </Map>
        </div>
      </form>
    </div>
  );
}
