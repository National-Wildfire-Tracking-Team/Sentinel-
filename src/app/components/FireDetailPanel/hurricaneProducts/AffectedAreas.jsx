import { useEffect, useState } from 'react';
import { affectedCounties } from '../hurricaneModel';
import { ProductEmpty, ProductHeading, Swatch } from './productParts';

// ~3,200 counties; only loaded once someone opens this product.
let populationTable = null;
function loadPopulationTable() {
  populationTable ??= import('../../../data/countyPopulation.json').then((m) => m.default);
  return populationTable;
}

function useCountyPopulations() {
  const [table, setTable] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadPopulationTable()
      .then((t) => { if (!cancelled) setTable(t); })
      .catch(() => { if (!cancelled) setTable({ counties: {} }); });
    return () => { cancelled = true; };
  }, []);
  return table;
}

const formatPeople = (n) => n.toLocaleString('en-US');

function Metric({ label, value }) {
  return (
    <div className="rounded-[10px] bg-[#161a20] px-4 py-3">
      <p className="text-[13px] leading-snug text-sentinel-200">{label}</p>
      {value != null
        ? <p className="mt-1 text-[22px] font-semibold leading-tight text-white tabular-nums">{value}</p>
        : <p className="mt-1 text-sm text-sentinel-200">No data</p>}
    </div>
  );
}

export default function AffectedAreas({ model }) {
  const table = useCountyPopulations();
  const { alerts, alertsLoaded } = model.affected;

  if (!alertsLoaded) return <ProductEmpty>Loading NWS alerts…</ProductEmpty>;
  if (alerts.length === 0) return <ProductEmpty>No U.S. counties under tropical watches or warnings.</ProductEmpty>;

  const { counties, tsWarningPopulation, hurricaneWatchPopulation } = affectedCounties(alerts, table?.counties);
  const people = (n) => (n != null ? formatPeople(n) : null);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <Metric label="People in counties under a tropical storm warning" value={people(tsWarningPopulation)} />
        <Metric label="People in counties under a hurricane watch" value={people(hurricaneWatchPopulation)} />
        <Metric label="People in evacuation zones" value={null} />
        <Metric label="Counties affected" value={counties.length} />
      </div>

      <ProductHeading className="mt-6 mb-1">Counties</ProductHeading>
      <ul>
        {counties.map((c) => (
          <li key={c.fips} className="grid grid-cols-[12px_1fr_auto] items-center gap-3 border-b border-sentinel-700 py-2.5 text-sm">
            <Swatch color={c.color} />
            <span>
              <span className="block font-semibold text-white">{c.name ?? `County ${c.fips}`}</span>
              <span className="block text-[13px] text-sentinel-200">{c.type}</span>
            </span>
            <span className="text-right text-sentinel-100 tabular-nums">{c.population != null ? formatPeople(c.population) : ''}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] leading-relaxed text-sentinel-200">
        From active NWS alerts.{' '}
        {table?.source
          ? `Population: ${table.source}. Counts are whole counties, including parts outside the alert.`
          : 'County populations haven’t been loaded yet.'}
      </p>
    </div>
  );
}
