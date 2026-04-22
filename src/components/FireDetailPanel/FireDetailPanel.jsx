/**
 * FireDetailPanel.jsx
 * Slide-in panel showing detailed info for a selected fire hotspot,
 * fire perimeter, AQI station, or NOAA weather alert.
 */

import { memo, useState } from 'react';
import {
  X, Flame, MapPin, Users, Home, Calendar, Thermometer,
  AlertTriangle, Wind, ExternalLink, TrendingUp, ShieldAlert,
  CloudRain, Clock, Info, Share2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  formatAcres, formatContainment, formatFRP, formatDateTime,
  formatDate, formatPersonnel, formatRelativeTime,
} from '../../utils/formatUtils';
import { frpToLabel, containmentToColor, aqiToColor, getAQICategory } from '../../utils/colorUtils';
import { nwsAlertColor } from '../../utils/nwsColors';
import IncidentTimeline from '../IncidentTimeline/IncidentTimeline';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatConfidence(raw) {
  if (!raw) return 'Unknown';
  const s = String(raw).toLowerCase();
  if (s === 'h' || s === 'high') return 'High';
  if (s === 'l' || s === 'low')  return 'Low';
  if (s === 'n' || s === 'nominal') return 'Nominal';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

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
  const detections = fire.detection_count || 1;
  const isConsolidated = detections > 1;

  // Format source labels – may contain comma-separated values when consolidated
  const formatSourceLabel = (src) => {
    if (!src) return 'Unknown feed';
    return src.split(', ').map(s =>
      s === 'VIIRS_SNPP_NRT' ? 'VIIRS SNPP' :
      s === 'VIIRS_NOAA20_NRT' ? 'VIIRS NOAA-20' :
      s === 'MODIS_NRT' ? 'MODIS' : s
    ).join(', ');
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-orange-900/40 rounded-lg">
          <Flame size={18} className="text-orange-400" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">
            {isConsolidated ? 'Consolidated Hotspot' : 'Fire Hotspot Detection'}
          </h3>
          <p className="text-sentinel-400 text-xs">NASA FIRMS · {fire.satellite}</p>
          {isConsolidated && (
            <p className="text-sentinel-500 text-[11px] mt-0.5">
              {detections} detections merged · {formatSourceLabel(fire.source)}
            </p>
          )}
          {!isConsolidated && (
            <p className="text-sentinel-500 text-[11px] mt-0.5">Feed: {formatSourceLabel(fire.source)}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatBlock label="Peak FRP" value={formatFRP(fire.frp)} icon={Flame} color={frpColor} />
        <StatBlock label="Intensity" value={frpToLabel(fire.frp)} color={frpColor} />
        {isConsolidated && (
          <StatBlock label="Combined FRP" value={formatFRP(fire.total_frp)} icon={TrendingUp} color={frpColor} />
        )}
        <StatBlock label="Brightness" value={`${fire.brightness?.toFixed(1)} K`} icon={Thermometer} />
        <StatBlock label="Confidence" value={formatConfidence(fire.confidence)} />
        {isConsolidated && (
          <StatBlock label="Detections" value={detections} icon={Info} />
        )}
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
          {isConsolidated
            ? `This marker consolidates ${detections} overlapping satellite detections from ${formatSourceLabel(fire.source)}. Peak FRP shows the strongest single reading; Combined FRP sums all detections.`
            : 'Fire Radiative Power (FRP) measures the radiant heat output of a fire in megawatts. Higher FRP indicates more intense burning and larger smoke production.'
          }
        </p>
      </div>
    </>
  );
}

function PerimeterDetail({ fire }) {
  const containColor = containmentToColor(fire.contained || 0);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-red-900/40 rounded-lg">
          <ShieldAlert size={18} className="text-orange-400" />
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
        {fire.cause && fire.cause !== 'Under Investigation' && (
          <StatBlock label="Cause" value={fire.cause} icon={Flame} />
        )}
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
            <Clock size={12} className="shrink-0" />
            <span>Updated: {formatRelativeTime(fire.updated)}</span>
          </div>
        )}
        {fire.orgType && (
          <div className="flex items-center gap-2">
            <Users size={12} className="shrink-0" />
            <span>{fire.orgType} Incident Management</span>
          </div>
        )}
        {fire.cause && fire.cause === 'Under Investigation' && (
          <div className="flex items-center gap-2">
            <Info size={12} className="shrink-0" />
            <span>Cause: Under Investigation</span>
          </div>
        )}
      </div>

      {/* Live incident timeline */}
      <IncidentTimeline incidentId={fire.id || fire.name} />
    </>
  );
}

function IncidentDetail({ fire }) {
  const containment = Number(fire.contained) || 0;
  const containColor = containmentToColor(containment);
  const statusLabel = fire.status ? String(fire.status) : (containment >= 100 ? 'Controlled' : 'Active');
  const createdAt = fire.started || fire.createdAt;
  const evacuationOrderLines = Array.isArray(fire.evacuation_order_lines) ? fire.evacuation_order_lines : [];
  const locationLine = fire.location_description || `${fire.county || 'Unknown County'} County, ${fire.state || ''}`.trim();

  return (
    <>
      <div className="mb-4">
        <h3 className="font-bold text-white text-lg leading-tight">{fire.name}</h3>
        <p className="text-sentinel-300 text-xs mt-1 leading-relaxed">{locationLine}</p>
        <p className="text-sentinel-400 text-xs mt-0.5">{fire.county} County, {fire.state}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatBlock label="Acres" value={formatAcres(fire.acres)} icon={TrendingUp} color="text-orange-300" />
        <StatBlock label="Containment" value={formatContainment(containment)} icon={ShieldAlert} color="text-emerald-300" />
        <StatBlock label="Status" value={statusLabel} icon={Flame} color={statusLabel.toLowerCase() === 'active' ? 'text-red-300' : 'text-sentinel-200'} />
      </div>

      <div className="mb-4 p-3 bg-sentinel-800/50 rounded-lg border border-sentinel-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-sentinel-300">Containment</span>
          <span className="font-bold text-sm" style={{ color: containColor }}>
            {formatContainment(containment)}
          </span>
        </div>
        <div className="h-2 w-full bg-sentinel-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${containment}%`, backgroundColor: containColor }}
          />
        </div>
      </div>

      {fire.updated && (
        <p className="text-xs text-sentinel-400 mb-1">Updated {formatRelativeTime(fire.updated)}</p>
      )}
      <p className="text-[11px] text-sentinel-500 mb-4">
        Created by {fire.created_by || 'National Wildfire Tracking Team'}
        {createdAt ? ` • ${formatDateTime(createdAt)}` : ''}
      </p>

      {(fire.evacuation_orders > 0 || fire.evacuation_warnings > 0 || evacuationOrderLines.length > 0) && (
        <div className="mb-4 p-3 bg-red-950/40 border border-red-800/60 rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-200">
              <p className="font-semibold">
                {fire.evacuation_title || (
                  fire.evacuation_orders > 0
                    ? `Evacuation Order${fire.evacuation_orders > 1 ? 's' : ''} - Level 3 - Go`
                    : 'Evacuation Warning'
                )}
              </p>
              {fire.evacuation_summary && (
                <p className="text-red-200/80 mt-1">{fire.evacuation_summary}</p>
              )}
            </div>
          </div>
          {evacuationOrderLines.length > 0 && (
            <ul className="space-y-1 pl-5 list-disc text-xs text-red-100/95">
              {evacuationOrderLines.map((line, idx) => <li key={idx}>{line}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Live incident timeline */}
      <IncidentTimeline incidentId={fire.id} />

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

function UserReportDetail({ fire }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-cyan-900/40 rounded-lg">
          <Flame size={18} className="text-cyan-300" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base">{fire.title}</h3>
          <p className="text-sentinel-400 text-xs">Community-submitted report</p>
        </div>
      </div>

      {fire.description && (
        <div className="mb-4 p-3 bg-sentinel-800/60 border border-sentinel-700 rounded-lg">
          <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-1.5">
            Description
          </div>
          <p className="text-xs text-sentinel-200 leading-relaxed whitespace-pre-wrap">
            {fire.description}
          </p>
        </div>
      )}

      <div className="space-y-1.5 text-xs text-sentinel-400 mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={12} />
          <span>{fire.lat?.toFixed(4)}°, {fire.lng?.toFixed(4)}°</span>
        </div>
        {fire.created_at && (
          <div className="flex items-center gap-2">
            <Calendar size={12} />
            <span>Submitted: {formatDateTime(fire.created_at)}</span>
          </div>
        )}
        {fire.user_id && (
          <div className="flex items-center gap-2">
            <Users size={12} />
            <span>Reporter: {String(fire.user_id).slice(0, 8)}…</span>
          </div>
        )}
      </div>

      <div className="p-3 bg-cyan-950/30 border border-cyan-900/50 rounded-lg">
        <p className="text-xs text-cyan-200/80 leading-relaxed">
          This report was submitted by a community reporter and reviewed by
          NWTT moderators before appearing on the map. Verify with official
          sources before taking action.
        </p>
      </div>

      {/* Live incident timeline */}
      <IncidentTimeline incidentId={fire.id} />
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

const FireDetailPanel = memo(function FireDetailPanel() {
  const { selectedFire, clearSelected, alerts } = useApp();
  const [shareStatus, setShareStatus] = useState('');
  const isShareableFireType = ['hotspot', 'perimeter', 'incident', 'user-report'].includes(selectedFire?.type);

  const buildShareText = (fire) => {
    const title =
      fire.name ||
      fire.title ||
      (fire.type === 'hotspot' ? 'Fire hotspot' : 'Fire incident');
    const locationParts = [];
    if (fire.county) locationParts.push(`${fire.county} County`);
    if (fire.state) locationParts.push(fire.state);
    const hasCoords = Number.isFinite(fire.lat) && Number.isFinite(fire.lng);
    const coords = hasCoords ? `${fire.lat.toFixed(4)}, ${fire.lng.toFixed(4)}` : null;
    const location = locationParts.length > 0 ? locationParts.join(', ') : coords;
    return location ? `${title} (${location})` : title;
  };

  const handleShare = async () => {
    if (!selectedFire || !isShareableFireType) return;

    const shareText = buildShareText(selectedFire);
    const shareUrl = window.location.href;
    const payload = {
      title: 'Sentinel Fire Tracker',
      text: `Track this fire on Sentinel: ${shareText}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        setShareStatus('Shared');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${payload.text}\n${shareUrl}`);
        setShareStatus('Link copied');
      } else {
        setShareStatus('Sharing unavailable');
      }
    } catch {
      setShareStatus('Share canceled');
    }

    window.setTimeout(() => setShareStatus(''), 2500);
  };

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
             selectedFire.type === 'weather-alert' ? 'Weather Alert' :
             selectedFire.type === 'user-report' ? 'Community Report' :
             'Fire Detail'}
          </span>
          <div className="flex items-center gap-1">
            {shareStatus && (
              <span className="text-[10px] text-sentinel-400 pr-1">{shareStatus}</span>
            )}
            {isShareableFireType && (
              <button
                onClick={handleShare}
                className="p-1 text-sentinel-400 hover:text-white hover:bg-sentinel-700 rounded transition-colors"
                aria-label="Share fire details"
                title="Share fire"
              >
                <Share2 size={14} />
              </button>
            )}
            <button
              onClick={clearSelected}
              className="p-1 text-sentinel-400 hover:text-white hover:bg-sentinel-700 rounded transition-colors"
              aria-label="Close detail panel"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedFire.type === 'hotspot'  && <HotspotDetail  fire={selectedFire} />}
          {selectedFire.type === 'perimeter' && <PerimeterDetail fire={selectedFire} />}
          {selectedFire.type === 'incident' && <IncidentDetail  fire={selectedFire} />}
          {selectedFire.type === 'aqi'      && <AQIDetail       fire={selectedFire} />}
          {selectedFire.type === 'weather-alert' && <AlertDetail fire={selectedFire} alerts={alerts} />}
          {selectedFire.type === 'user-report' && <UserReportDetail fire={selectedFire} />}
        </div>
      </div>
    </>
  );
});
export default FireDetailPanel;
