/**
 * AddressAutocomplete.jsx
 * Accessible address combobox (WAI-ARIA 1.2 list autocomplete) for the
 * Navigation panel. Type three or more characters and US address suggestions
 * appear under the field; pick one with the pointer or ArrowUp/ArrowDown + Enter.
 * Enter with nothing highlighted hands the raw text to onSubmitText.
 *
 * Suggestions come from Mapbox only (suggestAddresses) and never touch ORS or
 * the routing service. Requests are debounced, the in-flight one is aborted on
 * each keystroke, and late results from an older query are dropped.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { suggestAddresses } from '../../utils/geocode';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;
const MAX_ITEMS = 5;

/** "1 Main St, Sacramento, CA 95814" → ["1 Main St", "Sacramento, CA 95814"] */
function splitLabel(label) {
  const i = label.indexOf(',');
  return i === -1 ? [label, ''] : [label.slice(0, i), label.slice(i + 1).trim()];
}

export default function AddressAutocomplete({
  onSelect,
  onSubmitText,
  proximity,
  placeholder = 'Search an address',
  ariaLabel = 'Address',
  suggest = suggestAddresses,
  inputClassName = '',
  disabled = false,
  hint: helpText = '',
}) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const helpId = `${baseId}-help`;
  const inputRef = useRef(null);
  const optionId = (i) => `${baseId}-opt-${i}`;

  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  // idle | loading | done
  const [phase, setPhase] = useState('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const reqRef = useRef(0);
  const cancelPending = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    reqRef.current += 1;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const close = () => { setOpen(false); setActive(-1); };

  // After a choice the field empties so the chosen address (shown by the
  // parent as the placeholder) reads as the value. A pointer/touch choice also
  // lets go of focus (dismissing the mobile keyboard); a keyboard choice keeps
  // focus so keyboard and switch users don't lose their place.
  const settle = ({ blur = false } = {}) => {
    setText('');
    setItems([]);
    setPhase('idle');
    close();
    if (blur) inputRef.current?.blur();
  };

  const handleChange = (e) => {
    if (disabled) return;
    const value = e.target.value;
    setText(value);
    setActive(-1);
    cancelPending();
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setItems([]);
      setPhase('idle');
      setOpen(false);
      return;
    }
    // Immediate feedback: the list opens on the keystroke, not after the debounce.
    setPhase('loading');
    setOpen(true);
    const req = reqRef.current;
    timerRef.current = setTimeout(() => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      Promise.resolve()
        .then(() => suggest(q, { signal: ctrl.signal, proximity }))
        .then((res) => {
          if (req !== reqRef.current || ctrl.signal.aborted) return;
          setItems(Array.isArray(res) ? res.slice(0, MAX_ITEMS) : []);
          setPhase('done');
        })
        .catch(() => {
          if (req !== reqRef.current || ctrl.signal.aborted) return;
          // A failed lookup just shows no list; plain Enter still works.
          setItems([]);
          setPhase('idle');
          setOpen(false);
        });
    }, DEBOUNCE_MS);
  };

  const choose = (item, { viaPointer = false } = {}) => {
    cancelPending();
    onSelect?.({ lat: item.lat, lng: item.lng, label: item.label });
    settle({ blur: viaPointer });
  };

  const showOptions = open && phase === 'done' && items.length > 0;

  const handleKeyDown = (e) => {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        if (!showOptions) return;
        e.preventDefault();
        setActive((i) => Math.min(i + 1, items.length - 1));
        break;
      case 'ArrowUp':
        if (!showOptions) return;
        e.preventDefault();
        setActive((i) => Math.max(i - 1, -1));
        break;
      case 'Enter': {
        e.preventDefault();
        if (showOptions && active >= 0 && items[active]) {
          choose(items[active]);
          return;
        }
        const q = text.trim();
        if (!q) return;
        cancelPending();
        onSubmitText?.(q);
        settle();
        break;
      }
      case 'Escape':
        // First Escape closes the list; a second clears the field.
        if (open) {
          e.preventDefault();
          close();
        } else if (text) {
          e.preventDefault();
          cancelPending();
          setText('');
          setItems([]);
          setPhase('idle');
        }
        break;
      default:
    }
  };

  // The listbox exists only while it has options; status rows sit beside it.
  const expanded = showOptions;
  let hint = '';
  if (open && phase === 'loading') hint = 'Searching…';
  else if (open && phase === 'done' && items.length === 0) hint = 'No matches';
  let announcement = '';
  if (open && phase === 'done') {
    announcement = items.length ? `${items.length} suggestion${items.length === 1 ? '' : 's'}` : 'No matches';
  }
  const surface = 'route-safety-suggestions mt-1 rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-lg shadow-black/40 overflow-hidden';

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={showOptions && active >= 0 ? optionId(active) : undefined}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={helpText ? helpId : undefined}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={close}
        onFocus={() => { if (text.trim().length >= MIN_CHARS && phase !== 'idle') setOpen(true); }}
        className={`w-full min-h-[40px] px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white
                   placeholder:text-sentinel-400 focus:outline-none focus:border-green-500/60
                   disabled:opacity-70 disabled:cursor-not-allowed ${inputClassName}`}
      />
      {helpText && <p id={helpId} className="mt-1 text-[11px] text-sentinel-300">{helpText}</p>}
      {/* Polite count for screen readers; the visible hint row is aria-hidden to avoid a double read. */}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {hint && (
        <div data-testid="autocomplete-hint" aria-hidden="true"
          className={`${surface} flex items-center gap-2 min-h-[40px] px-3 text-xs text-sentinel-300`}>
          {phase === 'loading' && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />}
          {hint}
        </div>
      )}
      {expanded && (
        <ul id={listId} role="listbox" aria-label={`${ariaLabel} suggestions`} className={`${surface} py-1`}>
          {items.map((item, i) => {
            const [primary, secondary] = splitLabel(item.label);
            const selected = i === active;
            return (
              <li
                key={item.id}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                aria-label={item.label}
                // Keep focus in the input so blur doesn't close the list first;
                // commit on release, like a native tap.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item, { viaPointer: true })}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2 min-h-[44px] px-3 py-1.5 cursor-pointer select-none
                            active:bg-white/15 transition-colors duration-100 motion-reduce:transition-none
                            ${selected ? 'bg-white/10' : ''}`}
              >
                <MapPin size={13} className="shrink-0 text-green-400" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium tracking-[0.005em] text-white">{primary}</span>
                  {secondary && <span className="block truncate text-xs text-sentinel-300">{secondary}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
