/**
 * CookieSettingsDialog.jsx
 * The Cookie Settings popup, opened from "Cookie Settings" in the footer's
 * Quick Links (openCookieSettings). Two switches, each applied the moment
 * it's flipped:
 *   - Saved Toggles: the live map remembers each tab's layer toggles
 *     (LiveTrackerPage)
 *   - Third Party Performance Tracking: Google Analytics (DeferredAnalytics)
 *
 * The rows match the live map's layer toggles (LayerToggle in LayerControl;
 * styles in index.css, .cookie-toggle). Built like the site's other popups
 * (NewsletterModal): rendered into
 * document.body over a dimmed scrim; closes on Done, the X, Escape, or a
 * click on the scrim, and hands focus back to whatever opened it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useCookieConsent } from '../../hooks/useCookieConsent';
import { onCookieSettingsOpen, writeCookieConsent } from '../../utils/cookieConsent';
import { getMainOrigin } from '../../utils/getAppOrigin';

// Before the visitor has chosen anything, the switches show what's in effect:
// the live map remembers toggles, and GA hasn't loaded.
const BEFORE_ANY_CHOICE = { savedToggles: true, analytics: false };

function CookieToggle({ id, label, description, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      onClick={() => onChange(!checked)}
      className="cookie-toggle"
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block text-sm font-medium">
          {label}
        </span>
        <span id={`${id}-description`} className="cookie-consent-status block text-xs leading-snug">
          {description}
        </span>
      </span>
      <span className="cookie-switch" data-on={checked} aria-hidden="true">
        <span className="cookie-switch-thumb" />
      </span>
    </button>
  );
}

export default function CookieSettingsDialog() {
  const consent = useCookieConsent();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => onCookieSettingsOpen(() => {
    openerRef.current = document.activeElement;
    setOpen(true);
  }), []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  const current = consent ?? BEFORE_ANY_CHOICE;
  const set = (key) => (value) => writeCookieConsent({ ...current, [key]: value });

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-settings-title"
        className="cookie-consent relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-5 sm:p-6"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close cookie settings"
          className="cookie-consent-close absolute top-3 right-3 p-2 rounded-full active:scale-95 transition"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <h2 id="cookie-settings-title" className="pr-10 text-xl font-semibold leading-tight tracking-tight">
          Cookie Settings
        </h2>
        <p className="cookie-consent-status mt-1.5 text-sm leading-relaxed">
          Changes apply right away.{' '}
          <a href={`${getMainOrigin()}/privacy-policy`} className="cookie-consent-link">
            Privacy Policy
          </a>
        </p>

        <div className="mt-4 space-y-1">
          <CookieToggle
            id="cookie-saved-toggles"
            label="Saved Toggles"
            description="The live map remembers which layers you turned on in each tab."
            checked={current.savedToggles}
            onChange={set('savedToggles')}
          />
          <CookieToggle
            id="cookie-performance-tracking"
            label="Third Party Performance Tracking"
            description="Google Analytics measures which pages and features are used, so we can improve the site."
            checked={current.analytics}
            onChange={set('analytics')}
          />
        </div>

        <button
          type="button"
          onClick={close}
          className="cookie-consent-btn cookie-consent-btn--primary mt-5 w-full"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
