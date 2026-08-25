/**
 * PhotoPickerButton.jsx
 * Compact "Add Photos" control for the update-posting forms (IncidentCard,
 * ExternalIncidentUpdatePanel, IncidentTimeline's ComposeBox) — a small
 * button + hidden file input + thumbnail row. Pairs with useImageAttachments.
 */

import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import PhotoThumbnailGrid from './PhotoThumbnailGrid';

export default function PhotoPickerButton({ images, addFiles, removeImage, error, label = 'Add Photos' }) {
  const fileInputRef = useRef(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                   text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#484f58] transition-colors"
      >
        <ImagePlus size={13} />
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
      <PhotoThumbnailGrid images={images} onRemove={removeImage} compact />
    </div>
  );
}
