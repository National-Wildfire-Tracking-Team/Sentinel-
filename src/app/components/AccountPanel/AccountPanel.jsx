/**
 * AccountPanel.jsx
 * Account center popover — sign in/out, zip codes, account settings.
 * Opened from the top-left corner button column (replaces the old
 * top-right Header avatar/dropdown).
 */

import { useEffect, useRef, useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../../shared/context/AuthContext';
import { LogOut, MapPin, Settings, User, X } from 'lucide-react';
import LoginModal from '../Auth/LoginModal';
import MapAddressSearchPanel from '../Auth/MapAddressSearchPanel';

const AccountPanel = memo(function AccountPanel() {
  const { accountPanelOpen, toggleAccountPanel } = useApp();
  const { isAuthenticated, user, signOut } = useAuth();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAddressSetup, setShowAddressSetup] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!accountPanelOpen) return;
    const handler = (e) => {
      if (e.target.closest('[data-account-trigger]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        toggleAccountPanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accountPanelOpen, toggleAccountPanel]);

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    setShowAddressSetup(true);
  };

  const handleAddressSetupReturn = () => {
    setShowAddressSetup(false);
  };

  if (!accountPanelOpen) return null;

  return (
    <>
      <div
        ref={panelRef}
        className="absolute top-4 left-20 z-50 w-52 rounded-xl border border-sentinel-600 bg-sentinel-800 shadow-2xl overflow-hidden animate-fade-in"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-sentinel-700">
          <span className="text-xs font-semibold text-white">Account</span>
          <button
            onClick={toggleAccountPanel}
            className="p-0.5 text-sentinel-300 hover:text-white rounded transition-colors"
            aria-label="Close account panel"
          >
            <X size={14} />
          </button>
        </div>

        {isAuthenticated ? (
          <>
            <div className="px-3 py-2.5 border-b border-sentinel-700">
              <p className="text-xs font-medium text-white truncate">{user?.email}</p>
              <p className="text-[10px] text-sentinel-400 mt-0.5">Signed in</p>
            </div>
            <div className="py-1">
              <Link
                to="/manage-zipcodes"
                onClick={toggleAccountPanel}
                className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
              >
                <MapPin size={13} />
                Manage My Zip Codes
              </Link>
              <Link
                to="/account"
                onClick={toggleAccountPanel}
                className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
              >
                <Settings size={13} />
                Account Settings
              </Link>
              <button
                onClick={() => { toggleAccountPanel(); signOut(); }}
                className="w-full text-left px-3 py-2 text-sm text-sentinel-200 hover:bg-sentinel-700 hover:text-white transition-colors flex items-center gap-2"
              >
                <LogOut size={13} />
                Sign Out
              </button>
            </div>
          </>
        ) : (
          <div className="p-2">
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-fire-600 hover:bg-fire-500 text-white transition-colors"
            >
              <User size={13} />
              <span>Sign In</span>
            </button>
          </div>
        )}
      </div>

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {showAddressSetup && (
        <MapAddressSearchPanel
          onClose={handleAddressSetupReturn}
        />
      )}
    </>
  );
});

export default AccountPanel;
