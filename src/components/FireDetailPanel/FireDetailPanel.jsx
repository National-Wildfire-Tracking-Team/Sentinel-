/**
 * FireDetailPanel.jsx
 * Slide-in panel showing detailed info for a selected fire hotspot,
 * fire perimeter, AQI station, or NOAA weather alert.
 */

import {
  X, Flame, MapPin, Users, Home, Calendar, Thermometer,
  AlertTriangle, Wind, ExternalLink, TrendingUp, ShieldAlert,
  CloudRain, Clock, Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  formatAcres, formatContainment, formatFRP, formatDateTime,
  formatDate, formatPersonnel, formatRelativeTime,
} from '../../utils/formatUtils';
import { frpToLabel, containmentToColor, aqiToColor, getAQICategory } from '../../utils/colorUtils';
import { MOCK_INCIDENTS } from '../../data/mockData';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBlock({ label, value, icon: Icon, color }) {
  return (
    <div className="flex flex-col gap-0.5 p-2.5 bg-sentinel-800/60 rounded-lg border border-sentinel-700">
      <div className="flex items-center gap-1.5 text-sentinel-400 text-[10px] font-bold uppercase tracking-wider">
        {Icon && <Icon size={11} />}
        {label}
      </div>
      <div className={`text-sm font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

function UpdateEntry({ update }) {
  return (
    <div className="border-l-2 border-sentinel-700 pl-3 py-0.5">
      <div className="text-[10px] text-sentinel-500 mb-0.5">{formatRelativeTime(update.time)}</div>
      <div className="text-xs text-sentinel-300 leading-relaxed">{update.text}</div>
    </div>
  );
}

// ─── Panel body variants ──────────────────────────────────────────────────────

function HotspotDetail({ fire }) {
  const frpColor = fire.frp >= 200 ? 'text-red-400' : fire.frp >= 100 ? 'text-orange-400' : 'text-yellow-400';

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-orange-900/40 rounded-lg">
          <Flame size={18} className="text-orange-400" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">Fire Hotspot Detection</h3>
          <p className="text-sentinel-400 text-xs">NASA FIRMS · {fire.satellite}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatBlock label="FRP" value={formatFRP(fire.frp)} icon={Flame} color={frpColor} />
        <StatBlock label="Intensity" value={frpToLabel(fire.frp)} color={frpColor} />
        <StatBlock label="Brightness" value={`${fire.brightness?.toFixed(1)} K`} icon={Thermometer} />
        <StatBlock label="Confidence" value={fire.confidence} />
      </div>

      <div className="space-y-2 text-xs text-sentinel-400">
        <div className="flex items-center gap-2">
          <MapPin size={12} />
          <span>{fire.lat?.toFixed(4)}°N, {Math.abs(fire.lng?.toFixed(4))}°W</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={12} />
          <span>Detected: {fire.acq_date} at {fire.acq_time?.slice(0, 2)}:{fire.acq_time?.slice(2)} UTC</span>
        </div>
        <div className="flex items-center gap-2">
          <Wind size={12} />
          <span>{fire.daynight === 'N' ? 'Nighttime' : 'Daytime'} detection</span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-orange-950/30 border border-orange-900/50 rounded-lg">
        <p className="text-xs text-orange-300/80 leading-relaxed">
          Fire Radiative Power (FRP) measures the radiant heat output of a fire in megawatts.
          Higher FRP indicates more intense burning and larger smoke production.
        </p>
      </div>
    </>
  );
}

function PerimeterDetail({ fire }) {
  const containColor = containmentToColor(fire.contained || 0);
  // Try to find matching incident for extra data
  const incident = MOCK_INCIDENTS.find(i =>
    i.name?.toLowerCase() === fire.name?.toLowerCase()
  );

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-red-900/40 rounded-lg">
          <ShieldAlert size={18} className="text-red-400" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">{fire.name}</h3>
          <p className="text-sentinel-400 text-xs">{fire.county} Co. · {fire.state?.replace('US-', '')}</p>
        </div>
      </div>

      {/* Containment progress */}
      <div className="mb-4 p-3 bg-sentinel-800/50 rounded-lg border border-sentinel-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-sentinel-300">Containment</span>
          <span className="font-bold text-sm" style={{ color: containColor }}>
            {formatContainment(fire.contained)}
          </span>
        </div>
        <div className="h-2 w-full bg-sentinel-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${fire.contained}%`, backgroundColor: containColor }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatBlock label="Acres"     value={formatAcres(fire.acres)}    icon={TrendingUp} color="text-orange-400" />
        <StatBlock label="Personnel" value={formatPersonnel(fire.personnel)} icon={Users} />
        {fire.destroyed > 0 && (
          <StatBlock label="Destroyed" value={fire.destroyed} icon={Home} color="text-red-400" />
        )}
        {fire.damaged > 0 && (
          <StatBlock label="Damaged" value={fire.damaged} icon={Home} color="text-orange-400" />
        )}
      </div>

      <div className="space-y-1.5 text-xs text-sentinel-400 mb-4">
        {fire.discovered && (
          <div className="flex items-center gap-2">
            <Calendar size={12} className="shrink-0" />
            <span>Discovered: {formatDate(fire.discovered)}</span>
          </div>
        )}
        {fire.updated && (
          <div className="flex items-center gap-2">
            <Calendar size={12} className="shrink-0" />
            <span>Updated: {formatRelativeTime(fire.updated)}</span>
          </div>
        )}
        {fire.orgType && (
          <div className="flex items-center gap-2">
            <Users size={12} className="shrink-0" />
            <span>{fire.orgType} Incident Management</span>
          </div>
        )}
      </div>

      {/* Latest updates from incident */}
      {incident?.updates?.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2">
            Latest Updates
          </div>
          <div className="space-y-2">
            {incident.updates.map((u, i) => <UpdateEntry key={i} update={u} />)}
          </div>
        </div>
      )}
    </>
  );
}

function IncidentDetail({ fire }) {
  const containColor = containmentToColor(fire.contained || 0);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-red-900/40 rounded-lg">
          <Flame size={18} className="text-red-400 animate-pulse-fire" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">{fire.name}</h3>
          <p className="text-sentinel-400 text-xs">{fire.county} Co. · {fire.state}</p>
        </div>
      </div>

      {/* Evacuation warning */}
      {fire.evacuation_orders > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-red-950/50 border border-red-800/60 rounded-lg mb-4">
          <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-red-300">
            <span className="font-bold">{fire.evacuation_orders} Evacuation Order{fire.evacuation_orders > 1 ? 's' : ''}</span>
            {fire.evacuation_warnings > 0 && ` · ${fire.evacuation_warnings} Warnings`}
          </div>
        </div>
      )}

      {/* Containment bar */}
      <div className="mb-4 p-3 bg-sentinel-800/50 rounded-lg border border-sentinel-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-sentinel-300">Containment</span>
          <span className="font-bold text-sm" style={{ color: containColor }}>
            {formatContainment(fire.contained)}
          </span>
        </div>
        <div className="h-2 w-full bg-sentinel-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${fire.contained}%`, backgroundColor: containColor }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatBlock label="Acres"     value={formatAcres(fire.acres)}    icon={TrendingUp} color="text-orange-400" />
        <StatBlock label="Personnel" value={formatPersonnel(fire.personnel)} icon={Users} />
        <StatBlock label="Structures Destroyed" value={fire.structures_destroyed || 0} icon={Home} color={fire.structures_destroyed > 0 ? 'text-red-400' : 'text-sentinel-400'} />
        <StatBlock label="Structures Threatened" value={fire.structures_threatened || 0} icon={Home} color={fire.structures_threatened > 0 ? 'text-orange-400' : 'text-sentinel-400'} />
      </div>

      {/* Resources */}
      {(fire.air_tankers || fire.helicopters || fire.dozers) && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2">
            Resources Assigned
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Air Tankers', value: fire.air_tankers },
              { label: 'Helicopters', value: fire.helicopters },
              { label: 'Dozers', value: fire.dozers },
              { label: 'Engines', value: fire.engines },
            ].filter(r => r.value > 0).map(r => (
              <div key={r.label} className="text-center p-1.5 bg-sentinel-800/60 rounded-lg border border-sentinel-700">
                <div className="text-white font-bold text-sm">{r.value}</div>
                <div className="text-sentinel-500 text-[9px] leading-tight">{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cause + dates */}
      <div className="space-y-1.5 text-xs text-sentinel-400 mb-4">
        <div className="flex gap-2"><Flame size={12} className="shrink-0 mt-0.5" /><span>Cause: {fire.cause}</span></div>
        {fire.started && <div className="flex gap-2"><Calendar size={12} className="shrink-0 mt-0.5" /><span>Started: {formatDate(fire.started)}</span></div>}
        {fire.updated && <div className="flex gap-2"><Calendar size={12} className="shrink-0 mt-0.5" /><span>Updated: {formatRelativeTime(fire.updated)}</span></div>}
      </div>

      {/* Updates */}
      {fire.updates?.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2">
            Latest Updates
          </div>
          <div className="space-y-2">
            {fire.updates.slice(0, 3).map((u, i) => <UpdateEntry key={i} update={u} />)}
          </div>
        </div>
      )}

      {/* InciWeb link */}
      {fire.url && (
        <a
          href={fire.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2 bg-fire-600/20
                     border border-fire-700/50 rounded-lg text-fire-400 text-sm font-medium
                     hover:bg-fire-600/30 hover:text-fire-300 transition-colors"
        >
          <ExternalLink size={13} />
          View on InciWeb
        </a>
      )}
    </>
  );
}

// ─── Weather Alert helpers ────────────────────────────────────────────────────

/** Parse NOAA description into labeled sections (WHAT, WHERE, WHEN, etc.) */
function parseAlertSections(description) {
  if (!description) return [];
  const sections = [];
  // Match "* TITLE...content" blocks
  const regex = /\*\s+([A-Z][A-Z /]+?)\.{3}([\s\S]*?)(?=\n\n\*\s+[A-Z]|\n\n[A-Z]{2,}|$)/g;
  let match;
  while ((match = regex.exec(description)) !== null) {
    const title = match[1].trim();
    const content = match[2].trim().replace(/\n[ \t]+/g, ' ').replace(/\n/g, ' ');
    if (title && content) sections.push({ title, content });
  }
  return sections;
}

/** Badge showing severity/urgency/certainty */
function AlertBadge({ label, value, colorClass }) {
  if (!value || value === 'Unknown') return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${colorClass}`}>
      {label}: {value}
    </span>
  );
}

function WeatherAlertDetail({ fire }) {
  const sections = parseAlertSections(fire.description);

  const severityColor =
    fire.severity === 'Extreme'  ? 'text-red-400 border-red-700 bg-red-950/40' :
    fire.severity === 'Severe'   ? 'text-orange-400 border-orange-700 bg-orange-950/40' :
    fire.severity === 'Moderate' ? 'text-yellow-400 border-yellow-700 bg-yellow-950/40' :
    'text-blue-400 border-blue-700 bg-blue-950/40';

  const headerBg =
    fire.severity === 'Extreme'  ? 'bg-red-900/40' :
    fire.severity === 'Severe'   ? 'bg-orange-900/40' :
    fire.severity === 'Moderate' ? 'bg-yellow-900/40' :
    'bg-blue-900/40';

  const iconColor =
    fire.severity === 'Extreme'  ? 'text-red-400' :
    fire.severity === 'Severe'   ? 'text-orange-400' :
    fire.severity === 'Moderate' ? 'text-yellow-400' :
    'text-blue-400';

  // VTEC line (e.g. "O.NEW.KMLB.FA.Y.0015.260409T1113Z-260409T1300Z")
  const vtec = fire.parameters?.VTEC?.[0] || null;

  // Zone codes (UGC)
  const zones = fire.geocode?.UGC || [];

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-2 mb-4">
        <div className={`p-2 rounded-lg shrink-0 ${headerBg}`}>
          <CloudRain size={18} className={iconColor} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-white text-base leading-tight">{fire.eventType || fire.type}</h3>
          <p className="text-sentinel-400 text-xs mt-0.5 leading-snug">{fire.senderName}</p>
        </div>
      </div>

      {/* Severity / Urgency / Certainty badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <AlertBadge label="Severity" value={fire.severity} colorClass={severityColor} />
        <AlertBadge
          label="Urgency" value={fire.urgency}
          colorClass="text-sentinel-300 border-sentinel-600 bg-sentinel-800/60"
        />
        <AlertBadge
          label="Certainty" value={fire.certainty}
          colorClass="text-sentinel-300 border-sentinel-600 bg-sentinel-800/60"
        />
      </div>

      {/* Headline */}
      {fire.headline && (
        <div className={`p-3 rounded-lg border mb-4 ${severityColor}`}>
          <p className="text-xs font-semibold leading-relaxed">{fire.headline}</p>
        </div>
      )}

      {/* Timing */}
      <div className="space-y-1.5 text-xs text-sentinel-400 mb-4">
        {fire.onset && (
          <div className="flex items-center gap-2">
            <Clock size={12} className="shrink-0" />
            <span>In effect: {formatDateTime(fire.onset)}</span>
          </div>
        )}
        {fire.expires && (
          <div className="flex items-center gap-2">
            <Clock size={12} className="shrink-0" />
            <span>Expires: {formatDateTime(fire.expires)}</span>
          </div>
        )}
        {fire.affectedArea && (
          <div className="flex items-start gap-2">
            <MapPin size={12} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{fire.affectedArea}</span>
          </div>
        )}
      </div>

      {/* VTEC + zone codes */}
      {(vtec || zones.length > 0) && (
        <div className="p-2.5 bg-sentinel-800/40 border border-sentinel-700 rounded-lg mb-4 space-y-1.5">
          {vtec && (
            <div className="text-[10px] font-mono text-sentinel-400 break-all leading-relaxed">
              <span className="text-sentinel-500 font-sans font-bold uppercase tracking-wider mr-1.5">VTEC</span>
              {vtec}
            </div>
          )}
          {zones.length > 0 && (
            <div className="text-[10px] text-sentinel-400">
              <span className="text-sentinel-500 font-bold uppercase tracking-wider mr-1.5">Zones</span>
              {zones.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Parsed description sections */}
      {sections.length > 0 ? (
        <div className="space-y-3 mb-4">
          {sections.map(({ title, content }) => (
            <div key={title} className="p-3 bg-sentinel-800/40 border border-sentinel-700 rounded-lg">
              <div className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-1.5">
                {title}
              </div>
              <p className="text-xs text-sentinel-200 leading-relaxed">{content}</p>
            </div>
          ))}
        </div>
      ) : fire.description ? (
        /* Fallback: show full description as-is */
        <div className="p-3 bg-sentinel-800/40 border border-sentinel-700 rounded-lg mb-4">
          <div className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-1.5">Details</div>
          <p className="text-xs text-sentinel-200 leading-relaxed whitespace-pre-wrap">{fire.description}</p>
        </div>
      ) : null}

      {/* Instructions / Preparedness Actions */}
      {fire.instruction && (
        <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg mb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Info size={11} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
              Preparedness Actions
            </span>
          </div>
          <p className="text-xs text-blue-200/80 leading-relaxed">{fire.instruction}</p>
        </div>
      )}

      {/* NWS safety link */}
      <a
        href="https://www.weather.gov/safety"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600/20
                   border border-blue-700/50 rounded-lg text-blue-400 text-sm font-medium
                   hover:bg-blue-600/30 hover:text-blue-300 transition-colors"
      >
        <ExternalLink size={13} />
        NWS Weather Safety
      </a>
    </>
  );
}

function AQIDetail({ fire }) {
  const cat = getAQICategory(fire.aqi);
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg" style={{ backgroundColor: cat.color + '30' }}>
          <Wind size={18} style={{ color: cat.color }} />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">{fire.name}</h3>
          <p className="text-sentinel-400 text-xs">Air Quality Monitoring Station</p>
        </div>
      </div>

      <div
        className="flex flex-col items-center justify-center p-5 rounded-xl mb-4"
        style={{ backgroundColor: cat.color + '20', border: `1px solid ${cat.color}40` }}
      >
        <div className="text-5xl font-black mb-1" style={{ color: cat.color }}>{fire.aqi}</div>
        <div className="text-sm font-semibold text-white">{cat.label}</div>
        <div className="text-xs text-sentinel-400 mt-0.5">Air Quality Index</div>
      </div>

      <StatBlock label="PM2.5 Concentration" value={`${fire.pm25} µg/m³`} icon={Wind} />

      <div className="mt-4 p-3 rounded-lg text-xs leading-relaxed" style={{ backgroundColor: cat.color + '15', borderColor: cat.color + '40', border: '1px solid' }}>
        <p style={{ color: cat.textColor === '#000000' ? cat.color : cat.color }}>
          {cat.label} air quality. {
            fire.aqi <= 50  ? 'Air quality is satisfactory.' :
            fire.aqi <= 100 ? 'Acceptable but possible concern for some sensitive groups.' :
            fire.aqi <= 150 ? 'Sensitive groups should limit outdoor exertion.' :
            fire.aqi <= 200 ? 'Everyone may experience health effects. Limit outdoor activity.' :
            fire.aqi <= 300 ? 'Health alert: everyone may experience serious health effects.' :
            'Health emergency. Avoid all outdoor physical activity.'
          }
        </p>
      </div>
    </>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function FireDetailPanel() {
  const { selectedFire, clearSelected } = useApp();

  if (!selectedFire) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] md:hidden"
        onClick={clearSelected}
      />

      {/* Panel */}
      <div className="absolute right-4 top-4 bottom-4 z-30 w-72 sm:w-80
                      bg-sentinel-900/97 backdrop-blur-sm border border-sentinel-700
                      rounded-2xl shadow-2xl overflow-hidden flex flex-col
                      animate-slide-in-right">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-700 shrink-0">
          <span className="text-xs font-bold text-sentinel-400 uppercase tracking-widest">
            {selectedFire.type === 'hotspot'       ? 'Hotspot Detail' :
             selectedFire.type === 'incident'      ? 'Incident Detail' :
             selectedFire.type === 'aqi'           ? 'Air Quality' :
             selectedFire.type === 'weather-alert' ? 'Weather Alert' :
             'Fire Detail'}
          </span>
          <button
            onClick={clearSelected}
            className="p-1 text-sentinel-400 hover:text-white hover:bg-sentinel-700 rounded transition-colors"
            aria-label="Close detail panel"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedFire.type === 'hotspot'        && <HotspotDetail      fire={selectedFire} />}
          {selectedFire.type === 'perimeter'      && <PerimeterDetail    fire={selectedFire} />}
          {selectedFire.type === 'incident'       && <IncidentDetail     fire={selectedFire} />}
          {selectedFire.type === 'aqi'            && <AQIDetail          fire={selectedFire} />}
          {selectedFire.type === 'weather-alert'  && <WeatherAlertDetail fire={selectedFire} />}
        </div>
      </div>
    </>
  );
}
