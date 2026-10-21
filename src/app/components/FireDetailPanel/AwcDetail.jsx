/**
 * AwcDetail.jsx
 * Detail panel body for a clicked Aviation Weather Center feature (record
 * type 'awc', built by AwcLayers' buildAwcRecord):
 *   airport weather → the station's latest METAR and its TAF, raw and
 *     decoded, read fresh from the AWC API by station id
 *   pilot report, advisory shape (SIGMET, CWA, G-AIRMET, AIRMET, TCF), or
 *     navigation point → its decoded fields and the raw text AWC sent
 */

import { useEffect, useState } from 'react';
import { Plane, PlaneLanding, AlertTriangle, MapPin } from 'lucide-react';
import { useAwcContext } from '../../context/AwcContext';
import {
  FLIGHT_CATEGORY_COLORS, awcDate, ceilingFt, cloudsText, cToF, fetchStationReports, flightCategory,
  formatRawTaf, hPaToInHg, hazardStyle, parseVisibility, PIREP_SEVERITY_COLORS, PIREP_SEVERITY_LABELS,
  tafPeriods, visibilityText, windText,
} from '../../api/awc/awc';
import { formatClockTime, formatRelativeTime } from '../../utils/formatUtils';
import { useTimeFormat } from '../../hooks/useTimeFormat';

/** Mapbox hands nested values back as JSON strings. */
function arr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.startsWith('[')) {
    try { return JSON.parse(v); } catch { return []; }
  }
  return [];
}

function Row({ label, value }) {
  if (value == null || String(value).trim() === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-sentinel-700/80 last:border-0 text-xs">
      <span className="text-sentinel-400 shrink-0">{label}</span>
      <span className="text-sentinel-100 text-right font-medium">{value}</span>
    </div>
  );
}

function Rows({ children }) {
  return <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/40 px-3 py-1 mb-4">{children}</div>;
}

function SectionLabel({ children, aside }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest">{children}</p>
      {aside && <span className="text-[10px] text-sentinel-500">{aside}</span>}
    </div>
  );
}

function Raw({ text }) {
  if (!text) return null;
  return (
    <pre className="mb-4 rounded-lg bg-black/30 border border-sentinel-700 p-2.5 text-[11px] leading-relaxed text-sentinel-100 font-mono whitespace-pre-wrap break-words select-text">
      {text}
    </pre>
  );
}

function CategoryPill({ category }) {
  if (!category) return null;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ backgroundColor: FLIGHT_CATEGORY_COLORS[category] ?? FLIGHT_CATEGORY_COLORS.UNK }}
    >
      {category}
    </span>
  );
}

function Header({ icon: Icon, color, title, subtitle, children }) {
  return (
    <div className="mb-4 flex items-start gap-2">
      <div className="mt-0.5 p-1.5 rounded-lg border" style={{ backgroundColor: `${color}26`, borderColor: `${color}4d` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <h3 className="font-bold text-white text-lg leading-tight break-words">{title}</h3>
        {subtitle && <p className="text-sentinel-400 text-[11px] mt-1">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

const altitude = (v) => {
  if (v == null || v === '') return null;
  if (String(v).toUpperCase() === 'FZL') return 'freezing level';
  if (String(v).toUpperCase() === 'SFC') return 'surface';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  // G-AIRMETs and AIRMETs give hundreds of feet; SIGMETs and CWAs give feet.
  const ft = n < 1000 ? n * 100 : n;
  return ft === 0 ? 'surface' : `${ft.toLocaleString('en-US')} ft`;
};

const altitudeRange = (base, top) => {
  const b = altitude(base);
  const t = altitude(top);
  if (b && t) return `${b} to ${t}`;
  if (t) return `Up to ${t}`;
  if (b) return `From ${b}`;
  return null;
};

const when = (v) => {
  const d = awcDate(v);
  return d ? `${formatClockTime(d)} (${formatRelativeTime(d).toLowerCase()})` : null;
};

// ─── Airport weather: METAR + TAF ───────────────────────────────────────────

function AirportWeatherDetail({ fire }) {
  useTimeFormat();
  const awc = useAwcContext();
  const id = fire.stationId;
  const bulk = awc?.metarById?.get(id) ?? null;
  const [reports, setReports] = useState({ id: null, metar: null, taf: null, loading: true, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setReports({ id, metar: null, taf: null, loading: true, error: null });
    fetchStationReports(id, ctrl.signal)
      .then(({ metar, taf }) => { if (!ctrl.signal.aborted) setReports({ id, metar, taf, loading: false, error: null }); })
      .catch((error) => { if (!ctrl.signal.aborted) setReports({ id, metar: null, taf: null, loading: false, error }); });
    return () => ctrl.abort();
  }, [id]);

  const m = reports.id === id ? reports.metar : null;
  const taf = reports.id === id ? reports.taf : null;

  // The API report when it's in; the all-stations file until then.
  const metar = m
    ? {
      rawOb: m.rawOb, obsTime: awcDate(m.obsTime) ?? awcDate(m.reportTime), temp: m.temp, dewp: m.dewp,
      wdir: m.wdir, wspd: m.wspd, wgst: m.wgst, visib: m.visib, clouds: m.clouds, vertVis: m.vertVis,
      wx: m.wxString, altimInHg: m.altim != null ? hPaToInHg(m.altim) : null, fltcat: m.fltCat,
    }
    : bulk && {
      ...bulk, obsTime: awcDate(bulk.obsTime), wdir: bulk.vrb ? 'VRB' : bulk.wdir,
    };
  const name = m?.name || taf?.name || null;
  const category = metar?.fltcat || flightCategory(ceilingFt(metar?.clouds, metar?.vertVis), parseVisibility(metar?.visib));
  const periods = tafPeriods(taf);

  return (
    <>
      <Header
        icon={PlaneLanding}
        color={FLIGHT_CATEGORY_COLORS[category] ?? FLIGHT_CATEGORY_COLORS.UNK}
        title={id}
        subtitle={name || 'Airport weather · METAR & TAF'}
      >
        <div className="mt-1.5 flex items-center gap-2">
          <CategoryPill category={category} />
          {metar?.obsTime && <span className="text-[11px] text-sentinel-400">Observed {formatRelativeTime(metar.obsTime).toLowerCase()}</span>}
        </div>
      </Header>

      <SectionLabel aside={metar?.obsTime ? formatClockTime(metar.obsTime) : null}>Current conditions · METAR</SectionLabel>
      {metar ? (
        <>
          <Raw text={metar.rawOb} />
          <Rows>
            <Row label="Wind" value={metar.wspd != null ? windText(metar.wdir, metar.wspd, metar.wgst) : null} />
            <Row label="Visibility" value={visibilityText(metar.visib)} />
            <Row label="Sky" value={cloudsText(metar.clouds, metar.vertVis) || null} />
            <Row label="Ceiling" value={(() => { const c = ceilingFt(metar.clouds, metar.vertVis); return c != null ? `${c.toLocaleString('en-US')} ft` : 'None'; })()} />
            <Row label="Weather" value={metar.wx} />
            <Row label="Temperature" value={metar.temp != null ? `${Math.round(metar.temp)}°C / ${cToF(metar.temp)}°F` : null} />
            <Row label="Dew point" value={metar.dewp != null ? `${Math.round(metar.dewp)}°C / ${cToF(metar.dewp)}°F` : null} />
            <Row label="Altimeter" value={metar.altimInHg != null ? `${metar.altimInHg.toFixed(2)} inHg` : null} />
          </Rows>
        </>
      ) : (
        <p className="mb-4 text-xs text-sentinel-400">{reports.loading ? 'Loading METAR…' : 'No recent METAR from this station.'}</p>
      )}

      <SectionLabel aside={taf?.issueTime ? `Issued ${formatClockTime(awcDate(taf.issueTime))}` : null}>Forecast · TAF</SectionLabel>
      {reports.loading && !taf && <p className="mb-4 text-xs text-sentinel-400">Loading TAF…</p>}
      {reports.error && <p className="mb-4 text-xs text-amber-400">Couldn&apos;t reach AWC for this station&apos;s reports · {reports.error.message}</p>}
      {!reports.loading && !reports.error && !taf && (
        <p className="mb-4 text-xs text-sentinel-400">No TAF is issued for this station. TAFs cover larger airports only.</p>
      )}
      {taf && (
        <>
          <Raw text={formatRawTaf(taf.rawTAF)} />
          {taf.validTimeFrom && (
            <p className="-mt-2 mb-3 text-[11px] text-sentinel-400">
              Valid {formatClockTime(awcDate(taf.validTimeFrom))} to {formatClockTime(awcDate(taf.validTimeTo))}
            </p>
          )}
          <ol className="mb-4 space-y-1.5">
            {periods.map((p, i) => (
              <li
                key={i}
                className="rounded-lg border border-sentinel-700 bg-sentinel-800/40 pl-2.5 pr-2 py-1.5 border-l-4"
                style={{ borderLeftColor: FLIGHT_CATEGORY_COLORS[p.category] ?? FLIGHT_CATEGORY_COLORS.UNK }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-white">
                    {p.changeLabel}{p.from ? ` · ${formatClockTime(p.from)}` : ''}{p.to ? `–${formatClockTime(p.to)}` : ''}
                  </span>
                  <CategoryPill category={p.category} />
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-sentinel-300">
                  {[p.wind, p.visibility, p.wx, p.clouds, p.windShear && `Wind shear ${p.windShear}`].filter(Boolean).join(' · ')}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

// ─── Pilot report ───────────────────────────────────────────────────────────

function PirepDetail({ fire, p }) {
  useTimeFormat();
  const sev = Number(p.sev) || 0;
  const turb = [p.tbFreq1, p.tbInt1, p.tbType1].filter(Boolean).join(' ');
  const ice = [p.icgInt1, p.icgType1].filter(Boolean).join(' ');
  const turbAlt = altitudeRange(p.tbBas1, p.tbTop1);
  const iceAlt = altitudeRange(p.icgBas1, p.icgTop1);
  return (
    <>
      <Header icon={Plane} color={PIREP_SEVERITY_COLORS[sev]} title={fire.name} subtitle={`Worst reported: ${PIREP_SEVERITY_LABELS[sev].toLowerCase()}`} />
      <Rows>
        <Row label="Reported" value={when(p.obsTime)} />
        <Row label="Aircraft" value={p.aircraft || p.acType} />
        <Row label="Flight level" value={Number(p.fltlvl) > 0 ? `FL${String(p.fltlvl).padStart(3, '0')}` : p.fltlvlType} />
        <Row label="Turbulence" value={turb ? `${turb}${turbAlt ? ` (${turbAlt})` : ''}` : null} />
        <Row label="Icing" value={ice ? `${ice}${iceAlt ? ` (${iceAlt})` : ''}` : null} />
        <Row label="Sky" value={cloudsText(arr(p.clouds)) || null} />
        <Row label="Weather" value={p.wxString} />
        <Row label="Temperature" value={p.temp != null && p.temp !== '' ? `${p.temp}°C` : null} />
        <Row label="Wind" value={p.wspd != null && p.wspd !== '' ? windText(p.wdir, p.wspd) : null} />
      </Rows>
      <SectionLabel>Report</SectionLabel>
      <Raw text={p.rawOb} />
    </>
  );
}

// ─── Advisory shapes ────────────────────────────────────────────────────────

function AdvisoryDetail({ fire, p }) {
  useTimeFormat();
  const style = hazardStyle(p.hz ?? p.hazard);
  const isTcf = fire.key === 'awcTcf';
  const from = p.validTimeFrom ?? p.validTime;
  const movement = p.movementDir != null || p.dir
    ? `${p.dir ?? `${p.movementDir}°`}${p.spd || p.movementSpd ? ` at ${p.spd ?? p.movementSpd} kt` : ''}`
    : null;
  const raw = p.rawSigmet || p.rawAirSigmet || p.rawText || p.rawAirmet || null;
  return (
    <>
      <Header icon={AlertTriangle} color={style.color} title={fire.name} subtitle={style.label} />
      <Rows>
        <Row label="Issued by" value={[p.icaoId, p.firName || p.name || p.cwsu, p.region && p.zone ? `${p.zone} (${p.region})` : null].filter(Boolean).join(' · ') || null} />
        <Row label={isTcf ? 'Valid' : 'Valid from'} value={when(from)} />
        <Row label="Valid until" value={when(p.validTimeTo)} />
        <Row label="Issued" value={when(p.issueTime)} />
        <Row label="Altitudes" value={isTcf ? (p.tops ? `Tops ${altitude(p.tops)}` : null) : altitudeRange(p.base ?? p.altitudeLow1, p.top ?? p.altitudeHi1)} />
        <Row label="Freezing level" value={p.level != null && /FZLVL/.test(p.hz) ? altitude(p.level) : null} />
        <Row label="Coverage" value={p.coverage} />
        <Row label="Confidence" value={p.confidence} />
        <Row label="Qualifier" value={p.qualifier} />
        <Row label="Severity" value={p.severity} />
        <Row label="Movement" value={movement} />
        <Row label="Change" value={p.chng} />
        <Row label="Due to" value={p.dueTo} />
        <Row label="Forecast hour" value={p.forecast != null && p.forecast !== '' ? `+${p.forecast} h` : null} />
      </Rows>
      {raw && (
        <>
          <SectionLabel>Text</SectionLabel>
          <Raw text={raw} />
        </>
      )}
    </>
  );
}

// ─── Navigation point ───────────────────────────────────────────────────────

const NAV_TITLES = {
  awcAirports: 'Airport', awcStations: 'Observation station', awcNavaids: 'Navaid', awcFixes: 'Fix',
  awcObstacles: 'Obstacle', awcFeatures: 'Landmark',
};

/** AWC navigation data gives elevations and heights in metres. */
const metres = (v, suffix = '') => {
  const m = Number(v);
  if (v == null || v === '' || !Number.isFinite(m)) return null;
  return `${Math.round(m * 3.28084).toLocaleString('en-US')} ft${suffix} (${Math.round(m).toLocaleString('en-US')} m)`;
};

function NavDetail({ fire, p }) {
  const runways = arr(p.runways);
  const freqs = String(p.freqs || '').split(';').filter(Boolean).map((f) => f.replace(',', ' '));
  const idents = [p.icaoId, p.iataId, p.faaId].filter((v, i, a) => v && a.indexOf(v) === i).join(' / ');
  return (
    <>
      <Header icon={MapPin} color="#38bdf8" title={p.name || p.site || p.id || fire.name} subtitle={NAV_TITLES[fire.key]} />
      <Rows>
        <Row label="Identifier" value={idents || p.id} />
        <Row label="Type" value={p.type} />
        <Row label="Frequency" value={p.freq} />
        <Row label="Height" value={metres(p.height, ' above ground')} />
        <Row label="Elevation" value={metres(p.elev, ' above sea level')} />
        <Row label="State" value={p.state} />
        <Row label="Country" value={p.country} />
        <Row label="Magnetic variation" value={p.magdec || p.mag_dec} />
        <Row label="Tower" value={p.tower === 'T' ? 'Yes' : p.tower ? 'No' : null} />
        <Row label="Beacon" value={p.beacon === 'B' ? 'Yes' : null} />
      </Rows>
      {runways.length > 0 && (
        <>
          <SectionLabel>Runways</SectionLabel>
          <Rows>
            {runways.map((r) => <Row key={r.id} label={r.id} value={r.dimension ? `${r.dimension} ft` : null} />)}
          </Rows>
        </>
      )}
      {freqs.length > 0 && (
        <>
          <SectionLabel>Frequencies</SectionLabel>
          <Rows>
            {freqs.map((f) => <Row key={f} label={f.split(' ')[0]} value={f.split(' ').slice(1).join(' ')} />)}
          </Rows>
        </>
      )}
    </>
  );
}

/** The clicked feature's full properties (nested arrays intact) when still loaded. */
function fullProps(awc, fire) {
  const f = fire.fid != null ? awc?.sources?.[fire.key]?.features?.[fire.fid] : null;
  const p = fire.props || {};
  const same = (a, b) => ['rawOb', 'rawSigmet', 'rawAirSigmet', 'rawText', 'id', 'name', 'validTime']
    .every((k) => a[k] == null || b[k] == null || String(a[k]) === String(b[k]));
  return f && same(f.properties, p) ? f.properties : p;
}

export default function AwcDetail({ fire }) {
  const awc = useAwcContext();
  if (fire.key === 'awcMetarTaf') return <AirportWeatherDetail fire={fire} />;
  const p = fullProps(awc, fire);
  if (fire.key === 'awcPirep') return <PirepDetail fire={fire} p={p} />;
  if (NAV_TITLES[fire.key]) return <NavDetail fire={fire} p={p} />;
  return <AdvisoryDetail fire={fire} p={p} />;
}
