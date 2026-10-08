/**
 * useHafs.js
 * HAFS data for the Models tab: the catalog (runs and storms), and the
 * detail of the selected run (frame corners and field hours per forecast
 * hour). Both refresh every 5 minutes while HAFS is shown, so a new run and
 * the hours of a run still arriving appear without a reload. Nothing is
 * fetched while HAFS isn't shown.
 */

import { useEffect, useMemo, useState } from 'react';
import { HAFS_URL, fetchHafsCatalog, fetchHafsRun } from '../api/hafs';
import { resolveHafsSelection } from '../utils/hafsSelection';

const REFRESH_MS = 5 * 60 * 1000;

/** @param {{ active: boolean, choice: { storm?: string, model?: string, cycle?: string, domain?: string } }} args */
export function useHafs({ active, choice }) {
  const [catalogState, setCatalogState] = useState({ catalog: null, error: null });
  const [runState, setRunState] = useState({ key: null, detail: null, error: null });

  useEffect(() => {
    if (!active || !HAFS_URL) return undefined;
    let cancelled = false;
    const load = () => fetchHafsCatalog()
      .then((catalog) => { if (!cancelled) setCatalogState({ catalog, error: null }); })
      .catch((error) => { if (!cancelled) setCatalogState((s) => ({ catalog: s.catalog, error })); });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active]);

  const sel = useMemo(() => resolveHafsSelection(catalogState.catalog, choice), [catalogState.catalog, choice]);
  const runKey = sel ? `${sel.model}/${sel.cycle}/${sel.storm.id}` : null;
  const settled = sel?.run.status === 'complete';

  useEffect(() => {
    if (!active || !runKey) return undefined;
    let cancelled = false;
    const [model, cycle, storm] = runKey.split('/');
    const load = () => fetchHafsRun({ model, cycle, storm })
      .then((detail) => { if (!cancelled) setRunState({ key: runKey, detail, error: null }); })
      .catch((error) => {
        if (!cancelled) setRunState((s) => (s.key === runKey ? { ...s, error } : { key: runKey, detail: null, error }));
      });
    load();
    // A finished run never changes; one still arriving gains hours.
    const id = settled ? null : setInterval(load, REFRESH_MS);
    return () => { cancelled = true; if (id) clearInterval(id); };
  }, [active, runKey, settled]);

  const current = runState.key === runKey;
  return useMemo(() => ({
    configured: Boolean(HAFS_URL),
    catalog: catalogState.catalog,
    catalogError: catalogState.error,
    sel,
    detail: current ? runState.detail : null,
    detailError: current ? runState.error : null,
    loading: active && Boolean(HAFS_URL) && (!catalogState.catalog || (Boolean(sel) && !(current && (runState.detail || runState.error)))),
  }), [active, catalogState, sel, current, runState]);
}
