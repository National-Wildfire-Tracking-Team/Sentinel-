/**
 * FutureFeaturesPanel.jsx
 * App menu slide-in panel — opened from the top-left hamburger corner button.
 * Map style, Help, membership/donation links, saved places, and appearance.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import {
  Map as MapIcon, HelpCircle, Award, HeartHandshake, MapPin, Satellite,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { usePreferences } from '../../context/PreferencesContext';
import { getMainOrigin } from '../../../shared/utils/getAppOrigin';

const DONATE_URL = 'https://givebutter.com/national-wildfire-tracking-team-dvi6jx';

function MenuRow({ icon: Icon, iconClassName, label, sublabel, onClick, href, sameTab, to, trailing }) {
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
    return sameTab ? (
      <a href={href} className={className} onClick={onClick}>
        {content}
      </a>
    ) : (
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

/** One labeled preference row, with an optional helper line underneath the control. */
function PrefRow({ label, description, children }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-sentinel-800 dark:text-sentinel-100">{label}</span>
        {children}
      </div>
      {description && (
        <p className="mt-1.5 text-xs text-sentinel-500 dark:text-sentinel-400">{description}</p>
      )}
    </div>
  );
}

/** Two-or-more-way pill switcher, e.g. Center/Mouse or 12-hour/24-hour. */
function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg bg-sentinel-100 dark:bg-sentinel-800 p-0.5 shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
            value === opt.value
              ? 'bg-fire-600 text-white shadow-sm'
              : 'text-sentinel-500 dark:text-sentinel-400 hover:text-sentinel-800 dark:hover:text-sentinel-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** iOS-style on/off switch. */
function PrefSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
        checked ? 'bg-fire-600' : 'bg-sentinel-300 dark:bg-sentinel-700'
      }`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/** 0-100 opacity slider with a live percentage readout. */
function PrefSlider({ value, onChange, disabled }) {
  return (
    <div className={`flex items-center gap-2 transition-opacity ${disabled ? 'opacity-40' : ''}`}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 accent-fire-600"
      />
      <span className="w-9 text-right text-xs tabular-nums text-sentinel-500 dark:text-sentinel-400">{value}%</span>
    </div>
  );
}

const FutureFeaturesPanel = memo(function FutureFeaturesPanel({ mapType = 'satellite', onMapTypeChange }) {
  const { futurePanelOpen, toggleFuturePanel } = useApp();
  const { theme, setTheme } = useTheme();
  const { prefs, updatePrefs } = usePreferences();

  const closePanel = () => {
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
        <MenuRow icon={HelpCircle} label="Help" href={`${getMainOrigin()}/about`} sameTab onClick={closePanel} />

        <SectionLabel>Support Our Mission</SectionLabel>
        <MenuRow
          icon={Award}
          iconClassName="text-fire-500"
          label="Membership"
          href={`${getMainOrigin()}/pricing`}
          sameTab
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

        <SectionLabel>Preferences</SectionLabel>

        <PrefRow label="Dark Mode">
          <SegmentedControl
            value={theme === 'dark' ? 'on' : 'off'}
            onChange={(v) => setTheme(v === 'on' ? 'dark' : 'light')}
            options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
          />
        </PrefRow>

        <PrefRow label="Data Picker">
          <SegmentedControl
            value={prefs.dataPickerAnchor}
            onChange={(v) => updatePrefs({ dataPickerAnchor: v })}
            options={[{ value: 'center', label: 'Center' }, { value: 'mouse', label: 'Mouse' }]}
          />
        </PrefRow>

        <PrefRow label="Time Format">
          <SegmentedControl
            value={prefs.timeFormat}
            onChange={(v) => updatePrefs({ timeFormat: v })}
            options={[{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]}
          />
        </PrefRow>

        <PrefRow
          label="Map Popup UI"
          description="'Single' shows one item at a time in map popups — swipe, drag or use the dots to flick between items."
        >
          <SegmentedControl
            value={prefs.mapPopupMode}
            onChange={(v) => updatePrefs({ mapPopupMode: v })}
            options={[{ value: 'list', label: 'List' }, { value: 'single', label: 'Single' }]}
          />
        </PrefRow>

        <PrefRow label="Popup Spotlight">
          <PrefSwitch checked={prefs.popupSpotlight} onChange={(v) => updatePrefs({ popupSpotlight: v })} />
        </PrefRow>

        <PrefRow
          label="Spotlight Opacity"
          description="Dims the map outside a clicked polygon to make it stand out."
        >
          <PrefSlider
            value={prefs.spotlightOpacity}
            onChange={(v) => updatePrefs({ spotlightOpacity: v })}
            disabled={!prefs.popupSpotlight}
          />
        </PrefRow>

        <PrefRow
          label="Popup Drag Handle"
          description="Adds a grip to map popups so you can drag them aside and see the map underneath."
        >
          <PrefSwitch checked={prefs.popupDragHandle} onChange={(v) => updatePrefs({ popupDragHandle: v })} />
        </PrefRow>
      </div>
    </aside>
  );
});

export default FutureFeaturesPanel;
