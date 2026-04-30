/**
 * FireDetailPanel.jsx
 * Slide-in panel showing detailed info for a selected fire hotspot,
 * fire perimeter, AQI station, or NOAA weather alert.
 */

import { memo, useState } from 'react';
import {
  X, Flame, MapPin, Users, Home, Calendar, Thermometer,
  AlertTriangle, Wind, ExternalLink, TrendingUp, ShieldAlert,
  CloudRain, Clock, Info, Share2, ShieldCheck, Zap, Fuel,
  GraduationCap,
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
      <IncidentTimeline incidentId={fire.id || fire.name} dataSource="NIFC / IRWIN" />
    </>
  );
}

function IncidentDetail({ fire }) {
  const [tab, setTab] = useState('updates');
  const containment = Number(fire.contained) || 0;
  const containColor = containmentToColor(containment);
  const statusLabel = fire.status ? String(fire.status) : (containment >= 100 ? 'Controlled' : 'Active');
  const createdAt = fire.started || fire.createdAt;
  const evacuationOrderLines = Array.isArray(fire.evacuation_order_lines) ? fire.evacuation_order_lines : [];
  const locationLine = fire.location_description || `${fire.county || 'Unknown County'} County, ${fire.state || ''}`.trim();
  const isActive = statusLabel.toLowerCase() === 'active';

  return (
    <>
      {/* Title block */}
      <div className="mb-4">
        <h3 className="font-bold text-white text-lg leading-tight">{fire.name}</h3>
        <p className="text-sentinel-300 text-xs mt-1 leading-relaxed">{locationLine}</p>
        <p className="text-sentinel-400 text-[11px] mt-0.5">{fire.county} County, {fire.state}</p>
      </div>

      {/* Acres | Containment stat row */}
      <div className="flex items-stretch mb-4 bg-sentinel-800/50 border border-sentinel-700 rounded-xl overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center py-4 px-2">
          <span className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-1">Acres</span>
          <span className="text-2xl font-black text-white leading-none">
            {fire.acres != null ? Number(fire.acres).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}
          </span>
        </div>
        <div className="w-px bg-sentinel-700 my-3" />
        <div className="flex-1 flex flex-col items-center justify-center py-4 px-2">
          <span className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-1">Containment</span>
          <span className="text-2xl font-black leading-none" style={{ color: containColor }}>
            {formatContainment(containment)}
          </span>
        </div>
      </div>

      {/* Containment bar */}
      <div className="mb-4 h-1.5 w-full bg-sentinel-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${containment}%`, backgroundColor: containColor }}
        />
      </div>

      {/* Status + updated line */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`text-xs font-semibold ${isActive ? 'text-red-400' : 'text-emerald-400'}`}>
          {statusLabel}
        </span>
        {fire.updated && (
          <>
            <span className="text-sentinel-600 text-xs">•</span>
            <span className="text-xs text-sentinel-400">
              Updated <span className="font-semibold text-sentinel-300">{formatRelativeTime(fire.updated)}</span>
            </span>
          </>
        )}
      </div>
      <p className="text-[11px] text-sentinel-500 mb-4">
        Created by <span className="font-semibold text-sentinel-400">National Wildfire Tracking Team</span>
        {createdAt ? <> • {formatDateTime(createdAt)}</> : ''}
      </p>

      {/* Evacuation notice */}
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

      {/* UPDATES / INFO tabs */}
      <div className="border-b border-sentinel-700 mb-4 flex gap-0">
        {['updates', 'info'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-colors
              ${tab === t
                ? 'border-fire-500 text-white'
                : 'border-transparent text-sentinel-500 hover:text-sentinel-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'updates' && <IncidentTimeline incidentId={fire.id} dataSource="NIFC / IRWIN" />}

      {tab === 'info' && (
        <div className="space-y-2 text-xs text-sentinel-400">
          {fire.acres != null && (
            <div className="flex justify-between">
              <span>Size</span>
              <span className="text-white font-semibold">{formatAcres(fire.acres)}</span>
            </div>
          )}
          {fire.personnel && (
            <div className="flex justify-between">
              <span>Personnel</span>
              <span className="text-white font-semibold">{formatPersonnel(fire.personnel)}</span>
            </div>
          )}
          {fire.cause && (
            <div className="flex justify-between">
              <span>Cause</span>
              <span className="text-white font-semibold">{fire.cause}</span>
            </div>
          )}
          {fire.destroyed > 0 && (
            <div className="flex justify-between">
              <span>Structures Destroyed</span>
              <span className="text-red-400 font-semibold">{fire.destroyed}</span>
            </div>
          )}
          {fire.damaged > 0 && (
            <div className="flex justify-between">
              <span>Structures Damaged</span>
              <span className="text-orange-400 font-semibold">{fire.damaged}</span>
            </div>
          )}
          {fire.discovered && (
            <div className="flex justify-between">
              <span>Discovered</span>
              <span className="text-white font-semibold">{formatDate(fire.discovered)}</span>
            </div>
          )}
          {fire.orgType && (
            <div className="flex justify-between">
              <span>Management</span>
              <span className="text-white font-semibold">{fire.orgType}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Coordinates</span>
            <span className="text-white font-semibold">{fire.lat?.toFixed(4)}°, {fire.lng?.toFixed(4)}°</span>
          </div>
          {fire.url && (
            <a
              href={fire.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full mt-3 py-2 bg-fire-600/20
                         border border-fire-700/50 rounded-lg text-fire-400 text-sm font-medium
                         hover:bg-fire-600/30 hover:text-fire-300 transition-colors"
            >
              <ExternalLink size={13} />
              View on InciWeb
            </a>
          )}
        </div>
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

/**
 * Parse the latest acreage value from a reporter description block.
 * Looks for lines like "Acreage: 129.7" or "SIZE: 2450 acres" written
 * by the reporter update system.
 */
function parseLatestAcreage(description) {
  if (!description) return null;
  const lines = description.split('\n').reverse();
  for (const line of lines) {
    const m = line.match(/acreage[:\s]+([0-9,.]+)/i) || line.match(/size[:\s]+([0-9,.]+)\s*acres?/i);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(val)) return val;
    }
  }
  return null;
}

/**
 * Parse the latest containment percentage from a reporter description.
 * Looks for lines like "Containment: 20%" or "20% contained".
 */
function parseLatestContainment(description) {
  if (!description) return null;
  const lines = description.split('\n').reverse();
  for (const line of lines) {
    const m = line.match(/containment[:\s]+([0-9]+)\s*%/i) || line.match(/([0-9]+)\s*%\s*contained/i);
    if (m) {
      const val = parseInt(m[1], 10);
      if (Number.isFinite(val)) return Math.min(100, Math.max(0, val));
    }
  }
  return null;
}

/** Text after "INCIDENT NOTES:" in a community fire_reports description (initial submit). */
function extractIncidentNotesFromDescription(description) {
  if (!description || typeof description !== 'string') return '';
  const m = description.match(/\nINCIDENT NOTES:\n([\s\S]*)$/);
  if (!m) return '';
  let body = m[1].trim();
  const internalIdx = body.search(/\nINTERNAL NOTES:\n/);
  if (internalIdx >= 0) body = body.slice(0, internalIdx).trim();
  return body;
}

function UserReportDetail({ fire }) {
  const [tab, setTab] = useState('updates');

  const acres = parseLatestAcreage(fire.description);
  const containmentParsed = parseLatestContainment(fire.description);
  const hasContainment = containmentParsed !== null;
  const containment = containmentParsed ?? 0;
  const containColor = containmentToColor(containment);
  const incidentNotesPreview = extractIncidentNotesFromDescription(fire.description);

  // Extract a clean location from the structured description if present
  const locationMatch = fire.description?.match(/^ADDRESS:\s*(.+)$/m);
  const locationLine = locationMatch ? locationMatch[1].trim() : null;

  return (
    <>
      {/* Title block */}
      <div className="mb-4">
        <h3 className="font-bold text-white text-lg leading-tight">{fire.title}</h3>
        {locationLine && (
          <p className="text-sentinel-300 text-xs mt-1 leading-relaxed">{locationLine}</p>
        )}
        <p className="text-sentinel-400 text-[11px] mt-0.5">Community Report • NWTT</p>
      </div>

      {/* Acres | Containment stat row */}
      <div className="flex items-stretch mb-4 bg-sentinel-800/50 border border-sentinel-700 rounded-xl overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center py-4 px-2">
          <span className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-1">Acres</span>
          <span className="text-2xl font-black text-white leading-none">
            {acres != null ? acres.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}
          </span>
        </div>
        <div className="w-px bg-sentinel-700 my-3" />
        <div className="flex-1 flex flex-col items-center justify-center py-4 px-2">
          <span className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-1">Containment</span>
          <span className="text-2xl font-black leading-none" style={{ color: containColor }}>
            {hasContainment ? `${containment}%` : '—'}
          </span>
        </div>
      </div>

      {/* Containment bar when containment was reported (including 0%) */}
      {hasContainment && (
        <div className="mb-4 h-1.5 w-full bg-sentinel-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${containment}%`, backgroundColor: containColor }}
          />
        </div>
      )}

      {/* Status + submitted line */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-xs font-semibold text-red-400">Active</span>
        {fire.created_at && (
          <>
            <span className="text-sentinel-600 text-xs">•</span>
            <span className="text-xs text-sentinel-400">
              Updated <span className="font-semibold text-sentinel-300">{formatRelativeTime(fire.created_at)}</span>
            </span>
          </>
        )}
      </div>
      <p className="text-[11px] text-sentinel-500 mb-4">
        Submitted by <span className="font-semibold text-sentinel-400">NWTT Reporter</span>
        {fire.created_at ? <> • {formatDateTime(fire.created_at)}</> : ''}
      </p>

      {/* UPDATES / INFO tabs */}
      <div className="border-b border-sentinel-700 mb-4 flex gap-0">
        {['updates', 'info'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-colors
              ${tab === t
                ? 'border-fire-500 text-white'
                : 'border-transparent text-sentinel-500 hover:text-sentinel-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'updates' && (
        <IncidentTimeline
          incidentId={fire.id}
          dataSource="NWTT reporter"
          sourceVariant="community"
          legacyInitialSubmission={incidentNotesPreview}
          legacySubmittedAt={fire.created_at}
        />
      )}

      {tab === 'info' && (
        <div className="space-y-2 text-xs text-sentinel-400">
          {acres != null && (
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Acres (reporter)</span>
              <span className="text-white font-semibold text-right">
                {acres.toLocaleString('en-US', { maximumFractionDigits: 1 })}
              </span>
            </div>
          )}
          {hasContainment && (
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Containment (reporter)</span>
              <span className="text-white font-semibold">{containment}%</span>
            </div>
          )}
          {incidentNotesPreview && (
            <div>
              <p className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-1.5">
                Incident notes
              </p>
              <p className="text-sentinel-200 leading-relaxed whitespace-pre-wrap">{incidentNotesPreview}</p>
            </div>
          )}
          {locationLine && (
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Address</span>
              <span className="text-white font-semibold text-right">{locationLine}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Coordinates</span>
            <span className="text-white font-semibold">{fire.lat?.toFixed(4)}°, {fire.lng?.toFixed(4)}°</span>
          </div>
          {fire.created_at && (
            <div className="flex justify-between">
              <span>Submitted</span>
              <span className="text-white font-semibold">{formatDateTime(fire.created_at)}</span>
            </div>
          )}
          <div className="mt-4 p-3 bg-cyan-950/30 border border-cyan-900/50 rounded-lg">
            <p className="text-xs text-cyan-200/80 leading-relaxed">
              This report was submitted by a community reporter and approved by
              NWTT moderators. Verify with official sources before taking action.
            </p>
          </div>
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

// ─── Official Evacuation Zone Detail ─────────────────────────────────────────

function EvacZoneDetail({ fire }) {
  const isIpaws = fire.source === 'ipaws';

  if (isIpaws) {
    const color = '#f59e0b';
    return (
      <>
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="font-bold text-white text-lg leading-tight">
              {fire.ipawsHeadline || fire.zoneName || fire.name}
            </h3>
          </div>
          <div
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border"
            style={{ backgroundColor: color + '22', borderColor: color + '66', color }}
          >
            IPAWS / EAS
          </div>
          {fire.ipawsEvent && fire.ipawsEvent !== fire.ipawsHeadline && (
            <p className="text-sentinel-400 text-sm mt-2">{fire.ipawsEvent}</p>
          )}
        </div>

        {fire.ipawsAreaDesc && (
          <div className="mb-3 text-sm text-sentinel-200">
            <span className="text-sentinel-400 text-xs uppercase tracking-wider">Area</span>
            <p className="mt-0.5">{fire.ipawsAreaDesc}</p>
          </div>
        )}

        {fire.ipawsSent && (
          <div className="mb-2 text-xs text-sentinel-400">
            Effective / sent:{' '}
            <span className="text-sentinel-200">{new Date(fire.ipawsSent).toLocaleString()}</span>
          </div>
        )}

        {fire.ipawsExpires && (
          <div className="mb-3 text-xs text-sentinel-400">
            Expires: <span className="text-sentinel-200">{new Date(fire.ipawsExpires).toLocaleString()}</span>
          </div>
        )}

        {fire.ipawsSenderName && (
          <div className="mb-3 text-xs text-sentinel-400">
            Sender: <span className="text-sentinel-200">{fire.ipawsSenderName}</span>
          </div>
        )}

        {fire.ipawsDescription && (
          <div className="mt-2">
            <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-2">Description</p>
            <p className="text-sentinel-200 text-sm leading-relaxed whitespace-pre-wrap">{fire.ipawsDescription}</p>
          </div>
        )}

        {fire.ipawsInstruction && (
          <div className="mt-4">
            <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-2">Instruction</p>
            <p className="text-sentinel-200 text-sm leading-relaxed whitespace-pre-wrap">{fire.ipawsInstruction}</p>
          </div>
        )}

        {fire.ipawsIdentifier && (
          <p className="mt-4 text-[10px] text-sentinel-500 font-mono break-all">ID: {fire.ipawsIdentifier}</p>
        )}
      </>
    );
  }

  const WARNING_TYPE_COLOR = {
    'Evacuation Order':   '#ef4444',
    'Evacuation Warning': '#f97316',
    'Evacuation Watch':   '#eab308',
  };
  const color = WARNING_TYPE_COLOR[fire.warningType] || '#ef4444';

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <h3 className="font-bold text-white text-lg leading-tight">{fire.zoneName || fire.name}</h3>
        </div>
        {fire.warningType && (
          <div
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border"
            style={{ backgroundColor: color + '22', borderColor: color + '66', color }}
          >
            {fire.warningType}
          </div>
        )}
      </div>

      {(fire.county || fire.jurisdiction) && (
        <div className="mb-3 flex items-center gap-1.5 text-sentinel-300 text-sm">
          <span>{[fire.county && `${fire.county} County`, fire.jurisdiction].filter(Boolean).join(' • ')}</span>
        </div>
      )}

      {fire.agency && (
        <div className="mb-3 text-xs text-sentinel-400">
          Agency: <span className="text-sentinel-200">{fire.agency}</span>
        </div>
      )}

      {fire.effectiveDate && (
        <div className="mb-2 text-xs text-sentinel-400">
          Effective: <span className="text-sentinel-200">{new Date(fire.effectiveDate).toLocaleString()}</span>
        </div>
      )}

      {fire.expirationDate && (
        <div className="mb-3 text-xs text-sentinel-400">
          Expires: <span className="text-sentinel-200">{new Date(fire.expirationDate).toLocaleString()}</span>
        </div>
      )}

      {fire.instructions && (
        <div className="mt-4">
          <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-2">Instructions</p>
          <p className="text-sentinel-200 text-sm leading-relaxed whitespace-pre-wrap">{fire.instructions}</p>
        </div>
      )}

      {fire.comments && (
        <div className="mt-4">
          <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-2">Comments</p>
          <p className="text-sentinel-200 text-sm leading-relaxed whitespace-pre-wrap">{fire.comments}</p>
        </div>
      )}

      {fire.externalURL && (
        <a
          href={fire.externalURL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-1.5 text-xs text-fire-400 hover:text-fire-300 transition-colors"
        >
          <ExternalLink size={12} />
          More information
        </a>
      )}
    </>
  );
}

// ─── Reporter Evacuation Zone Detail ─────────────────────────────────────────

function ReporterEvacZoneDetail({ fire }) {
  const ZONE_TYPE_COLOR = {
    'Evacuation Order':   '#ef4444',
    'Evacuation Warning': '#f97316',
    'Evacuation Watch':   '#eab308',
  };
  const color = ZONE_TYPE_COLOR[fire.zone_type] || '#ef4444';

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <h3 className="font-bold text-white text-lg leading-tight">{fire.title || fire.name}</h3>
        </div>
        <div
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border"
          style={{ backgroundColor: color + '22', borderColor: color + '66', color }}
        >
          {fire.zone_type || 'Evacuation Zone'}
        </div>
        <p className="text-sentinel-400 text-[11px] mt-1.5 uppercase tracking-wider">
          Reporter-Drawn Zone
        </p>
      </div>

      {fire.incident_name && (
        <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
          <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-0.5">Linked Incident</p>
          <p className="text-white text-sm font-semibold">{fire.incident_name}</p>
        </div>
      )}

      {(fire.county || fire.state) && (
        <div className="mb-3 flex items-center gap-1.5 text-sentinel-300 text-sm">
          <span>{[fire.county && `${fire.county} County`, fire.state].filter(Boolean).join(', ')}</span>
        </div>
      )}

      {fire.effective_at && (
        <div className="mb-2 text-xs text-sentinel-400">
          Effective: <span className="text-sentinel-200">{new Date(fire.effective_at).toLocaleString()}</span>
        </div>
      )}

      {fire.expires_at && (
        <div className="mb-3 text-xs text-sentinel-400">
          Expires: <span className="text-sentinel-200">{new Date(fire.expires_at).toLocaleString()}</span>
        </div>
      )}

      {fire.description && (
        <div className="mt-4">
          <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-2">Details</p>
          <p className="text-sentinel-200 text-sm leading-relaxed whitespace-pre-wrap">{fire.description}</p>
        </div>
      )}
    </>
  );
}

function TransmissionLineDetail({ fire }) {
  const CMRA_DATASET_URL =
    'https://resilience.climate.gov/datasets/d4090758322c4d32a4cd002ffaa0aa12_0';

  const row = (label, value) => {
    if (value == null || String(value).trim() === '') return null;
    return (
      <div className="flex justify-between gap-3 py-1.5 border-b border-sentinel-700/80 text-xs">
        <span className="text-sentinel-400 shrink-0">{label}</span>
        <span className="text-sentinel-100 text-right font-medium">{String(value)}</span>
      </div>
    );
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-2">
        <div className="mt-0.5 p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30">
          <Zap size={16} className="text-amber-400" />
        </div>
        <div>
          <h3 className="font-bold text-white text-lg leading-tight">{fire.name || 'Transmission line'}</h3>
          <p className="text-sentinel-400 text-[11px] mt-1">
            U.S. electric transmission (CMRA archive). Lines load for your current map view (up to 2,000 segments).
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/40 px-3 py-1 mb-4">
        {row('Line ID', fire.lineId)}
        {row('Voltage (kV)', fire.voltage)}
        {row('Voltage class', fire.voltClass)}
        {row('Line type', fire.lineType)}
        {row('Operational status', fire.status)}
        {row('Owner', fire.owner)}
        {fire.naicsDesc && (
          <div className="py-2 text-xs text-sentinel-300 leading-snug border-b border-sentinel-700/80 last:border-0">
            <span className="text-[10px] font-bold text-sentinel-500 uppercase tracking-wider block mb-1">NAICS</span>
            {fire.naicsDesc}
          </div>
        )}
        {row('Data source', fire.source)}
      </div>

      {Number.isFinite(fire.lat) && Number.isFinite(fire.lng) && (
        <div className="mb-4 text-xs text-sentinel-400">
          Location:{' '}
          <span className="text-sentinel-200 font-mono">
            {fire.lat.toFixed(5)}, {fire.lng.toFixed(5)}
          </span>
        </div>
      )}

      <a
        href={CMRA_DATASET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        <ExternalLink size={12} />
        Dataset on Climate Mapping (CMRA)
      </a>
    </>
  );
}

function GasPipelineDetail({ fire }) {
  const EIA_SERVICE_URL =
    'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services' +
    '/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer';

  const row = (label, value) => {
    if (value == null || String(value).trim() === '') return null;
    return (
      <div className="flex justify-between gap-3 py-1.5 border-b border-sentinel-700/80 text-xs">
        <span className="text-sentinel-400 shrink-0">{label}</span>
        <span className="text-sentinel-100 text-right font-medium">{String(value)}</span>
      </div>
    );
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-2">
        <div className="mt-0.5 p-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30">
          <Fuel size={16} className="text-sky-300" />
        </div>
        <div>
          <h3 className="font-bold text-white text-lg leading-tight">{fire.name || 'Natural gas pipeline'}</h3>
          <p className="text-sentinel-400 text-[11px] mt-1">
            EIA interstate and intrastate natural gas pipelines. Data loads for your current map view (up to 2,000 segments per request).
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/40 px-3 py-1 mb-4">
        {row('Interstate / intrastate', fire.pipeType)}
        {row('Operator', fire.operator)}
        {row('Operational status', fire.status)}
      </div>

      {Number.isFinite(fire.lat) && Number.isFinite(fire.lng) && (
        <div className="mb-4 text-xs text-sentinel-400">
          Location:{' '}
          <span className="text-sentinel-200 font-mono">
            {fire.lat.toFixed(5)}, {fire.lng.toFixed(5)}
          </span>
        </div>
      )}

      <a
        href={EIA_SERVICE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
      >
        <ExternalLink size={12} />
        EIA pipeline feature service
      </a>
    </>
  );
}

const NATIONAL_MAP_STRUCTURES_URL =
  'https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer/56';

function NationalMapCollegeDetail({ fire }) {
  const p = fire.properties || {};
  const row = (label, value) => {
    if (value == null || String(value).trim() === '') return null;
    return (
      <div className="flex justify-between gap-3 py-1.5 border-b border-sentinel-700/80 text-xs">
        <span className="text-sentinel-400 shrink-0">{label}</span>
        <span className="text-sentinel-100 text-right font-medium">{String(value)}</span>
      </div>
    );
  };

  const displayName = fire.name || p.NAME || p.name || 'School / university';

  return (
    <>
      <div className="mb-4 flex items-start gap-2">
        <div className="mt-0.5 p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30">
          <GraduationCap size={16} className="text-violet-300" />
        </div>
        <div>
          <h3 className="font-bold text-white text-lg leading-tight">{displayName}</h3>
          <p className="text-sentinel-400 text-[11px] mt-1">
            USGS National Map — Colleges &amp; universities (structures). Points load for your current map view.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/40 px-3 py-1 mb-4">
        {row('OBJECTID', p.OBJECTID)}
        {row('Feature type (FTYPE)', p.FTYPE)}
        {row('State FIPS', p.STATE_FIPS)}
        {row('County FIPS', p.COUNTY_FIPS)}
      </div>

      {Number.isFinite(fire.lat) && Number.isFinite(fire.lng) && (
        <div className="mb-4 text-xs text-sentinel-400">
          Location:{' '}
          <span className="text-sentinel-200 font-mono">
            {fire.lat.toFixed(5)}, {fire.lng.toFixed(5)}
          </span>
        </div>
      )}

      <a
        href={NATIONAL_MAP_STRUCTURES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
      >
        <ExternalLink size={12} />
        USGS National Map layer (ArcGIS REST)
      </a>
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

    // Use the Web Share API only when the browser supports it AND can handle
    // this specific payload. canShare() is a prerequisite check that prevents
    // hard failures on browsers that expose share() but reject certain payloads.
    const canUseNativeShare =
      typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(payload));

    if (canUseNativeShare) {
      try {
        await navigator.share(payload);
        setShareStatus('Shared');
        window.setTimeout(() => setShareStatus(''), 2500);
        return;
      } catch (err) {
        // AbortError means the user dismissed the native share sheet – don't
        // treat this as a failure or attempt the clipboard fallback.
        if (err?.name === 'AbortError') {
          return;
        }
        // Any other error (NotAllowedError, TypeError, etc.) falls through to
        // the clipboard fallback below.
      }
    }

    // Clipboard fallback – works in all modern desktop browsers.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${payload.text}\n${shareUrl}`);
        setShareStatus('Link copied');
      } else {
        setShareStatus('Sharing unavailable');
      }
    } catch {
      setShareStatus('Copy failed');
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
            {selectedFire.type === 'hotspot'         ? 'Hotspot Detail' :
             selectedFire.type === 'incident'        ? 'Incident Detail' :
             selectedFire.type === 'aqi'             ? 'Air Quality' :
             selectedFire.type === 'weather-alert'   ? 'Weather Alert' :
             selectedFire.type === 'user-report'     ? 'Community Report' :
             selectedFire.type === 'evacuation-zone'          ? (selectedFire.source === 'ipaws' ? 'IPAWS alert' : 'Evacuation Zone') :
             selectedFire.type === 'reporter-evacuation-zone' ? 'Reporter Evac Zone' :
             selectedFire.type === 'transmission-line'        ? 'Critical Infrastructure' :
             selectedFire.type === 'gas-pipeline'            ? 'Critical Infrastructure' :
             selectedFire.type === 'national-map-college'    ? 'School / University' :
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
          {selectedFire.type === 'hotspot'         && <HotspotDetail   fire={selectedFire} />}
          {selectedFire.type === 'perimeter'       && <PerimeterDetail  fire={selectedFire} />}
          {selectedFire.type === 'incident'        && <IncidentDetail   fire={selectedFire} />}
          {selectedFire.type === 'aqi'             && <AQIDetail        fire={selectedFire} />}
          {selectedFire.type === 'weather-alert'   && <AlertDetail      fire={selectedFire} alerts={alerts} />}
          {selectedFire.type === 'user-report'     && <UserReportDetail fire={selectedFire} />}
          {selectedFire.type === 'evacuation-zone'          && <EvacZoneDetail         fire={selectedFire} />}
          {selectedFire.type === 'reporter-evacuation-zone' && <ReporterEvacZoneDetail  fire={selectedFire} />}
          {selectedFire.type === 'transmission-line'       && <TransmissionLineDetail fire={selectedFire} />}
          {selectedFire.type === 'gas-pipeline'            && <GasPipelineDetail     fire={selectedFire} />}
          {selectedFire.type === 'national-map-college'    && <NationalMapCollegeDetail fire={selectedFire} />}
        </div>
      </div>
    </>
  );
});
export default FireDetailPanel;
