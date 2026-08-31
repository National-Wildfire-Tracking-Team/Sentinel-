/**
 * useWaterGaugeDetail.js
 * Fetches detailed info and stage/flow time-series for a selected gauge.
 */

import { useState, useEffect, useRef } from 'react';
import { fetchGaugeDetail, fetchGaugeStageFlow } from '../api/noaaWaterGauge';

export function useWaterGaugeDetail(lid) {
  const [detail, setDetail]   = useState(null);
  const [series, setSeries]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!lid) {
      setDetail(null);
      setSeries(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchGaugeDetail(lid), fetchGaugeStageFlow(lid)])
      .then(([d, s]) => {
        if (cancelled || !mountedRef.current) return;
        setDetail(d);
        setSeries(s);
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        console.warn(`[WaterGaugeDetail] Failed for ${lid}:`, err.message);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [lid]);

  return { detail, series, loading, error };
}
