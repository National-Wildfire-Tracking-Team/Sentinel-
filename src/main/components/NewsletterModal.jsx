/**
 * NewsletterModal.jsx
 * Popup for a weekly newsletter issue, opened from the bar on the home page.
 * Rendered into document.body over a blurred scrim so the page stays visible
 * but out of focus behind it.
 *
 * Closes on the X button, Escape, or a click on the scrim. Focus moves to the
 * X on open and back to whatever opened it on close.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function NewsletterModal({ open, title, onClose, children }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-modal-title"
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-sentinel-600 bg-sentinel-900 shadow-2xl p-6 sm:p-8 animate-slide-up-panel motion-reduce:animate-none"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 rounded-full text-sentinel-300 hover:text-white hover:bg-sentinel-700 active:scale-95 transition"
        >
          <X size={20} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-fire-400">
          Weekly Newsletter
        </p>
        <h2
          id="newsletter-modal-title"
          className="mt-1 pr-10 text-2xl sm:text-3xl font-bold text-white tracking-tight"
        >
          {title}
        </h2>
        <div className="mt-4 text-sentinel-200 leading-relaxed space-y-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
