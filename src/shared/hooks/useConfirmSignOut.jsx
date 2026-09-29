/**
 * useConfirmSignOut.jsx
 * Wraps sign-out in a Yes/No confirmation. Sign Out buttons call
 * `requestSignOut` instead of `signOut`, and render `signOutDialog`.
 *
 *   const { requestSignOut, signOutDialog } = useConfirmSignOut(() => navigate('/'));
 *
 * `afterSignOut` runs only once sign-out has actually completed.
 * `confirmOpen` lets popovers ignore clicks inside the dialog in their
 * outside-click handlers.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ConfirmSignOutDialog from '../components/ConfirmSignOutDialog/ConfirmSignOutDialog';

export function useConfirmSignOut(afterSignOut) {
  const { signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestSignOut = useCallback(() => setConfirmOpen(true), []);
  const cancel = useCallback(() => setConfirmOpen(false), []);

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      await signOut();
      afterSignOut?.();
    } catch (err) {
      console.warn('[Auth] Sign out failed:', err?.message);
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }, [signOut, afterSignOut]);

  const signOutDialog = (
    <ConfirmSignOutDialog open={confirmOpen} busy={busy} onConfirm={confirm} onCancel={cancel} />
  );

  return { requestSignOut, signOutDialog, confirmOpen };
}
