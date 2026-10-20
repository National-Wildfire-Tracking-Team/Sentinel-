/**
 * FireDangerAlertSettings.jsx
 * Account page: per saved location, the fire danger emails notification-sync
 * sends (supabase/functions/_shared/fireDangerAlerts.js):
 *   - NWCG 7-day Significant Fire Potential at or above a chosen level, within
 *     a chosen number of forecast days (official outlook);
 *   - 100-hour dead fuel moisture below the user's own threshold at the
 *     nearest current NFDRS station (no default: normal ranges differ by region).
 * Both are off until set.
 */

import { useState } from 'react';
import { SFP_LEVELS } from '../../../supabase/functions/_shared/fireDangerAlerts.js';

const LEVEL_OPTIONS = [['', 'Off'], ...Object.entries(SFP_LEVELS).map(([v, label]) => [v, `${label} or higher`])];
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const SELECT_CLS = 'rounded-md bg-sentinel-800 border border-sentinel-600 px-2 py-1 text-[11px] text-sentinel-100 disabled:opacity-50';

function LocationRow({ location, updateLocation }) {
  const paused = location.alerts_enabled === false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fmDraft, setFmDraft] = useState(location.notify_fm100_below ?? '');

  async function save(fields) {
    setError(null);
    setBusy(true);
    try {
      await updateLocation(location.id, fields);
    } catch (err) {
      setError(err?.message || 'Failed to save fire danger alerts.');
    } finally {
      setBusy(false);
    }
  }

  function saveThreshold() {
    const v = String(fmDraft).trim();
    const next = v === '' ? null : Number(v);
    if (next === (location.notify_fm100_below ?? null)) return;
    save({ notify_fm100_below: next });
  }

  return (
    <div className="rounded-lg border border-sentinel-700 bg-sentinel-800/40 p-2.5 space-y-2 text-xs">
      <div className="text-sentinel-200 truncate">
        {location.name}
        {paused && <span className="text-sentinel-500"> (notifications off)</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sentinel-400">
          Fire potential
          <select
            className={SELECT_CLS}
            disabled={paused || busy}
            value={location.notify_fire_potential_min ?? ''}
            onChange={(e) => save({ notify_fire_potential_min: e.target.value === '' ? null : Number(e.target.value) })}
          >
            {LEVEL_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        {location.notify_fire_potential_min != null && (
          <label className="flex items-center gap-1.5 text-sentinel-400">
            within
            <select
              className={SELECT_CLS}
              disabled={paused || busy}
              value={location.notify_fire_potential_days ?? 2}
              onChange={(e) => save({ notify_fire_potential_days: Number(e.target.value) })}
            >
              {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d === 1 ? 'today' : `${d} days`}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="flex flex-wrap items-center gap-1.5 text-sentinel-400">
        100-hour fuel moisture below
        <input
          type="number"
          min={1}
          max={30}
          step={0.5}
          inputMode="decimal"
          placeholder="off"
          disabled={paused || busy}
          value={fmDraft}
          onChange={(e) => setFmDraft(e.target.value)}
          onBlur={saveThreshold}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className={`${SELECT_CLS} w-16`}
          aria-label={`100-hour fuel moisture threshold for ${location.name}`}
        />
        %
      </label>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}

export default function FireDangerAlertSettings({ locations, updateLocation }) {
  if (!locations.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-sentinel-400">Fire danger alerts</p>
      <p className="text-[11px] text-sentinel-500">
        Fire potential uses the official NWCG 7-Day Significant Fire Potential for areas within each location&apos;s radius.
        The fuel moisture alert uses the nearest NFDRS weather station within 40 km; pick a threshold that is dry for your
        local fuels (one a week at most per station).
      </p>
      {locations.map((location) => (
        <LocationRow key={location.id} location={location} updateLocation={updateLocation} />
      ))}
    </div>
  );
}
