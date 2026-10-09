/**
 * SpaghettiModelsButton.jsx
 * "Show Spaghetti Models" split button: the main part shows or hides one
 * system's model tracks on the map (the official forecast and every
 * operational model), the chevron opens the per-model checklist
 * (HurricaneModelPicker). The tracks themselves are drawn by MapView from
 * the shared `nhcModelTracks` state, so this works from the map popup and
 * the detail panel alike.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { defaultModelSelection } from '../../api/nhcModelTracks';
import { useNhcModelTracks } from '../../hooks/useNhcModelTracks';
import { CARD_BG } from './MapFeaturePopup';
import HurricaneModelPicker from './HurricaneModelPicker';

const BUTTON = 'min-h-[44px] rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-white transition-colors';

/**
 * @param {string|null} atcfId     the system's ATCF id; null while unknown or when there's none
 * @param {boolean}     [finding]  still looking the id up (invests)
 * @param {string}      [menuClassName]  background for the model menu; defaults to the map popup's card color
 */
export default function SpaghettiModelsButton({ atcfId, finding = false, menuClassName = null }) {
  const { nhcModelTracks, setNhcModelTracks } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const showing = Boolean(atcfId) && nhcModelTracks?.atcfId === atcfId;
  // The checklist shows each model's run time, so it loads the data too.
  const { status, data } = useNhcModelTracks(showing || menuOpen ? atcfId : null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  if (!atcfId) {
    return (
      <div className={`${BUTTON} flex items-center justify-center px-3 font-normal text-sentinel-200`} aria-live="polite">
        {finding ? 'Finding model runs…' : 'No model runs for this system yet'}
      </div>
    );
  }

  const label = !showing ? 'Show Spaghetti Models'
    : status === 'loading' ? 'Loading models…'
    : status === 'error' ? 'Models unavailable · Hide'
    : 'Hide Spaghetti Models';
  const selection = showing ? nhcModelTracks : defaultModelSelection();

  return (
    <div ref={menuRef}>
      <div className={`flex overflow-hidden ${BUTTON}`}>
        <button
          type="button"
          onClick={() => setNhcModelTracks(showing ? null : { atcfId, ...defaultModelSelection() })}
          className="flex-1 min-h-[44px] px-3 hover:bg-white/5"
        >
          {label}
        </button>
        <span className="w-px bg-white/10" aria-hidden />
        <button
          type="button"
          aria-label="Choose models"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="w-11 min-h-[44px] inline-flex items-center justify-center hover:bg-white/5"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {menuOpen && (
        // In the card's flow: map popups clip anything that floats outside them.
        <div
          role="menu"
          aria-label="Hurricane models"
          className={`mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-white/10 ${menuClassName ?? ''}`}
          style={menuClassName ? undefined : { background: CARD_BG }}
        >
          <HurricaneModelPicker
            data={data}
            status={status}
            selection={selection}
            // Picking models turns the tracks on for this storm.
            onChange={(next) => setNhcModelTracks({ atcfId, ...next })}
          />
        </div>
      )}
    </div>
  );
}
