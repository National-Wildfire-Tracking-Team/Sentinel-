/**
 * status.js
 * Plain-language status lines for the Fire Danger & Fuels drawer and
 * inspection panel: what is shown, for which date, and whether it is
 * current, partly issued, stale or unavailable.
 */

import { STATION_FIELDS } from './stations';

const STATION_FIELD_LABELS = Object.fromEntries(Object.entries(STATION_FIELDS).map(([k, v]) => [k, v.label]));

/** YYYY-MM-DD → "Tue, Oct 20" (a calendar date, so no time-zone shift). */
export function formatForecastDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}

/** What the fire potential row in the drawer says (null: nothing to say yet). */
export function sfpStatus(sfp) {
  const { data, error, loading, summary, freshness, day } = sfp;
  if (!data) {
    if (error) return { tone: 'error', text: `Fire potential unavailable: ${error.message}`, retry: true };
    return loading ? { tone: 'loading', text: 'Loading 7-day fire potential…' } : null;
  }
  const date = formatForecastDate(summary.forecastDate);
  const base = `Day ${day}${date ? ` · ${date}` : ''}`;
  const refreshNote = error ? " · couldn't refresh" : '';
  switch (freshness?.status) {
    case 'stale':
      return {
        tone: 'error',
        text: `${base}: the newest NWCG forecast is for ${date}, not ${formatForecastDate(freshness.expectedDate)}. It is shown as last issued.${refreshNote}`,
        retry: true,
      };
    case 'pending':
      return { tone: 'info', text: `${base}: no areas issued yet for this date (NWCG updates by noon MDT)${refreshNote}`, retry: Boolean(error) };
    case 'partial':
      return {
        tone: 'info',
        text: `${base}: ${summary.issued} of ${summary.areas} areas issued; the rest are not yet updated and are left unrated${refreshNote}`,
        retry: Boolean(error),
      };
    case 'unknown':
      return { tone: 'error', text: `${base}: the forecast date could not be read${refreshNote}`, retry: true };
    default:
      return { tone: 'info', text: `${base}: all ${summary.areas} areas issued${refreshNote}`, retry: Boolean(error) };
  }
}

/** What the station row in the drawer says. */
export function stationStatus(st) {
  if (!st.configured) return { tone: 'info', text: "Station fire danger isn't connected on this site yet." };
  if (!st.data) {
    if (st.error) return { tone: 'error', text: `Station fire danger unavailable: ${st.error.message}`, retry: true };
    return { tone: 'loading', text: 'Loading NFDRS stations…' };
  }
  const f = st.fems || {};
  const field = st.field ? `${STATION_FIELD_LABELS[st.field] ?? st.field} · ` : '';
  const observed = f.latestObservedDate ? `observed ${formatForecastDate(f.latestObservedDate)}` : 'no observed day';
  const counts = f.stations ? ` · ${f.stationsWithCurrentData} of ${f.stations} stations reporting` : '';
  const refresh = st.error ? " · couldn't refresh" : '';
  if (f.status === 'error') {
    return { tone: 'error', text: `${field}FEMS couldn't be reached on the last update; showing the run from ${f.lastSuccessAt ? new Date(f.lastSuccessAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'earlier'} (${observed})`, retry: true };
  }
  if (f.stale) return { tone: 'error', text: `${field}${observed}: FEMS data has stopped updating${refresh}`, retry: true };
  if (f.status === 'partial') return { tone: 'info', text: `${field}${observed}${counts} · some stations missing from the last update${refresh}`, retry: Boolean(st.error) };
  return { tone: 'info', text: `${field}${observed}${counts}${refresh}`, retry: Boolean(st.error) };
}

/** What the WFPI row in the drawer says. `configured`: the fire danger manifest (valid dates) is set up. */
export function wfpiStatus(wfpi, configured) {
  const { day, validDate, source, manifestError } = wfpi;
  const when = validDate ? ` · valid ${formatForecastDate(validDate)}` : '';
  const base = `Day ${day} of USGS's newest run${when}`;
  if (!configured) return { tone: 'info', text: `Day ${day} of USGS's newest run. Valid dates appear once the fire danger service is connected.` };
  if (manifestError) return { tone: 'error', text: `${base}: valid dates unavailable (${manifestError.message})`, retry: true };
  if (!source) return { tone: 'loading', text: 'Loading forecast dates…' };
  if (source.status === 'error') return { tone: 'error', text: `${base}: dates from the last successful check; USGS couldn't be reached since`, retry: true };
  if (source.stale) {
    return { tone: 'error', text: `${base}: USGS's newest run ends ${formatForecastDate(source.validDates?.at(-1))}, so this forecast has stopped updating` };
  }
  return { tone: 'info', text: base };
}

/** What the field-samples row in the drawer says. */
export function samplesStatus(samples) {
  const { data, error } = samples;
  if (!data) {
    if (error) return { tone: 'error', text: `Field samples unavailable: ${error.message}`, retry: true };
    return { tone: 'loading', text: 'Loading field samples…' };
  }
  const dates = data.features.map((f) => f.properties.latestDate).filter(Boolean).sort();
  const newest = dates.at(-1);
  const refresh = error ? " · couldn't refresh" : '';
  if (!data.features.length) return { tone: 'info', text: `No live fuel moisture samples in the last 60 days${refresh}`, retry: Boolean(error) };
  return {
    tone: 'info',
    text: `${data.features.length} sites sampled in the last 60 days · newest ${formatForecastDate(newest)}${refresh}`,
    retry: Boolean(error),
  };
}
