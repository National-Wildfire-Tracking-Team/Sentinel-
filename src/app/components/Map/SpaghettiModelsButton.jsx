/**
 * SpaghettiModelsButton.jsx
 * "Show Spaghetti Models" split button: the main part shows or hides one
 * system's model tracks on the map (all models), the chevron picks a model
 * group. The tracks themselves are drawn by MapView from the shared
 * `nhcModelTracks` state, so this works from the map popup and the detail
 * panel alike.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MODEL_GROUPS } from '../../api/nhcModelTracks';
import { useNhcModelTracks } from '../../hooks/useNhcModelTracks';
import { CARD_BG } from './MapFeaturePopup';

const BUTTON = 'min-h-[44px] rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-white transition-colors';

/**
 * @param {string|null} atcfId     the system's ATCF id; null while unknown or when there's none
 * @param {boolean}     [finding]  still looking the id up (invests)
 * @param {string}      [menuClassName]  background for the group menu; defaults to the map popup's card color
 */
export default function SpaghettiModelsButton({ atcfId, finding = false, menuClassName = null }) {
  const { nhcModelTracks, setNhcModelTracks } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const showing = Boolean(atcfId) && nhcModelTracks?.atcfId === atcfId;
  const { status } = useNhcModelTracks(showing ? atcfId : null);

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

  return (
    <div ref={menuRef}>
      <div className={`flex overflow-hidden ${BUTTON}`}>
        <button
          type="button"
          onClick={() => setNhcModelTracks(showing ? null : { atcfId, group: 'all' })}
          className="flex-1 min-h-[44px] px-3 hover:bg-white/5"
        >
          {label}
        </button>
        <span className="w-px bg-white/10" aria-hidden />
        <button
          type="button"
          aria-label="Choose model group"
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
        <ul
          role="menu"
          className={`mt-1 overflow-hidden rounded-lg border border-white/10 py-1 ${menuClassName ?? ''}`}
          style={menuClassName ? undefined : { background: CARD_BG }}
        >
          {MODEL_GROUPS.map((g) => {
            const active = showing && nhcModelTracks.group === g.key;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => { setMenuOpen(false); setNhcModelTracks({ atcfId, group: g.key }); }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm text-white hover:bg-white/5"
                >
                  <span className="w-4">{active && <Check size={14} aria-hidden />}</span>
                  {g.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
