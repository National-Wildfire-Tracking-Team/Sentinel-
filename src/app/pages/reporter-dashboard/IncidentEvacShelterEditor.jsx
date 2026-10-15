/**
 * IncidentEvacShelterEditor.jsx
 * Reporter editor for an incident's evacuation levels and shelters — the
 * data behind the evacuation cards and Shelters tab in the incident panel.
 * Works for any incident id (reporter incidents and official IRWIN / CAL FIRE
 * ones). Changing evacuation levels can also post an "Evacuation" entry to
 * the live timeline, which drives the panel's situation line and notifies
 * followers.
 */

import { useState } from 'react';
import {
  AlertCircle, CheckCircle2, Pencil, Plus, RefreshCw, Save, Trash2, X,
} from 'lucide-react';
import {
  deleteIncidentShelter, saveIncidentEvacuations, saveIncidentShelter,
  useIncidentEvacuations, useIncidentShelters,
} from '../../hooks/useIncidentDetails';
import { insertReporterUpdate } from '../../hooks/useIncidentUpdates';
import {
  SHELTER_KIND_LABELS, evacuationChangeText, parseZones,
} from '../../components/FireDetailPanel/incidentDetailModel';
import { INPUT_CLS, LABEL_CLS } from './shared';

const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-sentinel-300 ' +
  'border border-sentinel-600 hover:text-white hover:border-sentinel-400 transition-colors disabled:opacity-50';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white ' +
  'bg-fire-600/25 border border-fire-600/50 hover:bg-fire-600/35 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

function Feedback({ feedback }) {
  if (!feedback) return null;
  const isError = feedback.type === 'error';
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${
      isError ? 'bg-red-950/40 border-red-800/60 text-red-300' : 'bg-green-950/40 border-green-800/60 text-green-300'
    }`}>
      {isError ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
      <span>{feedback.message}</span>
    </div>
  );
}

function rowsToLevels(rows) {
  const pick = (level) => {
    const row = rows.find((r) => r.level === level);
    return row ? { zones: row.zones || [] } : null;
  };
  return { order: pick('order'), warning: pick('warning') };
}

// ─── Evacuations ─────────────────────────────────────────────────────────────

/**
 * Remounted (via key) whenever the saved rows change, so it starts from them.
 * Feedback lives in the parent so a save's message survives that remount.
 */
function EvacuationForm({ incidentId, aliasIds, rows, profile, userId, feedback, setFeedback }) {
  const saved = rowsToLevels(rows);
  const first = rows[0];
  const [orderOn, setOrderOn] = useState(Boolean(saved.order));
  const [orderZones, setOrderZones] = useState(saved.order?.zones.join(', ') ?? '');
  const [warningOn, setWarningOn] = useState(Boolean(saved.warning));
  const [warningZones, setWarningZones] = useState(saved.warning?.zones.join(', ') ?? '');
  const [notes, setNotes] = useState(first?.notes ?? '');
  const [links, setLinks] = useState(() => (Array.isArray(first?.links) && first.links.length
    ? first.links.map((l) => ({ label: l.label ?? '', url: l.url ?? '' }))
    : []));
  const [postToTimeline, setPostToTimeline] = useState(true);
  const [busy, setBusy] = useState(false);

  const setLink = (i, field, value) => setLinks((prev) => prev.map((l, j) => (j === i ? { ...l, [field]: value } : l)));

  async function handleSave() {
    const cleanLinks = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label || l.url);
    const bad = cleanLinks.find((l) => !l.label || !/^https?:\/\//i.test(l.url));
    if (bad) {
      setFeedback({ type: 'error', message: 'Each link needs a label and a URL starting with https://.' });
      return;
    }
    if (!orderOn && !warningOn && (notes.trim() || cleanLinks.length)) {
      setFeedback({ type: 'error', message: 'Notes and links are shown with an order or warning. Turn one on, or clear them.' });
      return;
    }

    const next = {
      order: orderOn ? { zones: parseZones(orderZones) } : null,
      warning: warningOn ? { zones: parseZones(warningZones) } : null,
    };
    setBusy(true);
    setFeedback(null);
    try {
      await saveIncidentEvacuations({ incidentId, aliasIds, levels: next, notes: notes.trim(), links: cleanLinks, userId });
      const change = evacuationChangeText(saved, next);
      if (change && postToTimeline) {
        await insertReporterUpdate({
          incidentId,
          content: change,
          sourceName: profile?.email?.split('@')[0] || 'Reporter',
          userId,
          updateType: 'evacuation',
        });
      }
      // On success the rows refetch over realtime and this form remounts.
      setFeedback({ type: 'success', message: change && postToTimeline ? 'Saved and posted to the timeline.' : 'Saved.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save evacuations.' });
    } finally {
      setBusy(false);
    }
  }

  const levelBlock = (label, hint, on, setOn, zones, setZones, accent) => (
    <div className={`rounded-lg border p-3 ${on ? accent : 'border-sentinel-700'}`}>
      <label className="flex items-center gap-2 text-sm font-semibold text-white cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-fire-600 w-4 h-4" />
        {label}
      </label>
      {on && (
        <div className="mt-2">
          <input
            type="text"
            value={zones}
            onChange={(e) => setZones(e.target.value)}
            placeholder={hint}
            className={INPUT_CLS}
            aria-label={`${label} zones`}
          />
          <p className="mt-1 text-xs text-sentinel-500">Zone IDs, separated by commas.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {levelBlock('Evacuation Order · Level 3 · Go', 'e.g. RIV-E1042, RIV-E1043', orderOn, setOrderOn, orderZones, setOrderZones, 'border-red-500/40 bg-red-500/5')}
      {levelBlock('Evacuation Warning · Level 2 · Set', 'e.g. RIV-E1038, RIV-E1039', warningOn, setWarningOn, warningZones, setWarningZones, 'border-amber-500/40 bg-amber-500/5')}

      <div>
        <label className={LABEL_CLS} htmlFor={`evac-notes-${incidentId}`}>Evacuation Notes</label>
        <textarea
          id={`evac-notes-${incidentId}`}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          placeholder="Who's managing evacuations, routes out, closed roads…"
          className={INPUT_CLS + ' resize-y'}
        />
      </div>

      <div>
        <span className={LABEL_CLS}>Links</span>
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={link.label}
                onChange={(e) => setLink(i, 'label', e.target.value)}
                placeholder="Label (e.g. Genasys evacuation map)"
                className={INPUT_CLS + ' flex-[2]'}
                aria-label="Link label"
              />
              <input
                type="url"
                value={link.url}
                onChange={(e) => setLink(i, 'url', e.target.value)}
                placeholder="https://"
                className={INPUT_CLS + ' flex-[3]'}
                aria-label="Link URL"
              />
              <button
                type="button"
                onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                className="p-2 rounded-lg text-sentinel-400 hover:text-red-400 hover:bg-red-500/10"
                aria-label="Remove link"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLinks((prev) => [...prev, { label: '', url: '' }])} className={BTN_SECONDARY}>
            <Plus size={13} /> Add link
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-sentinel-300 cursor-pointer">
        <input
          type="checkbox"
          checked={postToTimeline}
          onChange={(e) => setPostToTimeline(e.target.checked)}
          className="accent-fire-600 w-4 h-4"
        />
        Post level changes to the live timeline (notifies followers)
      </label>

      <Feedback feedback={feedback} />

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={busy} className={BTN_PRIMARY}>
          {busy ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
          Save Evacuations
        </button>
      </div>
    </div>
  );
}

// ─── Shelters ────────────────────────────────────────────────────────────────

const EMPTY_SHELTER = { kind: 'evacuation_center', name: '', address: '', status_note: '' };

function ShelterForm({ initial, onSave, onCancel }) {
  const [values, setValues] = useState({ ...EMPTY_SHELTER, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.name.trim()) {
      setError('Give the shelter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        kind: values.kind,
        name: values.name.trim(),
        address: values.address.trim() || null,
        status_note: values.status_note.trim() || null,
      });
    } catch (err) {
      setError(err?.message || 'Failed to save shelter.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-sentinel-700 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Type</label>
          <select value={values.kind} onChange={set('kind')} className={INPUT_CLS}>
            {Object.entries(SHELTER_KIND_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Name <span className="text-red-400">*</span></label>
          <input type="text" value={values.name} onChange={set('name')} maxLength={200} placeholder="e.g. Hamilton High School" className={INPUT_CLS} />
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Address</label>
        <input type="text" value={values.address} onChange={set('address')} maxLength={300} placeholder="57430 Mitchell Rd, Anza, CA" className={INPUT_CLS} />
        <p className="mt-1 text-xs text-sentinel-500">Used for the Directions link.</p>
      </div>
      <div>
        <label className={LABEL_CLS}>Status</label>
        <input type="text" value={values.status_note} onChange={set('status_note')} maxLength={200} placeholder="e.g. Open · Red Cross" className={INPUT_CLS} />
      </div>
      {error && <Feedback feedback={{ type: 'error', message: error }} />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>Cancel</button>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
          {busy ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
          Save Shelter
        </button>
      </div>
    </form>
  );
}

function ShelterEditor({ incidentId, shelters, userId }) {
  const [editingId, setEditingId] = useState(null); // shelter id | 'new' | null
  const [error, setError] = useState(null);

  async function handleDelete(shelter) {
    if (!window.confirm(`Remove ${shelter.name}?`)) return;
    setError(null);
    try {
      await deleteIncidentShelter(shelter.id);
    } catch (err) {
      setError(err?.message || 'Failed to remove shelter.');
    }
  }

  const nextSortOrder = shelters.reduce((max, s) => Math.max(max, s.sort_order ?? 0), -1) + 1;

  return (
    <div className="space-y-2">
      {shelters.length === 0 && editingId !== 'new' && (
        <p className="text-sm text-sentinel-500">No shelters listed. The Shelters tab is hidden until you add one.</p>
      )}
      {shelters.map((s) => (editingId === s.id ? (
        <ShelterForm
          key={s.id}
          initial={{ kind: s.kind, name: s.name, address: s.address ?? '', status_note: s.status_note ?? '' }}
          onSave={async (fields) => { await saveIncidentShelter({ id: s.id, ...fields }); setEditingId(null); }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-sentinel-700 p-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sentinel-400">
              {SHELTER_KIND_LABELS[s.kind] || SHELTER_KIND_LABELS.other}
            </p>
            <p className="text-sm font-semibold text-white">{s.name}</p>
            {s.address && <p className="text-xs text-sentinel-300">{s.address}</p>}
            {s.status_note && <p className="text-xs text-sentinel-400">{s.status_note}</p>}
          </div>
          <div className="flex shrink-0">
            <button type="button" onClick={() => setEditingId(s.id)} className="p-2 rounded-lg text-sentinel-300 hover:text-white hover:bg-sentinel-700" aria-label={`Edit ${s.name}`}>
              <Pencil size={14} />
            </button>
            <button type="button" onClick={() => handleDelete(s)} className="p-2 rounded-lg text-sentinel-300 hover:text-red-400 hover:bg-red-500/10" aria-label={`Remove ${s.name}`}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )))}

      {editingId === 'new' ? (
        <ShelterForm
          initial={EMPTY_SHELTER}
          onSave={async (fields) => {
            await saveIncidentShelter({ incidentId, userId, sort_order: nextSortOrder, ...fields });
            setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditingId('new')} className={BTN_SECONDARY}>
          <Plus size={13} /> Add shelter
        </button>
      )}
      {error && <Feedback feedback={{ type: 'error', message: error }} />}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * @param {string}   incidentId  Primary id; all writes go here.
 * @param {string[]} [aliasIds]  Other ids of the same fire (utils/incidentAliases.js);
 *                               existing data under them is shown and superseded.
 */
export default function IncidentEvacShelterEditor({ incidentId, aliasIds, profile, userId }) {
  const evacuationRows = useIncidentEvacuations(incidentId, aliasIds);
  const shelters = useIncidentShelters(incidentId, aliasIds);
  const formKey = evacuationRows.map((r) => `${r.id}:${r.updated_at}`).join('|') || 'none';
  const [evacFeedback, setEvacFeedback] = useState(null);

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-xs font-bold text-sentinel-300 uppercase tracking-wider mb-3">Evacuations</h4>
        <EvacuationForm
          key={formKey}
          incidentId={incidentId}
          aliasIds={aliasIds}
          rows={evacuationRows}
          profile={profile}
          userId={userId}
          feedback={evacFeedback}
          setFeedback={setEvacFeedback}
        />
      </section>
      <section className="border-t border-sentinel-700 pt-5">
        <h4 className="text-xs font-bold text-sentinel-300 uppercase tracking-wider mb-3">Shelters</h4>
        <ShelterEditor incidentId={incidentId} shelters={shelters} userId={userId} />
      </section>
    </div>
  );
}
