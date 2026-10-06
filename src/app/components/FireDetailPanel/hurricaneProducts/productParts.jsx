/**
 * productParts.jsx
 * Building blocks shared by the hurricane panel's NHC product views.
 */

/** Heading for a block inside a product (11px uppercase, like the rail's). */
export function ProductHeading({ children, className = '' }) {
  return (
    <h4 className={`text-[11px] font-semibold uppercase tracking-[0.1em] text-sentinel-200 ${className}`}>{children}</h4>
  );
}

/** One muted line standing in for a product (or part) with no data. */
export function ProductEmpty({ children }) {
  return <p className="text-sm text-sentinel-200">{children}</p>;
}

/** Small colored square, as in the map legend. */
export function Swatch({ color, size = 12 }) {
  return (
    <span
      className="inline-block shrink-0 rounded-[3px] border border-white/10"
      style={{ backgroundColor: color, width: size, height: size }}
      aria-hidden
    />
  );
}

/** Pill-style single choice (44px hit target around a 32px pill). */
export function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className="inline-flex min-h-[44px] items-center"
          >
            <span
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold tabular-nums transition-colors
                ${active
                  ? 'border-fire-600 bg-fire-600/10 text-white'
                  : 'border-sentinel-500 text-sentinel-100 hover:bg-sentinel-700'}`}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const productLink = 'inline-flex items-center min-h-[44px] text-sm font-semibold text-fire-400 hover:text-fire-300';

export const LOADING_TEXT = 'Loading from the National Hurricane Center…';
