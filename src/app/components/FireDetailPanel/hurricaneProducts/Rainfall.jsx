import { WATCH_WARNING_COLORS } from '../../../api/nhcTropicalWeather';
import { LOADING_TEXT, ProductEmpty } from './productParts';

// The public advisory's RAINFALL section: totals by area and flash-flood risk.
export default function Rainfall({ model }) {
  const { loaded, tcp } = model.text;
  if (!loaded) return <ProductEmpty>{LOADING_TEXT}</ProductEmpty>;
  if (!tcp?.rainfall) return <ProductEmpty>No rainfall statement in this advisory.</ProductEmpty>;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-100">
      {tcp.rainfall.split('\n\n').map((p) => <p key={p}>{p}</p>)}
      <p className="border-l-2 pl-3 text-[13px] text-sentinel-200" style={{ borderColor: WATCH_WARNING_COLORS['Tropical Storm Warning'] }}>
        Heavy rain can cause flash flooding well inland and far from the center. Follow your local NWS office.
      </p>
    </div>
  );
}
