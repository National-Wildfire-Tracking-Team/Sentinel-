/**
 * FireDangerPointDetail.jsx
 * Location inspection for the Fire Danger & Fuels layers: what is known at
 * the clicked point, each value labelled with its source, its date and what
 * kind of value it is (an official forecast, a static map). Products that
 * aren't connected yet are named as such rather than shown as blanks that
 * could read as "no danger".
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Flame, Loader2 } from 'lucide-react';
import { SFP_CLASSES, SFP_NOT_UPDATED, SFP_SOURCE, SFP_SOURCE_URL } from '../../api/fireDanger/significantFirePotential';
import { LANDFIRE_SOURCE_URL, fetchFuelModelAt } from '../../api/fireDanger/landfireFuels';
import { formatForecastDate } from '../../api/fireDanger/status';
import { withClock } from '../../utils/formatUtils';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useFireDangerContext } from '../../context/FireDangerContext';
import {
  STATION_FIELDS, STATIONS_SOURCE, STATIONS_SOURCE_URL, fetchStationDetail, nearestStation,
} from '../../api/fireDanger/stations';
import StationTrendChart from './StationTrendChart';
import { WFPI_SOURCE, WFPI_SOURCE_URL, fetchWfpiAt } from '../../api/fireDanger/wfpi';
import { IMPLAUSIBLE_PCT, SAMPLES_SOURCE, SAMPLES_SOURCE_URL, ageDays, siteFuels } from '../../api/fireDanger/fieldSamples';
import { productDate } from '../../api/fireDanger/freshness';

const KIND_STYLES = {
  official: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  static: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  station: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  modelled: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  model: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  measured: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
};

function KindTag({ kind, children }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${KIND_STYLES[kind]}`}>
      {children}
    </span>
  );
}

function Rows({ rows }) {
  return (
    <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/40 px-3 py-1">
      {rows.filter((r) => r.value != null && r.value !== '').map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-3 py-1.5 border-b border-sentinel-700/80 last:border-b-0 text-xs">
          <span className="text-sentinel-400 min-w-0">{label}</span>
          <span className="text-sentinel-100 text-right font-medium shrink-0 tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ title, kind, kindLabel }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-sentinel-400">{title}</h4>
      {kind && <KindTag kind={kind}>{kindLabel}</KindTag>}
    </div>
  );
}

function FirePotentialSection({ sfp, day, fetchedAt }) {
  useTimeFormat();
  if (!sfp) return null;
  const cls = sfp.sfpClass ? SFP_CLASSES[sfp.sfpClass] : null;
  const retrieved = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString([], withClock({ hour: 'numeric', minute: '2-digit' }))
    : null;

  return (
    <section className="mb-4">
      <SectionHead title="7-day significant fire potential" kind="official" kindLabel="Official forecast" />
      <div className="flex items-start gap-2 mb-2">
        <span className="mt-0.5 w-3.5 h-3.5 rounded-sm shrink-0 border border-black/30" style={{ backgroundColor: cls?.color ?? SFP_NOT_UPDATED.color }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white leading-tight">{cls?.label ?? SFP_NOT_UPDATED.label}</div>
          {cls?.detail && <p className="text-[11px] text-sentinel-300 leading-snug mt-0.5">{cls.detail}</p>}
          {!cls && (
            <p className="text-[11px] text-sentinel-300 leading-snug mt-0.5">
              NWCG hasn&apos;t issued this area&apos;s forecast for this date yet, so no rating is shown. Check back after noon MDT.
            </p>
          )}
        </div>
      </div>
      <Rows rows={[
        { label: 'Forecast day', value: `Day ${day}${sfp.forecastDate ? ` · ${formatForecastDate(sfp.forecastDate)}` : ''}` },
        { label: 'Predictive Service Area', value: sfp.psa },
        { label: 'Geographic area', value: sfp.gacc },
        { label: 'Retrieved', value: retrieved },
      ]} />
      <a href={SFP_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1.5 text-[11px] text-orange-300 hover:text-orange-200">
        <ExternalLink size={11} /> {SFP_SOURCE}
      </a>
    </section>
  );
}

function FuelModelSection({ lat, lng }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchFuelModelAt(lat, lng)
      .then((result) => { if (!cancelled) setState({ status: 'done', result }); })
      .catch((error) => { if (!cancelled) setState({ status: 'error', error }); });
    return () => { cancelled = true; };
  }, [lat, lng]);

  let body;
  if (state.status === 'loading') {
    body = <div className="flex items-center gap-2 text-xs text-sentinel-300"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> Looking up the fuel model…</div>;
  } else if (state.status === 'error') {
    body = <p className="text-xs text-red-300">Couldn&apos;t reach LANDFIRE: {state.error.message}</p>;
  } else if (!state.result) {
    body = <p className="text-xs text-sentinel-300">No LANDFIRE fuel model coverage here (LANDFIRE maps the 50 states, Puerto Rico and USVI).</p>;
  } else if (!state.result.fuel) {
    body = <p className="text-xs text-sentinel-300">No fuel model mapped at this point (no data).</p>;
  } else {
    const { fuel, service } = state.result;
    body = (
      <>
        <div className="flex items-start gap-2 mb-2">
          <span className="mt-0.5 w-3.5 h-3.5 rounded-sm shrink-0 border border-black/30" style={{ backgroundColor: fuel.color ?? '#71717a' }} />
          <div className="text-sm font-semibold text-white leading-tight">{fuel.model} · {fuel.name}</div>
        </div>
        <Rows rows={[
          { label: 'Fuel group', value: fuel.groupLabel },
          { label: 'Burnable', value: fuel.burnable ? 'Yes' : 'No' },
          { label: 'Dataset', value: `LANDFIRE ${service.version} FBFM40 (${service.label}), 30 m` },
        ]} />
      </>
    );
  }

  return (
    <section className="mb-4">
      <SectionHead title="Fuel model" kind="static" kindLabel="Static map" />
      {body}
      <p className="mt-1.5 text-[10px] text-sentinel-500 leading-snug">
        The fuel type a fire would burn in, mapped yearly. It is not a measure of current fuel moisture.{' '}
        <a href={LANDFIRE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">About FBFM40</a>
      </p>
    </section>
  );
}

const fmt = (v, unit = '') => (v == null ? null : `${Math.round(v * 10) / 10}${unit}`);
const signed = (v, unit = '') => (v == null ? null : `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}${unit}`);

function StationSection({ station, km }) {
  const fd = useFireDangerContext();
  const manifest = fd?.stations?.manifest;
  const [detail, setDetail] = useState({ status: 'loading' });

  useEffect(() => {
    if (!manifest || !station) return undefined;
    let cancelled = false;
    setDetail({ status: 'loading' });
    fetchStationDetail(manifest, station.id)
      .then((d) => { if (!cancelled) setDetail({ status: 'done', d }); })
      .catch((error) => { if (!cancelled) setDetail({ status: 'error', error }); });
    return () => { cancelled = true; };
  }, [manifest, station]);

  const p = station;
  const row = (field) => ({ label: STATION_FIELDS[field].label, value: fmt(p[field], STATION_FIELDS[field].unit) });
  const peak = (p.forecastErc ?? []).filter((v) => v != null);
  const retrieved = fd?.stations?.fems?.retrievedAt;

  return (
    <section className="mb-4">
      <SectionHead title="Nearest NFDRS station" kind="station" kindLabel="Station value" />
      <div className="text-sm font-semibold text-white leading-tight">{p.name}{p.state ? `, ${p.state}` : ''}</div>
      <p className="text-[11px] text-sentinel-400 mb-2">
        {km != null ? `${km < 1 ? '<1' : Math.round(km)} km from this point · ` : ''}observed {p.observedDate ? formatForecastDate(p.observedDate) : '(no current day)'}
        {p.qa && p.qa !== '0' ? ` · FEMS QA flag ${p.qa}` : ''}
      </p>
      {p.stale ? (
        <p className="text-xs text-amber-300 mb-2">This station has no observed day in the last few days, so its values aren&apos;t shown.</p>
      ) : (
        <>
          <Rows rows={[
            row('erc'), row('bi'), row('sc'), row('ic'),
            row('fm1'), row('fm10'), row('fm100'), row('fm1000'),
            { label: 'Keetch-Byram Drought Index', value: fmt(p.kbdi) },
            { label: 'ERC change, past 7 days', value: signed(p.ercChange7d) },
            { label: '100-h moisture change, 7 days', value: signed(p.fm100Change7d, '%') },
            { label: 'Forecast peak ERC, next 7 days', value: peak.length ? fmt(Math.max(...peak)) : null },
          ]} />
          <div className="mt-2 mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-sentinel-400">Live fuel moisture</span>
            <KindTag kind="modelled">Modelled, not measured</KindTag>
          </div>
          <Rows rows={[row('herbFM'), row('woodyFM')]} />
        </>
      )}
      <div className="mt-3">
        {detail.status === 'loading' && <div className="flex items-center gap-2 text-xs text-sentinel-300"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> Loading station history…</div>}
        {detail.status === 'error' && <p className="text-xs text-red-300">Couldn&apos;t load station history: {detail.error.message}</p>}
        {detail.status === 'done' && (
          <>
            <StationTrendChart detail={detail.d} field="erc" label="ERC, observed then forecast" color="#f97316" />
            <StationTrendChart detail={detail.d} field="fm100" label="100-h fuel moisture, observed then forecast" unit="%" color="#38bdf8" />
          </>
        )}
      </div>
      <p className="mt-1 text-[10px] text-sentinel-500 leading-snug">
        NFDRS 2016, fuel model Y, computed by FEMS for this station; it applies at the station, not between stations.
        Local danger ratings use local fuel models and breakpoints, so they can differ.
        {retrieved ? ` Retrieved ${new Date(retrieved).toLocaleString([], withClock({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}.` : ''}{' '}
        <a href={STATIONS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">{STATIONS_SOURCE}</a>
      </p>
    </section>
  );
}

function WfpiSection({ lat, lng }) {
  const fd = useFireDangerContext();
  const day = fd?.wfpi?.day;
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    if (!day) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchWfpiAt(day, lat, lng)
      .then((v) => { if (!cancelled) setState({ status: 'done', v }); })
      .catch((error) => { if (!cancelled) setState({ status: 'error', error }); });
    return () => { cancelled = true; };
  }, [day, lat, lng]);
  if (!fd?.wfpiOn) return null;
  const date = fd.wfpi.validDate;
  let body;
  if (state.status === 'loading') body = <div className="flex items-center gap-2 text-xs text-sentinel-300"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> Looking up WFPI…</div>;
  else if (state.status === 'error') body = <p className="text-xs text-red-300">Couldn&apos;t reach USGS: {state.error.message}</p>;
  else if (!state.v) body = <p className="text-xs text-sentinel-300">No WFPI value here (outside the CONUS grid).</p>;
  else if (state.v.code) body = <p className="text-xs text-sentinel-300">No index here: USGS classes this cell as {state.v.label.toLowerCase()}.</p>;
  else {
    body = (
      <div className="flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded-sm shrink-0 border border-black/30" style={{ backgroundColor: state.v.color }} />
        <span className="text-sm font-semibold text-white tabular-nums">WFPI {state.v.index}</span>
        <span className="text-[11px] text-sentinel-400">on a 0–150 scale</span>
      </div>
    );
  }
  return (
    <section className="mb-4">
      <SectionHead title="Fire potential index (gridded)" kind="model" kindLabel="USGS model" />
      {body}
      <p className="mt-1.5 text-[10px] text-sentinel-500 leading-snug">
        Day {day}{date ? `, valid ${formatForecastDate(date)}` : ''}. A USGS model of vegetation flammability on a ~1 km grid, not an NFDRS index or official rating.{' '}
        <a href={WFPI_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-rose-300 hover:text-rose-200">{WFPI_SOURCE}</a>
      </p>
    </section>
  );
}

// NWCC's sub_category: which part of the plant was sampled.
const PLANT_PART = { New: 'new growth', Old: 'old foliage' };

function SamplesSection({ fire }) {
  const fd = useFireDangerContext();
  if (!fd?.samplesOn) return null;
  const s = fd.samples;
  let site = fire.sampleSite;
  let km = null;
  if (!site && s.data) {
    const near = nearestStation(s.data, fire.lat, fire.lng, 25);
    site = near?.feature.properties ?? null;
    km = near?.km ?? null;
  }
  let body;
  if (!s.data) {
    body = s.error
      ? <p className="text-xs text-red-300">Field samples unavailable: {s.error.message}</p>
      : <div className="flex items-center gap-2 text-xs text-sentinel-300"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> Loading field samples…</div>;
  } else if (!site) {
    body = <p className="text-xs text-sentinel-300">No sampling site within 25 km. Samples are only taken at fixed sites, mostly in WA, OR, ID, MT, WY, SD and ND.</p>;
  } else {
    const today = productDate();
    const fuels = siteFuels(site);
    body = (
      <>
        <div className="text-sm font-semibold text-white leading-tight">{site.name}{site.state ? `, ${site.state}` : ''}</div>
        <p className="text-[11px] text-sentinel-400 mb-2">
          {km != null ? `${km < 1 ? '<1' : Math.round(km)} km from this point · ` : ''}{site.elevation ? `${site.elevation} ft · ` : ''}newest sample {formatForecastDate(site.latestDate)}
        </p>
        <Rows rows={fuels.map((f) => ({
          label: `${f.fuel}${f.part ? ` (${PLANT_PART[f.part] ?? f.part.toLowerCase()})` : ''} · ${formatForecastDate(f.date)} (${ageDays(f.date, today)} d ago)`,
          value: `${Math.round(f.value)}%${f.implausible ? ' ⚠' : ''}`,
        }))} />
        {fuels.some((f) => f.implausible) && (
          <p className="mt-1 text-[10px] text-amber-300">⚠ Above {IMPLAUSIBLE_PCT}%, outside what live plants hold; shown as published, likely an entry error.</p>
        )}
      </>
    );
  }
  return (
    <section className="mb-4">
      <SectionHead title="Live fuel moisture samples" kind="measured" kindLabel="Measured" />
      {body}
      <p className="mt-1.5 text-[10px] text-sentinel-500 leading-snug">
        Field samples for one plant species at one site and date; nothing is estimated between sites or dates.{' '}
        <a href={SAMPLES_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-fuchsia-300 hover:text-fuchsia-200">{SAMPLES_SOURCE}</a>
      </p>
    </section>
  );
}

function StationLookup({ fire }) {
  const fd = useFireDangerContext();
  const st = fd?.stations;
  if (!fd?.stationsOn) return null;
  if (!st.configured) {
    return <p className="mb-4 text-xs text-sentinel-300">Station fire danger isn&apos;t connected on this site yet.</p>;
  }
  if (!st.data) {
    return st.error
      ? <p className="mb-4 text-xs text-red-300">Station fire danger unavailable: {st.error.message}</p>
      : <div className="mb-4 flex items-center gap-2 text-xs text-sentinel-300"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> Loading stations…</div>;
  }
  if (fire.station) return <StationSection station={fire.station} km={null} />;
  const near = nearestStation(st.data, fire.lat, fire.lng);
  if (!near) {
    return <p className="mb-4 text-xs text-sentinel-300">No NFDRS station with current data within 40 km. Values aren&apos;t estimated between stations.</p>;
  }
  return <StationSection station={near.feature.properties} km={near.km} />;
}

export default function FireDangerPointDetail({ fire }) {
  const hasCoords = Number.isFinite(fire.lat) && Number.isFinite(fire.lng);
  return (
    <>
      <div className="mb-4 flex items-start gap-2">
        <div className="mt-0.5 p-1.5 rounded-lg border bg-orange-500/15 border-orange-500/40">
          <Flame size={16} className="text-orange-300" />
        </div>
        <div>
          <h3 className="font-bold text-white text-lg leading-tight">Fire danger &amp; fuels</h3>
          {hasCoords && <p className="text-xs text-sentinel-400 mt-0.5 tabular-nums">{fire.lat.toFixed(4)}, {fire.lng.toFixed(4)}</p>}
        </div>
      </div>

      <FirePotentialSection sfp={fire.sfp} day={fire.sfpDay} fetchedAt={fire.sfpFetchedAt} />
      {hasCoords && <WfpiSection lat={fire.lat} lng={fire.lng} />}
      {hasCoords && <StationLookup fire={fire} />}
      {hasCoords && <SamplesSection fire={fire} />}
      {hasCoords && <FuelModelSection lat={fire.lat} lng={fire.lng} />}

      <p className="text-[10px] text-sentinel-500 leading-snug">
        Gridded NFDRS (ERC, Burning Index, fuel moisture) maps are not connected: no documented source exists yet.
      </p>
    </>
  );
}
