/** Display formatting, following the web's src/app/utils/formatUtils.js. */

export type ClockFormat = '12h' | '24h';
let hour12 = true;

/** Set by PreferencesProvider from the user's display preference (time_format). */
export function setClockFormat(format: ClockFormat) {
  hour12 = format !== '24h';
}

export function formatAcres(acres: number | null | undefined): string {
  if (acres == null || Number.isNaN(Number(acres))) return 'Unknown';
  const value = Math.trunc(Number(acres) * 100) / 100;
  if (value >= 1_000_000) {
    const millions = Math.trunc((value / 1_000_000) * 100) / 100;
    return `${millions.toLocaleString('en-US', { maximumFractionDigits: 2 })}M acres`;
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} acres`;
}

export function formatContainment(contained: number | null): string {
  return contained === null ? 'Unknown' : `${Math.round(contained)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Oct 27, 2026, 2:15 PM PDT" (formatDateTime on the web). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    hour12,
  });
}

/** Time today, else "Oct 27, 2:15 PM" (formatClockTime on the web). */
export function formatClockTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12 });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

/** "Just now", "5m ago", "3h ago", "2d ago", then a date (formatRelativeTime on the web). */
export function formatRelative(iso: string | Date | null, now = Date.now()): string {
  if (!iso) return 'Unknown';
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(t)) return 'Unknown';
  const secs = Math.floor(Math.abs(now - t) / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
