import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Send, MapPin, AlertCircle, CheckCircle } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active',    color: 'text-red-400' },
  { value: 'contained', label: 'Contained', color: 'text-yellow-400' },
  { value: 'out',       label: 'Out',       color: 'text-green-400' },
];

const EMPTY = {
  title: '',
  description: '',
  latitude: '',
  longitude: '',
  address: '',
  status: 'active',
};

export default function IncidentForm({ userId }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      source: 'reporter',
      user_id: userId,
      latitude:  form.latitude  ? parseFloat(form.latitude)  : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      address:   form.address.trim() || null,
    };

    const { error } = await supabase.from('incidents').insert(payload);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setForm(EMPTY);
    }

    setLoading(false);
  }

  return (
    <div className="bg-sentinel-800 border border-sentinel-700 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
        <Send size={18} className="text-fire-500" />
        Submit Incident
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-sentinel-200 mb-1.5">
            Title <span className="text-fire-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={set('title')}
            placeholder="e.g. Hillside brush fire near Route 1"
            className="w-full px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-sentinel-200 mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            value={form.description}
            onChange={set('description')}
            placeholder="Describe what you observed — size, direction, smoke color, structures threatened…"
            className="w-full px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm resize-none"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-sentinel-200 mb-1.5">
            Status <span className="text-fire-500">*</span>
          </label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, status: opt.value }))}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  form.status === opt.value
                    ? 'bg-sentinel-600 border-sentinel-500 text-white'
                    : 'bg-sentinel-700 border-sentinel-600 text-sentinel-300 hover:text-white'
                }`}
              >
                <span className={opt.color}>●</span> {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-sentinel-200 mb-1.5 flex items-center gap-1">
            <MapPin size={13} className="text-sentinel-400" />
            Location
          </label>
          <p className="text-xs text-sentinel-400 mb-2">Enter coordinates or a text address (or both).</p>

          <div className="flex gap-2 mb-2">
            <input
              type="number"
              step="any"
              value={form.latitude}
              onChange={set('latitude')}
              placeholder="Latitude (e.g. 34.052)"
              className="flex-1 px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm"
            />
            <input
              type="number"
              step="any"
              value={form.longitude}
              onChange={set('longitude')}
              placeholder="Longitude (e.g. -118.243)"
              className="flex-1 px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm"
            />
          </div>

          <input
            type="text"
            value={form.address}
            onChange={set('address')}
            placeholder="Or enter address: 123 Main St, Los Angeles, CA"
            className="w-full px-4 py-2.5 rounded-xl bg-sentinel-700 border border-sentinel-600 text-white placeholder-sentinel-400 focus:outline-none focus:border-fire-500 transition-colors text-sm"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
            <CheckCircle size={16} />
            Incident submitted successfully.
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fire-600 hover:bg-fire-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          <Send size={15} />
          {loading ? 'Submitting…' : 'Submit Incident'}
        </button>
      </form>
    </div>
  );
}
