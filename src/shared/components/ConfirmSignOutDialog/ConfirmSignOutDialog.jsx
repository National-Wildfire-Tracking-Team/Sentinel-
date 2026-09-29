/**
 * ConfirmSignOutDialog.jsx
 * "Sign out?" Yes/No confirmation shown before signing out, so a stray click
 * on a Sign Out button doesn't end the session. Rendered into document.body
 * so it isn't clipped by the small menus/popovers that open it.
 *
 * "No" gets focus by default — pressing Enter by accident keeps the user
 * signed in. Escape and clicking the backdrop also cancel.
 *
 * Usually used through the useConfirmSignOut hook rather than directly.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';

export default function ConfirmSignOutDialog({ open, busy, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      data-confirm-signout
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-signout-title"
        aria-describedby="confirm-signout-description"
        className="w-full max-w-sm rounded-2xl border border-sentinel-600 bg-sentinel-900 shadow-2xl p-6"
      >
        <div className="flex items-center gap-2 mb-2">
          <LogOut size={16} className="text-fire-400" />
          <h2 id="confirm-signout-title" className="text-base font-semibold text-white">
            Sign out?
          </h2>
        </div>
        <p id="confirm-signout-description" className="text-sm text-sentinel-300 mb-5">
          Are you sure you want to sign out? You&apos;ll need to sign in again to see your saved
          locations and alerts.
        </p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sentinel-700 hover:bg-sentinel-600 text-white transition-colors disabled:opacity-60"
          >
            No, stay signed in
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-60"
          >
            {busy ? 'Signing out…' : 'Yes, sign out'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
