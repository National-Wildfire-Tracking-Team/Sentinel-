/**
 * useInvestModelRun.js
 * Which NHC invest (ATCF id, e.g. "AL922026") an outlook system's model
 * guidance is filed under — see findInvestModelRun. Only looks once asked
 * (`enabled`), since it reads NHC's file listing and the recent invest files.
 */

import { useEffect, useState } from 'react';
import { findInvestModelRun } from '../api/nhcModelTracks';

/** @returns {{ status: 'idle'|'searching'|'found'|'none', atcfId: string|null }} */
export function useInvestModelRun({ lat, lng } = {}, enabled = true) {
  const key = enabled && Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(2)},${lng.toFixed(2)}` : null;
  const [state, setState] = useState({ key: null, atcfId: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    findInvestModelRun({ lat, lng })
      .then((atcfId) => { if (!cancelled) setState({ key, atcfId }); })
      .catch(() => { if (!cancelled) setState({ key, atcfId: null }); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key covers lat/lng

  if (!key) return { status: 'idle', atcfId: null };
  if (state.key !== key) return { status: 'searching', atcfId: null };
  return { status: state.atcfId ? 'found' : 'none', atcfId: state.atcfId };
}
