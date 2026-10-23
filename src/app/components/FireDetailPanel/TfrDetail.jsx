/**
 * TfrDetail.jsx
 * Detail panel body for a clicked FAA Temporary Flight Restriction (record
 * type 'tfr', built by TfrLayer's buildTfrRecord): what the map layer knows
 * straight away, then the NOTAM's times, altitudes and full text read fresh
 * from the FAA's XNOTAM file.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Plane } from 'lucide-react';
import { fetchTfrDetail, tfrFaaUrl, tfrTypeStyle } from '../../api/tfr';
import { formatRelativeTime } from '../../utils/formatUtils';

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

function SectionLabel({ children }) {
  return <p className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest mb-2">{children}</p>;
}

export default function TfrDetail({ fire }) {
  const style = tfrTypeStyle(fire.tfrType);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTfrDetail(fire.notam, { signal: controller.signal })
      .then(setDetail)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [fire.notam]);

  const place = detail?.city ? `${detail.city}${detail.state ? `, ${detail.state}` : ''}` : fire.state;

  return (
    <div>
      <div className="mb-4 flex items-start gap-2">
        <div className="mt-0.5 p-1.5 rounded-lg border" style={{ backgroundColor: `${style.color}26`, borderColor: `${style.color}4d` }}>
          <Plane size={16} style={{ color: style.color }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white leading-tight">FDC {fire.notam}</h2>
          <p className="text-xs text-sentinel-300 mt-0.5">{style.label} TFR</p>
        </div>
      </div>

      {fire.title && <p className="text-sm text-sentinel-100 mb-4 leading-snug">{fire.title}</p>}

      <SectionLabel>Restriction</SectionLabel>
      <Rows>
        <Row label="Effective" value={detail?.effective} />
        <Row label="Expires" value={detail ? (detail.expire ?? 'Until further notice') : null} />
        <Row label="Regulation" value={detail?.regulation ? `14 CFR ${detail.regulation}` : null} />
        <Row label="Location" value={place} />
        <Row label="Facility" value={detail?.facility ?? fire.facility} />
        <Row label="Updated" value={fire.modified ? formatRelativeTime(fire.modified) : null} />
      </Rows>

      {detail?.areas?.length > 0 && (
        <>
          <SectionLabel>Airspace</SectionLabel>
          <Rows>
            {detail.areas.map((a, i) => (
              <Row
                key={`${a.name}-${i}`}
                label={a.name || `Area ${i + 1}`}
                value={a.lower || a.upper ? `${a.lower ?? '?'} to ${a.upper ?? '?'}` : null}
              />
            ))}
          </Rows>
        </>
      )}

      {!detail && !error && <p className="text-xs text-sentinel-400 mb-4">Loading NOTAM from the FAA…</p>}
      {error && <p className="text-xs text-red-400 mb-4">Couldn't load the NOTAM details ({error}).</p>}

      {detail?.text && (
        <>
          <SectionLabel>NOTAM text</SectionLabel>
          <pre className="mb-4 rounded-lg bg-black/30 border border-sentinel-700 p-2.5 text-[11px] leading-relaxed text-sentinel-100 font-mono whitespace-pre-wrap break-words select-text">
            {detail.text}
          </pre>
        </>
      )}

      <a
        href={tfrFaaUrl(fire.notam)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
      >
        Open on tfr.faa.gov <ExternalLink size={12} />
      </a>
      <p className="text-[10px] text-sentinel-500 mt-3 leading-snug">
        For situational awareness only. Pilots: get an official briefing (1800wxbrief.com) before flight.
      </p>
    </div>
  );
}
