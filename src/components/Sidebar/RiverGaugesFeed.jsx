/**
 * RiverGaugesFeed.jsx
 * NOAA river gauge feed for the Weather tab sidebar.
 * Shows gauge cards with current stage, flood thresholds, and a mini sparkline
 * styled after the Watch Duty water-level design.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Droplets, ChevronDown, ChevronRight, ExternalLink, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FLOOD_STATUS, fetchGaugeDetail } from '../../api/noaaRiverGauges';

// ── Flood status badge ──────────────────────────────────────────────────────

function FloodBadge({ status }) {
  const cfg = FLOOD_STATUS[status] || FLOOD_STATUS.unknown;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ── Flood stage threshold bar ───────────────────────────────────────────────

function StageBar({ currentStage, stages }) {
  const { action, minor, moderate, major } = stages;
  if (!action && !minor) return null;

  const maxStage = (major || moderate || minor || action || 10) * 1.3;
  const pct = (val) => Math.min(100, Math.max(0, (val / maxStage) * 100));

  const thresholds = [
    { key: 'action',   value: action,   label: `${action} ft`,   color: '#eab308' },
    { key: 'minor',    value: minor,    label: `${minor} ft`,    color: '#f97316' },
    { key: 'moderate', value: moderate, label: `${moderate} ft`, color: '#dc2626' },
    { key: 'major',    value: major,    label: `${major} ft`,    color: '#7c3aed' },
  ].filter(t => t.value != null);

  return (
    <div className="mt-2.5 mb-1">
      {/* Current level marker */}
      <div className="relative h-2 bg-sentinel-700 rounded-full overflow-hidden mb-1">
        {/* Fill up to current stage */}
        {currentStage != null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${pct(currentStage)}%`,
              backgroundColor: FLOOD_STATUS[getStatusFromStage(currentStage, stages)].color,
            }}
          />
        )}
        {/* Threshold tick marks */}
        {thresholds.map(t => (
          <div
            key={t.key}
            className="absolute inset-y-0 w-0.5 opacity-80"
            style={{ left: `${pct(t.value)}%`, backgroundColor: t.color }}
          />
        ))}
      </div>

      {/* Threshold labels */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {thresholds.map(t => (
          <span key={t.key} className="text-[10px] font-semibold" style={{ color: t.color }}>
            {t.key.charAt(0).toUpperCase() + t.key.slice(1)}: {t.value} ft
          </span>
        ))}
      </div>
    </div>
  );
}

function getStatusFromStage(stage, stages) {
  if (!stage) return 'normal';
  if (stages.major    && stage >= stages.major)    return 'major';
  if (stages.moderate && stage >= stages.moderate) return 'moderate';
  if (stages.minor    && stage >= stages.minor)    return 'minor';
  if (stages.action   && stage >= stages.action)   return 'action';
  return 'normal';
}

// ── Mini sparkline (SVG) ─────────────────────────────────────────────────────

function Sparkline({ points, actionStage, color = '#3b82f6' }) {
  if (!points || points.length < 2) return null;

  const W = 200, H = 48, PAD = 4;
  const stages = points.map(p => p.stage);
  const minS = Math.min(...stages);
  const maxS = Math.max(...stages, actionStage || 0);
  const range = maxS - minS || 1;

  const x = (i) => PAD + ((W - PAD * 2) * i) / (points.length - 1);
  const y = (s) => H - PAD - ((H - PAD * 2) * (s - minS)) / range;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.stage).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${x(points.length - 1).toFixed(1)},${H} L${PAD},${H} Z`;

  const actionY = actionStage != null ? y(actionStage) : null;
  const lastPt = points[points.length - 1];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-1.5 -mx-1" style={{ overflow: 'visible' }}>
      {/* Action stage line */}
      {actionY != null && actionY > 0 && actionY < H && (
        <>
          <line x1={PAD} y1={actionY} x2={W - PAD} y2={actionY}
            stroke="#eab308" strokeWidth="1" strokeDasharray="3,2" opacity="0.7" />
          <text x={PAD + 2} y={actionY - 3} fill="#eab308" fontSize="7" fontWeight="600">
            ACTION {actionStage} ft
          </text>
        </>
      )}

      {/* Area fill */}
      <defs>
        <linearGradient id="gauge-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#gauge-area-fill)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Current level dot */}
      <circle
        cx={x(points.length - 1)} cy={y(lastPt.stage)}
        r="3" fill={color} stroke="white" strokeWidth="1.5"
      />
    </svg>
  );
}

// ── Expanded gauge detail panel ───────────────────────────────────────────────

function GaugeDetail({ gauge }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    fetchGaugeDetail(gauge.lid).then(d => {
      if (mountedRef.current) {
        setDetail(d);
        setDetailLoading(false);
      }
    });
    return () => { mountedRef.current = false; };
  }, [gauge.lid]);

  const cfg = FLOOD_STATUS[gauge.status] || FLOOD_STATUS.unknown;
  const observed = detail?.observed || [];
  // Last 7 days of observations for the chart
  const chartPoints = observed.slice(-168);

  return (
    <div className="px-3 pb-3 pt-1">
      {/* Water level chart */}
      <div className="bg-sentinel-800/70 rounded-xl px-3 pt-2.5 pb-2 border border-sentinel-700/60 mb-2.5">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-semibold text-sentinel-200">Water level in ft</span>
          <a
            href={gauge.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[10px] text-sky-400 hover:text-sky-300 font-semibold underline-offset-2 hover:underline"
          >
            Source NOAA <ExternalLink size={9} className="shrink-0" />
          </a>
        </div>

        {detailLoading ? (
          <div className="flex items-center gap-2 py-4 text-sentinel-400 text-xs">
            <Loader2 size={12} className="animate-spin" />
            Loading chart…
          </div>
        ) : chartPoints.length > 0 ? (
          <Sparkline
            points={chartPoints}
            actionStage={gauge.floodStages.action}
            color={cfg.color}
          />
        ) : (
          <p className="text-xs text-sentinel-400 py-3 text-center">No observation data available</p>
        )}

        {/* Current level + badge */}
        <div className="flex items-center gap-2 mt-2">
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: cfg.color, boxShadow: `0 0 6px ${cfg.color}88` }}
          />
          <span className="text-sm font-bold text-white">
            {gauge.currentStage != null ? `${gauge.currentStage.toFixed(1)} ft` : '— ft'}
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: cfg.color }}
          >
            Current Level
          </span>
        </div>
      </div>

      {/* Flood stage thresholds */}
      <div className="space-y-2 mb-2">
        {[
          { key: 'action',   label: 'Action Stage' },
          { key: 'minor',    label: 'Minor Flood' },
          { key: 'moderate', label: 'Moderate Flood' },
          { key: 'major',    label: 'Major Flood' },
        ]
          .filter(t => gauge.floodStages[t.key] != null)
          .map(t => (
            <div key={t.key} className="flex items-start gap-2">
              <span
                className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold text-white min-w-[52px] text-center"
                style={{ backgroundColor: FLOOD_STATUS[t.key].color }}
              >
                {gauge.floodStages[t.key]} ft
              </span>
              <p className="text-xs text-sentinel-200 leading-snug">
                {t.label} stage
                {gauge.currentStage != null && gauge.currentStage >= gauge.floodStages[t.key] && (
                  <span className="ml-1 font-semibold" style={{ color: FLOOD_STATUS[t.key].color }}>
                    ● Exceeded
                  </span>
                )}
              </p>
            </div>
          ))}
      </div>

      {/* Forecast crest */}
      {detail?.gauge?.forecastCrest != null && (
        <div className="flex items-center gap-2 mt-2 px-2.5 py-2 bg-blue-950/50 border border-blue-800/40 rounded-lg">
          <TrendingUp size={13} className="text-blue-400 shrink-0" />
          <div className="text-xs text-blue-200">
            <span className="font-semibold">Forecast crest: {detail.gauge.forecastCrest.toFixed(1)} ft</span>
            {detail.gauge.forecastCrestTime && (
              <span className="text-blue-400 ml-1">
                · {new Date(detail.gauge.forecastCrestTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Flood impacts */}
      {gauge.impacts?.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11px] font-bold text-sentinel-200 mb-1.5 uppercase tracking-wide">Flood Impacts</p>
          <div className="space-y-2">
            {gauge.impacts.slice(0, 4).map((impact, i) => (
              <div key={i} className="flex items-start gap-2">
                {impact.stage != null && (
                  <span
                    className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold text-white min-w-[52px] text-center"
                    style={{ backgroundColor: FLOOD_STATUS[getStatusFromStage(impact.stage, gauge.floodStages)].color }}
                  >
                    {impact.stage} ft
                  </span>
                )}
                <p className="text-xs text-sentinel-300 leading-snug">{impact.description || impact.statement || impact}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gauge card ───────────────────────────────────────────────────────────────

function GaugeCard({ gauge, expanded, onToggle }) {
  const cfg = FLOOD_STATUS[gauge.status] || FLOOD_STATUS.unknown;

  return (
    <div className="mb-1.5 rounded-xl border border-sentinel-700/60 overflow-hidden bg-sentinel-800/40">
      {/* Card header — clickable */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-sentinel-700/40 transition-colors"
      >
        {/* Status dot */}
        <div
          className="shrink-0 w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: cfg.color, boxShadow: `0 0 5px ${cfg.color}` }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-white leading-tight truncate">{gauge.name}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <FloodBadge status={gauge.status} />
            {gauge.currentStage != null && (
              <span className="text-xs text-sentinel-300 font-medium">
                {gauge.currentStage.toFixed(1)} ft
              </span>
            )}
            {gauge.state && (
              <span className="text-xs text-sentinel-400">{gauge.state}</span>
            )}
          </div>
        </div>

        {expanded
          ? <ChevronDown size={15} className="shrink-0 text-sentinel-400" />
          : <ChevronRight size={15} className="shrink-0 text-sentinel-400" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && <GaugeDetail gauge={gauge} />}
    </div>
  );
}

// ── Status group ─────────────────────────────────────────────────────────────

const STATUS_ORDER = ['major', 'moderate', 'minor', 'action', 'normal', 'unknown'];

function StatusGroup({ status, gauges, expandedId, onToggle }) {
  const [groupOpen, setGroupOpen] = useState(status !== 'normal' && status !== 'unknown');
  const cfg = FLOOD_STATUS[status] || FLOOD_STATUS.unknown;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setGroupOpen(v => !v)}
        className="w-full flex items-center gap-2 py-2 px-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
      >
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
        <span className="flex-1 text-left font-bold text-sm text-sentinel-100">{cfg.label}</span>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold text-white min-w-[1.5rem] text-center"
          style={{ backgroundColor: cfg.color + 'cc' }}
        >
          {gauges.length}
        </span>
        {groupOpen
          ? <ChevronDown size={15} className="shrink-0 text-sentinel-400" />
          : <ChevronRight size={15} className="shrink-0 text-sentinel-400" />
        }
      </button>

      {groupOpen && (
        <div className="ml-1 mt-0.5 pl-2 border-l border-sentinel-700/50 space-y-0">
          {gauges.map(g => (
            <GaugeCard
              key={g.lid}
              gauge={g}
              expanded={expandedId === g.lid}
              onToggle={() => onToggle(g.lid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main feed component ──────────────────────────────────────────────────────

export default function RiverGaugesFeed({ gauges = [], loading, error }) {
  const [expandedId, setExpandedId] = useState(null);
  const { setViewport } = useApp();

  const handleToggle = useCallback((lid) => {
    setExpandedId(prev => prev === lid ? null : lid);
  }, []);

  // Group gauges by flood status
  const byStatus = {};
  for (const g of gauges) {
    const s = g.status || 'unknown';
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push(g);
  }

  const groups = STATUS_ORDER.filter(s => byStatus[s]?.length > 0);

  return (
    <div className="flex flex-col h-full antialiased">
      {/* Header strip */}
      <div className="px-3 pt-2 pb-2 border-b border-sentinel-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <Droplets size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-sentinel-200">
            NOAA River Gauges
          </span>
          {gauges.length > 0 && (
            <span className="ml-auto text-xs text-sentinel-400">
              {gauges.length} at elevated stage
            </span>
          )}
        </div>
      </div>

      {/* Feed body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 pb-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sentinel-200">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading gauge data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 mx-1 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Could not load NOAA river gauge data.</span>
          </div>
        )}

        {!loading && !error && gauges.length === 0 && (
          <div className="text-center py-8 text-sentinel-300 text-sm flex flex-col items-center gap-2">
            <Droplets size={18} />
            <span>No gauges at elevated flood stage.</span>
          </div>
        )}

        {!loading && !error && groups.map(status => (
          <StatusGroup
            key={status}
            status={status}
            gauges={byStatus[status]}
            expandedId={expandedId}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
