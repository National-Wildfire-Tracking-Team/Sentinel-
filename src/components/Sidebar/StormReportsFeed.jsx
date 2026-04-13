/**
 * StormReportsFeed.jsx
 * Live storm reports feed (SPC + IEM) for weather tracking mode.
 */

import { useMemo } from 'react';
import { Loader2, AlertCircle, RadioTower } from 'lucide-react';

const TYPE_COLORS = {
  Tornado: 'text-red-300 border-red-700/60 bg-red-950/40',
  Hail: 'text-blue-300 border-blue-700/60 bg-blue-950/40',
  Wind: 'text-amber-300 border-amber-700/60 bg-amber-950/40',
};

function Row({ report }) {
  const colorClass = TYPE_COLORS[report.reportType] || 'text-sentinel-100 border-sentinel-600 bg-sentinel-800/60';
  return (
    <div className="rounded-lg border border-sentinel-700 bg-sentinel-800/70 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${colorClass}`}>
          {report.reportType}
        </span>
        <span className="text-[10px] text-sentinel-300">{report.source}</span>
      </div>
      <div className="mt-1 text-xs text-white font-medium">
        {report.city ? `${report.city}, ` : ''}{report.state}
      </div>
      <div className="text-[11px] text-sentinel-300">
        {report.county ? `${report.county} County · ` : ''}
        {new Date(report.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {report.magnitude ? ` · Mag ${report.magnitude}` : ''}
      </div>
      {report.comments && (
        <div className="text-[11px] text-sentinel-300 mt-1 line-clamp-2">{report.comments}</div>
      )}
    </div>
  );
}

export default function StormReportsFeed({ spcReports, iemReports, loading, error }) {
  const merged = useMemo(
    () => [...spcReports, ...iemReports].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)),
    [spcReports, iemReports],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sentinel-200">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading storm reports…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Could not load storm reports.</span>
          </div>
        )}

        {!loading && !error && merged.length === 0 && (
          <div className="text-center py-8 text-sentinel-300 text-sm flex flex-col items-center gap-2">
            <RadioTower size={18} />
            <span>No storm reports available.</span>
          </div>
        )}

        {!loading && !error && merged.map((report) => (
          <Row key={`${report.source}-${report.id}`} report={report} />
        ))}
      </div>
    </div>
  );
}
