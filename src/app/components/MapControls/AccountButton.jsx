/**
 * AccountButton.jsx
 * Top-right account button on the map — opens the AccountPanel popover.
 */

import { memo } from 'react';
import { CircleUserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../../shared/context/AuthContext';

const AccountButton = memo(function AccountButton() {
  const { accountPanelOpen, toggleAccountPanel } = useApp();
  const { isAuthenticated } = useAuth();

  return (
    <div data-account-trigger className="absolute top-4 right-4 z-50">
      <button
        type="button"
        onClick={toggleAccountPanel}
        aria-label="Open account menu"
        aria-pressed={accountPanelOpen}
        aria-haspopup="dialog"
        className={`relative flex items-center justify-center w-11 h-11 rounded-full border shadow-xl backdrop-blur-sm transition-colors ${
          accountPanelOpen
            ? 'bg-[#ffd6bf] dark:bg-[#47200b] border-fire-600/50 text-sentinel-900 dark:text-white' /* fire-600 at 25%, made solid so the map doesn't show through */
            : 'bg-white/90 dark:bg-sentinel-900/90 border-sentinel-200 dark:border-sentinel-600 text-sentinel-700 dark:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700'
        }`}
      >
        <CircleUserRound size={20} />
        {isAuthenticated && (
          <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-sentinel-900" />
        )}
      </button>
    </div>
  );
});

export default AccountButton;
