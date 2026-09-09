/**
 * EvacZonesTab.jsx
 * Lets a reporter draw and manage their own evacuation zone polygons.
 * Ownership stays scoped to the submitting reporter — unlike incidents,
 * collaborative cross-reporter editing wasn't part of this feature's scope.
 */

import { useState } from 'react';
import {
  PenTool, MapPin, EyeOff, Trash2, RefreshCw, AlertCircle, CheckCircle2,
  Flame, X,
} from 'lucide-react';

import {
  createReporterEvacZone,
  liftReporterEvacZone,
  deleteReporterEvacZone,
} from '../../hooks/useReporterEvacZones';
import EvacZoneDrawer from '../../components/Map/EvacZoneDrawer';

const ZONE_TYPE_COLORS = {
  'Evacuation Order':   { bg: 'bg-red-500/15',    border: 'border-red-500/30',    text: 'text-red-400' },
  'Evacuation Warning': { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400' },
  'Evacuation Watch':   { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400' },
};

function EvacZoneCard({ zone, onRefresh }) {
  const [busy, setBusy]         = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const colors = ZONE_TYPE_COLORS[zone.zone_type] || ZONE_TYPE_COLORS['Evacuation Order'];

  async function handleLift() {
    setBusy(true);
    setFeedback(null);
    try {
      await liftReporterEvacZone(zone.id);
      setFeedback({ type: 'success', message: 'Zone lifted. It will no longer appear on the map.' });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to lift zone.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteReporterEvacZone(zone.id);
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete zone.' });
      setBusy(false);
    }
  }

  const polygonCount = (() => {
    const g = zone.geometry;
    if (!g) return 0;
    if (g.type === 'Polygon') return 1;
    if (g.type === 'MultiPolygon') return g.coordinates?.length ?? 1;
    return 1;
  })();

  return (
    <div className={`bg-sentinel-800 border ${colors.border} rounded-xl p-4`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-white text-sm truncate">{zone.title}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.bg} ${colors.border} ${colors.text} uppercase tracking-wider`}>
              {zone.zone_type}
            </span>
            {zone.status !== 'active' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sentinel-700 border-sentinel-600 text-sentinel-300 uppercase tracking-wider">
                {zone.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sentinel-300 text-xs flex-wrap">
            {zone.incident_name && (
              <span className="flex items-center gap-1">
                <Flame size={10} className="text-orange-400" />
                {zone.incident_name}
              </span>
            )}
            {(zone.county || zone.state) && (
              <span className="flex items-center gap-1">
                <MapPin size={10} />
                {[zone.county && `${zone.county} County`, zone.state].filter(Boolean).join(', ')}
              </span>
            )}
            <span>{polygonCount} polygon{polygonCount !== 1 ? 's' : ''}</span>
            <span className="text-sentinel-500">{new Date(zone.created_at).toLocaleDateString()}</span>
          </div>
          {zone.description && (
            <p className="text-sentinel-300 text-xs mt-1.5 line-clamp-2">{zone.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {zone.status === 'active' && (
            <button
              type="button"
              onClick={handleLift}
              disabled={busy}
              title="Lift zone (deactivate)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 border border-sentinel-600 hover:text-orange-400 hover:border-orange-800 transition-colors disabled:opacity-50"
            >
              <EyeOff size={12} />
              <span className="hidden sm:inline">Lift</span>
            </button>
          )}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              title="Delete zone"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 border border-sentinel-600 hover:text-red-400 hover:border-red-800 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Delete</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-400">Sure?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {busy ? <RefreshCw size={11} className="animate-spin" /> : 'Yes'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-sentinel-300 hover:text-white transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 mt-2 p-2.5 rounded-lg text-xs border ${
          feedback.type === 'error'
            ? 'bg-red-950/40 border-red-800/60 text-red-300'
            : 'bg-green-950/40 border-green-800/60 text-green-300'
        }`}>
          {feedback.type === 'error'
            ? <AlertCircle size={12} className="shrink-0 mt-0.5" />
            : <CheckCircle2 size={12} className="shrink-0 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}

export default function EvacZonesTab({ zones, loading, userId, onRefresh }) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState(null);

  async function handleSave(zoneData) {
    setSaving(true);
    setSaveError(null);
    try {
      await createReporterEvacZone({ userId, ...zoneData });
      setShowDrawer(false);
      onRefresh();
    } catch (err) {
      setSaveError(err?.message || 'Failed to publish zone.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
        <AlertCircle size={14} className="shrink-0" />
        <span>
          Evacuation zones you publish here go live on the public map immediately. Only you can lift or delete your own zones.
        </span>
      </div>

      {!showDrawer ? (
        <button
          type="button"
          onClick={() => setShowDrawer(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-fire-600 hover:bg-fire-700 transition-colors"
        >
          <PenTool size={14} />
          Draw New Evacuation Zone
        </button>
      ) : (
        <div className="bg-sentinel-800 border border-sentinel-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wider">New Evacuation Zone</h2>
            <button
              type="button"
              onClick={() => setShowDrawer(false)}
              className="p-1.5 rounded-lg text-sentinel-300 hover:text-white hover:bg-sentinel-700 transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <EvacZoneDrawer
            onSave={handleSave}
            onCancel={() => setShowDrawer(false)}
            saving={saving}
            saveError={saveError}
          />
        </div>
      )}

      {loading ? (
        <div className="text-sentinel-300 text-sm py-12 text-center">Loading your evacuation zones…</div>
      ) : zones.length === 0 ? (
        <div className="text-sentinel-400 text-sm py-12 text-center">
          You haven&apos;t published any evacuation zones yet.
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <EvacZoneCard key={zone.id} zone={zone} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
