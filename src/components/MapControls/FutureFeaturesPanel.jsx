/**
 * FutureFeaturesPanel.jsx
 * App menu slide-in panel — opened from the top-left hamburger corner button.
 * Map style, Help, membership/donation links, saved places, and appearance.
 */

import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Map as MapIcon, HelpCircle, Award, HeartHandshake, MapPin,
  Moon, Sun, ChevronDown, Satellite,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';

const DONATE_URL = 'https://givebutter.com/national-wildfire-tracking-team-dvi6jx';

function MenuRow({ icon: Icon, iconClassName, label, sublabel, onClick, href, to, trailing }) {
  const className =
    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ' +
    'hover:bg-sentinel-100 dark:hover:bg-sentinel-800/60';

  const content = (
    <>
      <Icon size={22} className={iconClassName || 'text-sentinel-500 dark:text-sentinel-300'} strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sentinel-900 dark:text-white text-[15px]">{label}</div>
        {sublabel && (
          <div className="text-xs text-sentinel-500 dark:text-sentinel-400 mt-0.5">{sublabel}</div>
        )}
      </div>
      {trailing}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {content}
      </a>
    );
  }
  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="px-4 pt-4 pb-1 text-xs font-medium text-sentinel-500 dark:text-sentinel-500">
      {children}
    </div>
  );
}

const FutureFeaturesPanel = memo(function FutureFeaturesPanel({ mapType = 'satellite', onMapTypeChange }) {
  const { futurePanelOpen, toggleFuturePanel } = useApp();
  const { theme, setTheme } = useTheme();
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const closePanel = () => {
    setAppearanceOpen(false);
    toggleFuturePanel();
  };

  const isSatellite = mapType === 'satellite';

  return (
    <aside
      className={`
        absolute inset-y-0 left-0 z-40
        flex flex-col
        bg-white/95 dark:bg-sentinel-900/95 backdrop-blur-sm
        border-r border-sentinel-200 dark:border-sentinel-700
        transition-transform duration-300 ease-in-out
        w-full sm:w-80
        ${futurePanelOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="flex-1 overflow-y-auto py-2">
        <MenuRow
          icon={isSatellite ? Satellite : MapIcon}
          label="Map"
          sublabel={isSatellite ? 'Satellite view' : 'Street map view'}
          onClick={() => onMapTypeChange?.(isSatellite ? 'rendered' : 'satellite')}
        />
        <MenuRow icon={HelpCircle} label="Help" to="/about" onClick={closePanel} />

        <SectionLabel>Support Our Mission</SectionLabel>
        <MenuRow
          icon={Award}
          iconClassName="text-fire-500"
          label="Membership"
          to="/pricing"
          onClick={closePanel}
        />
        <MenuRow
          icon={HeartHandshake}
          iconClassName="text-pink-500"
          label="Donate"
          href={DONATE_URL}
          onClick={closePanel}
        />

        <SectionLabel>Settings</SectionLabel>
        <MenuRow
          icon={MapPin}
          label="Places"
          to="/manage-zipcodes"
          onClick={closePanel}
        />

        <MenuRow
          icon={theme === 'dark' ? Moon : Sun}
          label={theme === 'dark' ? 'Dark mode' : 'Light mode'}
          onClick={() => setAppearanceOpen((v) => !v)}
          trailing={
            <ChevronDown
              size={18}
              className={`text-sentinel-400 shrink-0 transition-transform ${appearanceOpen ? 'rotate-180' : ''}`}
            />
          }
        />
        {appearanceOpen && (
          <div className="px-4 pb-2 flex flex-col gap-1">
            {[
              { value: 'light', label: 'Light', Icon: Sun },
              { value: 'dark', label: 'Dark', Icon: Moon },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTheme(value); setAppearanceOpen(false); }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  theme === value
                    ? 'bg-fire-600/15 text-fire-600 dark:text-fire-400'
                    : 'text-sentinel-600 dark:text-sentinel-300 hover:bg-sentinel-100 dark:hover:bg-sentinel-800/60'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
});

export default FutureFeaturesPanel;
