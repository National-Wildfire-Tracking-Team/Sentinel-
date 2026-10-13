/**
 * useNhcStormText.js
 * One storm's NHC text products (TCP/TCD/TCM/PWS, parsed — see
 * api/nhcTextProducts.js) for the hurricane panel. Refetches when the storm
 * gets a new advisory.
 */

import { useEffect, useState } from 'react';
import { fetchNhcTextProducts } from '../api/nhcTextProducts';

const EMPTY = Object.freeze({ tcp: null, tcd: null, tcm: null, pws: null });

/** @returns {{ loaded: boolean, tcp: object|null, tcd: object|null, tcm: object|null, pws: object[]|null }} */
export function useNhcStormText({ slot, atcfId, advisoryNum } = {}) {
  const key = slot && atcfId ? `${slot}|${atcfId}|${advisoryNum ?? ''}` : null;
  const [state, setState] = useState({ key: null, data: EMPTY });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchNhcTextProducts({ slot, atcfId })
      .then((data) => { if (!cancelled) setState({ key, data }); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key covers slot/atcfId

  const current = state.key === key;
  return { loaded: current, ...(current ? state.data : EMPTY) };
}
