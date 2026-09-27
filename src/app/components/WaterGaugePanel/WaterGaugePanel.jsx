/**
 * WaterGaugePanel.jsx
 * Slide-in detail panel for a selected NOAA water gauge.
 * Shows a water-level time-series chart with flood-stage thresholds,
 * and a flood-impacts section – matching the NOAA/Watch Duty gauge UI.
 */

import { memo, useState, useMemo, useRef } from 'react';
import { X, Droplets, ExternalLink } from 'lucide-react';
import { useWaterGaugeDetail } from '../../hooks/useWaterGaugeDetail';
import { FLOOD_CATEGORY_META, floodCategoryLabel } from '../../api/noaaWaterGauge';

// ─── Flood stage colours ───────────────────────────────────────────────────────
// Threshold-line colors for the chart (major/moderate/minor/action only).
const STAGE_COLORS = Object.fromEntries(
  Object.entries(FLOOD_CATEGORY_META)
    .filter(([, meta]) => meta.chartColor)
    .map(([key, meta]) => [key, meta.chartColor])
);

// ─── SVG Chart ────────────────────────────────────────────────────────────────

const CHART_H      = 210;
const PAD_LEFT     = 46;
const PAD_RIGHT    = 12;
const PAD_TOP      = 28;
const PAD_BOTTOM   = 26;

function formatChartDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTooltipDateTime(ms) {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

function WaterLevelChart({ observed, forecast, thresholds, currentStage }) {
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);

  const allPoints = useMemo(() => {
    const obs = (observed ?? []).map((p) => ({ ...p, type: 'obs' }));
    const fct = (forecast ?? []).map((p) => ({ ...p, type: 'fct' }));
    return [...obs, ...fct].sort((a, b) => a.time - b.time);
  }, [observed, forecast]);

  const width = 440;

  const allStages = useMemo(() => {
    const vals = allPoints.map((p) => p.stage).filter((s) => s != null);
    Object.values(thresholds).forEach((v) => { if (v != null) vals.push(v); });
    if (currentStage != null) vals.push(currentStage);
    return vals;
  }, [allPoints, thresholds, currentStage]);

  if (!allPoints.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sentinel-400 text-xs">
        No stage data available
      </div>
    );
  }

  const minTime = allPoints[0].time;
  const maxTime = allPoints[allPoints.length - 1].time;
  const minStage = Math.max(0, Math.min(...allStages) - 0.5);
  const maxStage = Math.max(...allStages) + 0.5;

  const chartW = width - PAD_LEFT - PAD_RIGHT;
  const chartH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const toX = (ms) => PAD_LEFT + ((ms - minTime) / (maxTime - minTime || 1)) * chartW;
  const toY = (stage) => PAD_TOP + chartH - ((stage - minStage) / (maxStage - minStage || 1)) * chartH;
  const toTime = (x) => minTime + ((x - PAD_LEFT) / (chartW || 1)) * (maxTime - minTime);

  // Build path strings
  const obsPoints  = allPoints.filter((p) => p.type === 'obs');
  const fctPoints  = allPoints.filter((p) => p.type === 'fct');

  const pointsToPath = (pts) => {
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.time).toFixed(1)},${toY(p.stage).toFixed(1)}`).join(' ');
  };

  const obsPath = pointsToPath(obsPoints);
  const fctPath = pointsToPath(fctPoints);

  // Fill area under observed line
  const fillPath = obsPoints.length
    ? `${obsPath} L${toX(obsPoints[obsPoints.length - 1].time).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} L${toX(obsPoints[0].time).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} Z`
    : '';

  // X-axis ticks: pick ~5 dates
  const tickCount = 5;
  const tickIndices = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i / (tickCount - 1)) * (allPoints.length - 1))
  );
  const xTicks = [...new Set(tickIndices)].map((idx) => allPoints[idx]);

  // Y-axis ticks: 0.5 ft steps
  const yStep = (maxStage - minStage) > 4 ? 1 : 0.5;
  const yTickStart = Math.ceil(minStage / yStep) * yStep;
  const yTicks = [];
  for (let v = yTickStart; v <= maxStage + 0.01; v += yStep) {
    yTicks.push(parseFloat(v.toFixed(1)));
  }

  // "Now" position + the latest-reading marker (last observed point, or the
  // closest point to now when a gauge has no observed series at all).
  const nowMs = Date.now();
  const nowInRange = nowMs >= minTime && nowMs <= maxTime;
  const nowClamped = Math.min(Math.max(nowMs, minTime), maxTime);
  const latestPoint = obsPoints.length
    ? obsPoints[obsPoints.length - 1]
    : allPoints.reduce((closest, p) => (
        Math.abs(p.time - nowMs) < Math.abs(closest.time - nowMs) ? p : closest
      ), allPoints[0]);

  const handlePointerMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * width;
    const t = toTime(svgX);
    const nearest = allPoints.reduce((closest, p) => (
      Math.abs(p.time - t) < Math.abs(closest.time - t) ? p : closest
    ), allPoints[0]);
    setHover({ ...nearest, pxPercent: (relX / rect.width) * 100 });
  };

  const handlePointerLeave = () => setHover(null);

  return (
    <div ref={containerRef} className="relative" onMouseMove={handlePointerMove} onMouseLeave={handlePointerLeave}>
      <svg
        viewBox={`0 0 ${width} ${CHART_H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label="Water level chart"
      >
        <defs>
          <linearGradient id="obsGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={PAD_LEFT} y={PAD_TOP} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Past (observed-window) shading, up to "now" */}
        <rect
          x={PAD_LEFT} y={PAD_TOP}
          width={Math.max(0, toX(nowClamped) - PAD_LEFT).toFixed(1)} height={chartH}
          fill="rgba(59,130,246,0.07)"
        />

        {/* Vertical day gridlines */}
        {xTicks.map((p) => (
          <line
            key={`vg-${p.time}`}
            x1={toX(p.time).toFixed(1)} y1={PAD_TOP}
            x2={toX(p.time).toFixed(1)} y2={PAD_TOP + chartH}
            stroke="#334155" strokeWidth="0.5"
          />
        ))}

        {/* Horizontal gridlines */}
        {yTicks.map((v) => (
          <line
            key={v}
            x1={PAD_LEFT} y1={toY(v).toFixed(1)}
            x2={PAD_LEFT + chartW} y2={toY(v).toFixed(1)}
            stroke="#334155" strokeWidth="0.5"
          />
        ))}

        {/* Fill area */}
        {fillPath && (
          <path d={fillPath} fill="url(#obsGrad)" clipPath="url(#chartClip)" />
        )}

        {/* Observed line */}
        {obsPath && (
          <path d={obsPath} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#chartClip)" />
        )}

        {/* Forecast line (dashed) */}
        {fctPath && (
          <path
            d={fctPath} fill="none" stroke="#3b82f6"
            strokeWidth="3" strokeDasharray="6,4" strokeLinecap="round"
            clipPath="url(#chartClip)"
          />
        )}

        {/* Flood threshold lines + badge labels (drawn on top of the plotted line) */}
        {Object.entries(thresholds).map(([key, val]) => {
          if (val == null || val < minStage || val > maxStage) return null;
          const y = toY(val);
          const color = STAGE_COLORS[key];
          const label = `${key.charAt(0).toUpperCase() + key.slice(1)} ${val} ft`.toUpperCase();
          const pillW = label.length * 5.3 + 14;
          const pillH = 14;
          return (
            <g key={key}>
              <line
                x1={PAD_LEFT} y1={y.toFixed(1)}
                x2={PAD_LEFT + chartW} y2={y.toFixed(1)}
                stroke={color} strokeWidth="1.5"
              />
              <rect
                x="2" y={(y - pillH / 2).toFixed(1)}
                width={pillW.toFixed(1)} height={pillH} rx="3"
                fill={color}
              />
              <text
                x={(2 + pillW / 2).toFixed(1)} y={(y + 3).toFixed(1)}
                textAnchor="middle"
                fontSize="8.5" fill="#fff" fontWeight="700"
                style={{ letterSpacing: '0.03em' }}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* "Now" indicator line */}
        {nowInRange && (
          <line
            x1={toX(nowMs).toFixed(1)} y1={PAD_TOP}
            x2={toX(nowMs).toFixed(1)} y2={PAD_TOP + chartH}
            stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7"
          />
        )}

        {/* Latest-reading marker */}
        {latestPoint && (
          <circle
            cx={toX(latestPoint.time).toFixed(1)}
            cy={toY(latestPoint.stage).toFixed(1)}
            r="6"
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth="2"
            clipPath="url(#chartClip)"
          />
        )}

        {/* Hover crosshair */}
        {hover && (
          <>
            <line
              x1={toX(hover.time).toFixed(1)} y1={PAD_TOP}
              x2={toX(hover.time).toFixed(1)} y2={PAD_TOP + chartH}
              stroke="#f8fafc" strokeWidth="1" strokeDasharray="3,3" opacity="0.9"
            />
            <circle
              cx={toX(hover.time).toFixed(1)}
              cy={toY(hover.stage).toFixed(1)}
              r="4"
              fill={hover.type === 'fct' ? '#0f172a' : '#3b82f6'}
              stroke="#fff"
              strokeWidth="1.5"
            />
          </>
        )}

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text
            key={v}
            x={PAD_LEFT - 6} y={Number(toY(v).toFixed(1)) + 3}
            textAnchor="end"
            fontSize="9" fill="#94a3b8"
          >
            {v.toFixed(1)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((p) => (
          <text
            key={p.time}
            x={toX(p.time).toFixed(1)} y={CHART_H - 4}
            textAnchor="middle"
            fontSize="9" fill="#94a3b8"
          >
            {formatChartDate(p.time)}
          </text>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 bg-white text-sentinel-900 rounded-lg shadow-xl px-3 py-2 text-xs whitespace-nowrap"
          style={{
            left: `${Math.min(Math.max(hover.pxPercent, 14), 86)}%`,
            top: '100%',
            marginTop: '6px',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold">{formatTooltipDateTime(hover.time)}</div>
          <div className="mt-0.5 text-sentinel-600">
            {hover.type === 'fct' ? 'Forecast' : 'Observed'}:{' '}
            <span className="font-bold text-sentinel-900">{hover.stage.toFixed(1)} ft</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Flood Impacts Bar ─────────────────────────────────────────────────────────

function FloodImpactsBar({ currentStage, thresholds, impacts = [] }) {
  if (currentStage == null) return null;

  const maxScale = Math.max(
    currentStage + 1,
    (thresholds.major ?? 0) + 1,
  );

  const pct = (val) => `${Math.min(100, Math.max(0, (val / maxScale) * 100)).toFixed(1)}%`;

  const stages = [
    { key: 'action',   label: 'Action',   color: STAGE_COLORS.action },
    { key: 'minor',    label: 'Minor',    color: STAGE_COLORS.minor },
    { key: 'moderate', label: 'Moderate', color: STAGE_COLORS.moderate },
    { key: 'major',    label: 'Major',    color: STAGE_COLORS.major },
  ].filter((s) => thresholds[s.key] != null);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold text-white mb-3">Flood impacts</h3>

      {/* Current level bar */}
      <div className="relative mb-4">
        <div className="w-full h-1.5 bg-sentinel-700 rounded-full relative overflow-visible">
          {/* threshold ticks */}
          {stages.map(({ key, color }) => {
            const val = thresholds[key];
            if (val == null) return null;
            return (
              <div
                key={key}
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full"
                style={{ left: pct(val), backgroundColor: color }}
              />
            );
          })}
          {/* current stage indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5"
            style={{ left: pct(currentStage) }}
          >
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/30 -ml-1.5" />
          </div>
        </div>

        {/* Label row */}
        <div className="flex items-center gap-2 mt-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shrink-0" />
          <span className="text-xs font-bold text-white">
            {currentStage.toFixed(1)} ft
          </span>
          <span className="text-xs text-blue-300 font-medium">Current Level</span>
        </div>
      </div>

      {/* Threshold rows */}
      <div className="space-y-3">
        {stages.map(({ key, label, color }) => {
          const val = thresholds[key];
          const stageImpacts = impacts.filter((imp) => imp.category === key);

          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {val.toFixed(1)} ft
                </span>
                <span className="text-xs text-white font-medium">{label}</span>
              </div>
              {stageImpacts.slice(0, 2).map((imp, i) => (
                <p key={i} className="text-xs text-sentinel-400 leading-relaxed pl-2 border-l border-sentinel-700">
                  {imp.statement}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

const WaterGaugePanel = memo(function WaterGaugePanel({ gauge, onClose }) {
  const [activeTab, setActiveTab] = useState('conditions');
  const { detail, series, loading, error } = useWaterGaugeDetail(gauge?.lid ?? null);

  if (!gauge) return null;

  // Merge properties from the map feature with the normalised API detail.
  const props = gauge;
  const lid   = props.lid;

  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

  // Use detail data when available, fall back to map feature properties.
  const gaugeName = detail?.name  ?? props.name  ?? lid;
  const datum     = detail?.datum ?? props.datum ?? '';

  const thresholds = {
    action:   detail?.thresholds?.action   ?? num(props.actionStage),
    minor:    detail?.thresholds?.minor    ?? num(props.minorStage),
    moderate: detail?.thresholds?.moderate ?? num(props.moderateStage),
    major:    detail?.thresholds?.major    ?? num(props.majorStage),
  };

  const currentStage = detail?.currentStage ?? num(props.currentStage);

  const floodCategory = detail?.floodCategory
    ?? props.floodCategory
    ?? 'no_flooding';

  const impacts = detail?.impacts ?? [];

  const nwpsUrl = `https://water.noaa.gov/gauges/${lid}`;

  const titleSuffix = datum ? ` (in ${datum})` : '';
  const fullTitle = `${gaugeName}${titleSuffix}`;

  const categoryLabel = floodCategoryLabel(floodCategory);
  const categoryBg = FLOOD_CATEGORY_META[floodCategory]?.bgClass ?? FLOOD_CATEGORY_META.no_flooding.bgClass;

  return (
    <div className="
      fixed right-0 top-0 h-full w-full sm:w-[420px]
      bg-sentinel-900 border-l border-sentinel-700
      flex flex-col z-40 shadow-2xl shadow-black/60
      overflow-hidden
    ">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-sentinel-700 shrink-0">
        <div className="flex items-start gap-2 min-w-0 mr-3">
          <div className="p-1.5 bg-blue-900/50 rounded-lg shrink-0 mt-0.5">
            <Droplets size={16} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight break-words">
              {fullTitle}
            </h2>
            {props.state && (
              <div className="text-[11px] text-sentinel-400 mt-0.5">
                {[props.county && `${props.county} Co.`, props.state].filter(Boolean).join(', ')}
                {props.hsa && <span className="text-sentinel-500"> · HSA {props.hsa}</span>}
              </div>
            )}
            {currentStage != null && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white mt-1 ${categoryBg}`}>
                {categoryLabel}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-sentinel-400 hover:text-white transition-colors shrink-0 p-1"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-sentinel-700 shrink-0">
        {[{ id: 'conditions', label: 'Conditions' }].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-white border-blue-500'
                : 'text-sentinel-400 border-transparent hover:text-sentinel-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'conditions' && (
          <div className="px-4 py-4">
            {/* Water level header */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-white">
                Water level <span className="font-normal text-sentinel-400">in ft</span>
              </div>
              <a
                href={nwpsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors font-semibold"
              >
                Source NOAA <ExternalLink size={11} />
              </a>
            </div>

            {/* Loading / error states */}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-sentinel-400 py-4">
                <div className="w-3 h-3 border-2 border-sentinel-500 border-t-blue-400 rounded-full animate-spin" />
                Loading gauge data…
              </div>
            )}

            {error && !loading && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2 mb-3">
                Failed to load gauge data. The gauge may be offline.
              </div>
            )}

            {/* Chart */}
            {!loading && series && (
              <div className="bg-sentinel-800/50 rounded-xl p-3 mb-8">
                <WaterLevelChart
                  observed={series.observed}
                  forecast={series.forecast}
                  thresholds={thresholds}
                  currentStage={currentStage}
                />
              </div>
            )}

            {/* Current reading summary */}
            {currentStage != null && (
              <div className="flex gap-2 mt-3">
                <div className="flex-1 bg-sentinel-800/60 rounded-lg p-2.5 border border-sentinel-700">
                  <div className="text-[10px] text-sentinel-400 uppercase tracking-wider font-bold mb-0.5">
                    Current Stage
                  </div>
                  <div className="text-lg font-bold text-blue-400">
                    {currentStage.toFixed(2)} ft
                  </div>
                </div>
                {thresholds.action != null && (
                  <div className="flex-1 bg-sentinel-800/60 rounded-lg p-2.5 border border-sentinel-700">
                    <div className="text-[10px] text-sentinel-400 uppercase tracking-wider font-bold mb-0.5">
                      Action Stage
                    </div>
                    <div className="text-lg font-bold" style={{ color: STAGE_COLORS.action }}>
                      {thresholds.action.toFixed(1)} ft
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Flood impacts */}
            <FloodImpactsBar
              currentStage={currentStage}
              thresholds={thresholds}
              impacts={impacts}
            />

            {/* No data at all */}
            {!loading && !error && !series && (
              <div className="text-xs text-sentinel-500 text-center py-6">
                No data available for this gauge.
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 pt-3 border-t border-sentinel-800">
              <p className="text-[10px] text-sentinel-500 leading-relaxed">
                Data from the{' '}
                <a
                  href={nwpsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  NOAA National Water Prediction Service
                </a>
                {datum && ` · Datum: ${datum}`}
                {' '}· Gauge ID: {lid}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default WaterGaugePanel;
