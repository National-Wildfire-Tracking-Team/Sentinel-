/**
 * weatherModelsLink.js
 * Links into the live map's Models tab: ?tab=models&lat=&lon=&place=&model=,
 * and for HAFS (model=hafs) the storm's ATCF id (&storm=AL092026). Used by the Models tab (to mirror its state into the URL), by incidents,
 * and by the /weather-models redirect.
 */

import { MODEL_MODES } from '../hooks/useWeatherModels';

export const URL_KEYS = ['tab', 'lat', 'lon', 'place', 'model', 'var', 'view', 'storm'];
/** Modes a link can open: the point-forecast models, plus HAFS (map fields only). */
export const LINK_MODES = [...MODEL_MODES, 'hafs'];
const VARIABLE_ID = /^[a-zA-Z0-9]{1,40}$/;
const STORM_ID = /^[A-Z]{2}\d{6}$/;

/** The Models tab's state from a URL query, or null if it isn't a Models link. */
export function parseModelsQuery(search) {
  const p = new URLSearchParams(search);
  if (p.get('tab') !== 'models') return null;
  const lat = Number.parseFloat(p.get('lat'));
  const lon = Number.parseFloat(p.get('lon'));
  const valid = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return {
    location: valid ? { lat, lon, place: p.get('place') || null } : null,
    mode: LINK_MODES.includes(p.get('model')) ? p.get('model') : 'hrrr',
    // Checked against the field manifest once it loads; unknown ids fall back.
    variable: VARIABLE_ID.test(p.get('var') || '') ? p.get('var') : null,
    view: p.get('view') === 'difference' ? 'difference' : 'swipe',
    storm: STORM_ID.test((p.get('storm') || '').toUpperCase()) ? p.get('storm').toUpperCase() : null,
  };
}

/** `/?tab=models&…` — what other pages link to, and what the tab mirrors into the URL. */
export function modelsHref({ lat, lon, place, model, variable, view, storm } = {}) {
  const p = new URLSearchParams({ tab: 'models' });
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    p.set('lat', lat.toFixed(4));
    p.set('lon', lon.toFixed(4));
  }
  if (place) p.set('place', place);
  if (model && model !== 'hrrr') p.set('model', model);
  if (variable && variable !== 'temperature') p.set('var', variable);
  if (model === 'compare' && view === 'difference') p.set('view', 'difference');
  if (model === 'hafs' && storm) p.set('storm', storm);
  return `/?${p}`;
}
