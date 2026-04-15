import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchFireboxSnapshot } from '../api/firebox';

function resolveCoordinates(entity) {
  if (!entity) return null;
  const lat = Number(entity.lat ?? entity.latitude);
  const lng = Number(entity.lng ?? entity.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function useFireboxData(selectedFire) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const coords = useMemo(() => resolveCoordinates(selectedFire), [selectedFire]);

  const load = useCallback(async () => {
    if (!coords) {
      setData(null);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const snapshot = await fetchFireboxSnapshot(coords.lat, coords.lng, { minConfidence: 'nominal' });
      setData(snapshot);
    } catch (err) {
      setError(err.message || 'Unable to load Firebox data.');
    } finally {
      setLoading(false);
    }
  }, [coords]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, hasCoords: Boolean(coords), refresh: load };
}

