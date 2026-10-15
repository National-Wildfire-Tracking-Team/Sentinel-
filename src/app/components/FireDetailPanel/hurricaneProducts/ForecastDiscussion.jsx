import { nhcAdvisoryUrl, nhcProductUrl } from '../../../api/nhcTropicalWeather';
import { LOADING_TEXT, ProductEmpty, ProductHeading, productLink } from './productParts';

export default function ForecastDiscussion({ storm, model }) {
  const { loaded, tcd } = model.text;
  const links = (
    <div className="mt-2 flex flex-wrap gap-x-5">
      <a href={nhcProductUrl(storm.slot, 'TCD')} target="_blank" rel="noopener noreferrer" className={productLink}>
        Discussion on nhc.noaa.gov
      </a>
      <a href={nhcAdvisoryUrl(storm.slot)} target="_blank" rel="noopener noreferrer" className={productLink}>
        Public advisory
      </a>
    </div>
  );

  if (!loaded) return <ProductEmpty>{LOADING_TEXT}</ProductEmpty>;
  if (!tcd || tcd.discussion.length === 0) {
    return (
      <div>
        <ProductEmpty>No discussion published for this advisory yet.</ProductEmpty>
        {links}
      </div>
    );
  }

  return (
    <div>
      {tcd.keyMessages.length > 0 && (
        <>
          <ProductHeading className="mb-2">Key messages</ProductHeading>
          <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-100">
            {tcd.keyMessages.map((m) => <li key={m}>{m}</li>)}
          </ol>
          <ProductHeading className="mb-2">Discussion</ProductHeading>
        </>
      )}
      <div className="space-y-3 text-sm leading-relaxed text-sentinel-100">
        {tcd.discussion.map((p) => <p key={p}>{p}</p>)}
      </div>
      {links}
    </div>
  );
}
