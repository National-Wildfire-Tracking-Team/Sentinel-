import { useEffect } from 'react';

/** Warm the HTTP cache for the frames the timeline will show next. */
export function usePreloadFrames(urls) {
  const key = urls.join('|');
  useEffect(() => {
    const controller = new AbortController();
    for (const url of urls) {
      // Same CORS mode as Mapbox's own image fetch, so it hits this cache entry.
      fetch(url, { mode: 'cors', credentials: 'same-origin', signal: controller.signal }).catch(() => {});
    }
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
