/**
 * useNearbyOutlooks.js
 * Loads the current (Day 1) SPC and WPC outlook polygons for near-me mode,
 * independent of whether those map layers are toggled on, so "Go to My
 * Current Location" can report whether the user's radius sits in a risk area.
 *
 *   SPC: Day 1 categorical convective outlook
 *   WPC: Day 1 Excessive Rainfall Outlook + Winter Storm Severity Index
 *
 * Features are tagged with `properties.product` ('spc-categorical' |
 * 'wpc-ero' | 'wpc-wssi') so callers can label them. Requests share the
 * API modules' caches with the layer hooks, so turning a layer on while
 * near-me mode is active doesn't double-fetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpcOutlookLayer } from '../api/spcOutlooks';
import { fetchEroLayer } from '../api/wpcEro';
import { fetchWssiLayer } from '../api/wpcWssi';

const REFRESH_MS = 5 * 60 * 1000;

const tag = (fc, product) => (fc?.features || []).map((f) => ({
  ...f,
  properties: { ...f.properties, product },
}));

export function useNearbyOutlooks(enabled = false) {
  const [spcOutlooks, setSpcOutlooks] = useState([]);
  const [wpcOutlooks, setWpcOutlooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    // allSettled: one product being down shouldn't hide the others.
    const [spc, ero, wssi] = await Promise.allSettled([
      fetchSpcOutlookLayer('day1', 'categorical'),
      fetchEroLayer('day1'),
      fetchWssiLayer('day1'),
    ]);
    if (!mountedRef.current) return;
    setSpcOutlooks(spc.status === 'fulfilled' ? tag(spc.value, 'spc-categorical') : []);
    setWpcOutlooks([
      ...(ero.status === 'fulfilled' ? tag(ero.value, 'wpc-ero') : []),
      ...(wssi.status === 'fulfilled' ? tag(wssi.value, 'wpc-wssi') : []),
    ]);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setSpcOutlooks([]);
      setWpcOutlooks([]);
      return () => { mountedRef.current = false; };
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [enabled, load]);

  return { spcOutlooks, wpcOutlooks, loading };
}
