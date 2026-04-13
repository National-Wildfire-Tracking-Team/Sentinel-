/**
 * FireDetailPanel.jsx
 * Slide-in panel showing detailed info for a selected fire hotspot,
 * fire perimeter, or AQI station.
 */

import {
  X, Flame, MapPin, Users, Home, Calendar, Thermometer,
  AlertTriangle, Wind, ExternalLink, TrendingUp, ShieldAlert,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  formatAcres, formatContainment, formatFRP, formatDateTime,
  formatDate, formatPersonnel, formatRelativeTime,
} from '../../utils/formatUtils';
import { frpToLabel, containmentToColor, aqiToColor, getAQICategory } from '../../utils/colorUtils';
import { nwsAlertColor } from '../../utils/nwsColors';
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
          <span>{fire.lat?.toFixed(4)}°N, {Math.abs(fire.lng)?.toFixed(4)}°W</span>
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

function AlertDetail({ fire, alerts }) {
  // Look up the full alert record (with description, instruction, etc.)
  // from context — the map feature only carries a summarized set of props.
  const full = alerts?.find(a => a.id === fire.id) || {};

  const type = fire.name || full.type;
  const severity = fire.severity || full.severity;

  // Use the official NWS color for this alert type.
  const typeColor = nwsAlertColor(type);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: typeColor + '30' }}
        >
          <AlertTriangle size={18} style={{ color: typeColor }} />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">{type}</h3>
          <p className="text-sentinel-400 text-xs">{full.senderName || 'National Weather Service'}</p>
        </div>
      </div>

      {fire.headline && (
        <div
          className="mb-4 p-3 rounded-lg text-xs leading-relaxed"
          style={{ backgroundColor: typeColor + '20', border: `1px solid ${typeColor}40`, color: typeColor }}
        >
          {fire.headline}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        {severity && <StatBlock label="Severity" value={severity} color="text-white" />}
        {full.urgency && <StatBlock label="Urgency" value={full.urgency} />}
        {full.certainty && <StatBlock label="Certainty" value={full.certainty} />}
        {fire.expires && (
          <StatBlock label="Expires" value={formatRelativeTime(fire.expires)} icon={Calendar} />
        )}
      </div>

      {full.affectedArea && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-1.5">
            Affected Area
          </div>
          <div className="flex items-start gap-2 text-xs text-sentinel-300">
            <MapPin size={12} className="shrink-0 mt-0.5" />
            <span>{full.affectedArea}</span>
          </div>
        </div>
      )}

      {full.description && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-1.5">
            Description
          </div>
          <p className="text-xs text-sentinel-300 leading-relaxed whitespace-pre-line">
            {full.description}
          </p>
        </div>
      )}

      {full.instruction && (
        <div className="mb-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
          <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1.5">
            Instructions
          </div>
          <p className="text-xs text-red-200/90 leading-relaxed whitespace-pre-line">
            {full.instruction}
          </p>
        </div>
      )}
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
  const { selectedFire, clearSelected, alerts } = useApp();

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
                      bg-sentinel-900 border border-sentinel-700
                      rounded-2xl shadow-2xl overflow-hidden flex flex-col
                      animate-slide-in-right">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-700 shrink-0">
          <span className="text-xs font-bold text-sentinel-400 uppercase tracking-widest">
            {selectedFire.type === 'hotspot'  ? 'Hotspot Detail' :
             selectedFire.type === 'incident' ? 'Incident Detail' :
             selectedFire.type === 'aqi'      ? 'Air Quality' :
             selectedFire.type === 'alert'    ? 'Weather Alert' :
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
          {selectedFire.type === 'hotspot'  && <HotspotDetail  fire={selectedFire} />}
          {selectedFire.type === 'perimeter' && <PerimeterDetail fire={selectedFire} />}
          {selectedFire.type === 'incident' && <IncidentDetail  fire={selectedFire} />}
          {selectedFire.type === 'aqi'      && <AQIDetail       fire={selectedFire} />}
          {selectedFire.type === 'alert'    && <AlertDetail     fire={selectedFire} alerts={alerts} />}
        </div>
      </div>
    </>
  );
}
