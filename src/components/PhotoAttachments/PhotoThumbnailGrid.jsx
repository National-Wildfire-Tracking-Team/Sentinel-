/**
 * PhotoThumbnailGrid.jsx
 * Renders staged photo previews (from useImageAttachments) with a remove
 * button on each. `compact` shrinks the thumbnails for use inline in the
 * smaller "post an update" forms; the default size matches the first-post
 * form's larger attachment grid.
 */

import { X } from 'lucide-react';

export default function PhotoThumbnailGrid({ images, onRemove, compact = false }) {
  if (!images || images.length === 0) return null;

  return (
    <div
      className={
        compact
          ? 'flex flex-wrap gap-2 mt-2'
          : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4'
      }
    >
      {images.map((img, idx) => (
        <div
          key={idx}
          className={`relative group rounded-lg overflow-hidden border border-[#30363d] bg-[#161b22] ${
            compact ? 'w-16 h-16 shrink-0' : ''
          }`}
        >
          <img
            src={img.preview}
            alt={img.name}
            className={compact ? 'w-16 h-16 object-cover' : 'w-full h-24 object-cover'}
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
              className="p-1.5 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              <X size={compact ? 11 : 13} />
            </button>
          </div>
          {!compact && (
            <div className="px-2 py-1 text-[10px] text-[#484f58] truncate bg-[#0d1117]">{img.name}</div>
          )}
        </div>
      ))}
    </div>
  );
}
