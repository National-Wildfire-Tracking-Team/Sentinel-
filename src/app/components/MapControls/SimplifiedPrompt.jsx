/**
 * SimplifiedPrompt.jsx
 * "Try Out Simplified Tracking" — offered once, the first time someone opens
 * the live map, over a lightly blurred map. Its button turns Simplified
 * Sentinel on; the X, Escape or a click outside closes it with the full map
 * kept. Either answer is remembered on this device, and the mode can be
 * changed later from the menu (FutureFeaturesPanel).
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { useSimplifiedMode } from '../../context/SimplifiedModeContext';

export default function SimplifiedPrompt() {
  const { promptSeen, dismissPrompt, setSimplified } = useSimplifiedMode();
  const turnOnRef = useRef(null);
  const open = !promptSeen;

  useEffect(() => {
    if (!open) return undefined;
    turnOnRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') dismissPrompt();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, dismissPrompt]);

  if (!open) return null;

  const turnOn = () => {
    setSimplified(true);
    dismissPrompt();
  };

  return createPortal(
    <div
      className="simplified-prompt-scrim fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in motion-reduce:animate-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismissPrompt();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="simplified-prompt-title"
        aria-describedby="simplified-prompt-description"
        className="relative w-full max-w-md rounded-2xl border border-sentinel-200 dark:border-sentinel-600 bg-white dark:bg-sentinel-900 shadow-2xl p-6 sm:p-7 animate-slide-up-panel motion-reduce:animate-none"
      >
        <button
          type="button"
          onClick={dismissPrompt}
          aria-label="Close"
          className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full text-sentinel-500 dark:text-sentinel-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700 active:scale-95 transition"
        >
          <X size={22} />
        </button>

        <h2
          id="simplified-prompt-title"
          className="pr-12 text-2xl font-bold leading-tight tracking-tight text-sentinel-900 dark:text-white"
        >
          Try Out Simplified Tracking
        </h2>
        <div id="simplified-prompt-description" className="mt-3 space-y-3 text-base leading-relaxed text-sentinel-600 dark:text-sentinel-200">
          <p>
            Simplified Sentinel shows just the essentials: active fires, evacuation zones,
            warnings, radar and lightning, with fewer buttons to sort through.
          </p>
          <p>
            You can turn it on or off any time from the{' '}
            <span className="whitespace-nowrap">
              menu
              <span className="mx-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-sentinel-200 dark:border-sentinel-600 align-middle text-sentinel-700 dark:text-white">
                <Menu size={15} aria-hidden />
              </span>
            </span>
            at the top left.
          </p>
        </div>

        <button
          ref={turnOnRef}
          type="button"
          onClick={turnOn}
          className="btn-glass-fire btn-glass-fire-adaptive mt-6 w-full rounded-xl px-4 py-3 text-base font-semibold"
        >
          Turn It On
        </button>
      </div>
    </div>,
    document.body
  );
}
