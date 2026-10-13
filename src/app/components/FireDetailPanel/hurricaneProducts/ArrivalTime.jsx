import { useState } from 'react';
import { formatHoursFromNow } from '../hurricaneModel';
import { LOADING_TEXT, ProductEmpty, SegmentedControl } from './productParts';

const MODES = [
  { value: 'likely', label: 'Most likely' },
  { value: 'earliest', label: 'Earliest reasonable' },
];

export default function ArrivalTime({ model, now }) {
  const [mode, setMode] = useState('likely');
  const rows = model.arrival[mode];

  return (
    <div>
      <SegmentedControl label="Arrival scenario" value={mode} onChange={setMode} options={MODES} />
      <p className="mt-2 text-[13px] text-sentinel-200">
        When tropical-storm-force winds could first arrive. Each time is a contour on the map.
      </p>
      <div className="mt-4">
        {!model.arrival.fetched ? (
          <ProductEmpty>{LOADING_TEXT}</ProductEmpty>
        ) : rows.length === 0 ? (
          <ProductEmpty>No arrival times published for this storm.</ProductEmpty>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.label} className="grid grid-cols-[1fr_auto] gap-3 border-b border-sentinel-700 py-2.5 text-sm">
                <span className="font-semibold text-white tabular-nums">{r.label}</span>
                <span className="text-sentinel-200 tabular-nums">{r.at ? formatHoursFromNow(r.at, now) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
