/**
 * CookieConsent.jsx
 * The cookie banner: a glass card floating at the bottom of every page on
 * all three sites until the visitor makes a choice (see
 * utils/cookieConsent.js). Accept Cookies turns on both Saved Toggles and
 * Third Party Performance Tracking; Decline Non-Essential Cookies turns both
 * off. "Cookie Settings" in the footer opens CookieSettingsDialog, mounted
 * here too, to change either one later.
 *
 * It enters and leaves along the same path, up from and back down to the
 * bottom edge (styles in index.css, .cookie-consent). It isn't modal — the
 * page stays usable behind it — and it stays out of prerendered HTML.
 */

import { useEffect, useState } from 'react';
import { useCookieConsent } from '../../hooks/useCookieConsent';
import { ACCEPT_ALL, DECLINE_ALL, writeCookieConsent } from '../../utils/cookieConsent';
import { getMainOrigin } from '../../utils/getAppOrigin';
import CookieSettingsDialog from './CookieSettingsDialog';

// Matches the closed state's transition in index.css; the card unmounts
// once it has finished sliding away.
const EXIT_MS = 250;

export default function CookieConsent() {
  const consent = useCookieConsent();
  // scripts/prerender.mjs sets this so the banner isn't saved into the static pages.
  const open = !window.__NWTT_PRERENDER__ && consent === null;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const id = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <>
      {(mounted || open) && (
        <div className="cookie-consent-layer fixed inset-x-0 bottom-0 z-[260] flex justify-center px-4 pointer-events-none">
          <div
            role="dialog"
            aria-label="Cookie consent"
            aria-describedby="cookie-consent-text"
            data-state={open ? 'open' : 'closed'}
            {...(!open && { inert: '' })}
            className="cookie-consent pointer-events-auto relative w-full max-w-5xl rounded-2xl p-4 sm:p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6"
          >
            <p id="cookie-consent-text" className="min-w-0 lg:flex-1 text-sm leading-relaxed">
              We use cookies to improve your user experience and for third-party performance
              tracking. Please accept or decline non-essential cookies below, you may manage your
              preferences at any time by navigating to &ldquo;Cookie Settings&rdquo;.{' '}
              <a href={`${getMainOrigin()}/privacy-policy`} className="cookie-consent-link">
                Privacy Policy
              </a>
            </p>

            <div className="flex flex-col sm:flex-row gap-2 lg:shrink-0">
              <button
                type="button"
                onClick={() => writeCookieConsent(ACCEPT_ALL)}
                className="cookie-consent-btn cookie-consent-btn--primary sm:flex-1 lg:flex-none"
              >
                Accept Cookies
              </button>
              <button
                type="button"
                onClick={() => writeCookieConsent(DECLINE_ALL)}
                className="cookie-consent-btn cookie-consent-btn--secondary sm:flex-1 lg:flex-none"
              >
                Decline Non-Essential Cookies
              </button>
            </div>
          </div>
        </div>
      )}
      <CookieSettingsDialog />
    </>
  );
}
