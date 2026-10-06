import { ProductEmpty, Swatch } from './productParts';

export default function WatchesWarnings({ model }) {
  const { watchWarnings } = model;
  return (
    <div>
      {watchWarnings.length === 0 ? (
        <ProductEmpty>No coastal watches or warnings for this storm.</ProductEmpty>
      ) : (
        <ul className="space-y-2.5">
          {watchWarnings.map((w) => (
            <li key={w.type} className="rounded-[10px] bg-[#161a20] px-4 py-3">
              <p className="flex items-center gap-2.5 text-[15px] font-semibold text-white">
                <Swatch color={w.color} />
                {w.type}
              </p>
              {w.areas ? (
                <ul className="mt-1 space-y-0.5 text-sm text-sentinel-100">
                  {w.areas.map((area) => <li key={area}>{area}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-sentinel-100 tabular-nums">
                  {w.segments} coastline {w.segments === 1 ? 'segment' : 'segments'} · shown on the map
                </p>
              )}
              {(w.advisoryNum || w.advisoryDate) && (
                <p className="mt-0.5 text-[13px] text-sentinel-200 tabular-nums">
                  {w.advisoryNum && `Advisory ${w.advisoryNum}`}
                  {w.advisoryNum && w.advisoryDate && ' · '}
                  {w.advisoryDate && `Issued ${w.advisoryDate}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[13px] leading-relaxed text-sentinel-200">
        U.S. storm surge watches and warnings are also issued as NWS alerts and appear on the weather alerts layer.
      </p>
    </div>
  );
}
