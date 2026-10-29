/**
 * kanariApi.mjs
 * The one Kanari request both functions make: every fire cluster of the last
 * 24 h, worldwide (https://kanari.io/en/api). kanari-fires calls it at most
 * once per CDN refresh; kanari-history once a day.
 */

export const KANARI_EVENTS_URL = 'https://kanari.io/api/events?hours=24&full=1';

/** @returns {Promise<{ events: Array, meta?: object }>} */
export async function fetchKanariEvents(fetchImpl = fetch) {
  const resp = await fetchImpl(KANARI_EVENTS_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SentinelWildfireTracker/1.0 (+https://app.nationalwildfiretrackingteam.org)',
    },
  });
  if (!resp.ok) throw new Error(`kanari.io HTTP ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data?.events)) throw new Error('kanari.io: unexpected response');
  return data;
}

/** True for a cluster with a usable [lon, lat] centroid. */
export const hasCentroid = (e) =>
  Array.isArray(e?.centroid) && Number.isFinite(e.centroid[0]) && Number.isFinite(e.centroid[1]);
