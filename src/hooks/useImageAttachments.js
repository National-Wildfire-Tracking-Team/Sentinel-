/**
 * useImageAttachments.js
 * Client-side staging for photos a reporter is about to attach to an
 * incident report or update: tracks selected files + object-URL previews,
 * enforces count/size/type limits, and hands back plain File objects for
 * the caller to upload (see src/api/incidentPhotos.js) once the surrounding
 * form actually submits.
 */

import { useCallback, useState } from 'react';
import { MAX_PHOTOS_PER_POST, MAX_PHOTO_BYTES, isAllowedPhotoFile } from '../api/incidentPhotos';

export function useImageAttachments() {
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);

  const addFiles = useCallback((files) => {
    setError(null);
    const incoming = Array.from(files).filter(isAllowedPhotoFile);

    setImages((prev) => {
      const oversized = incoming.some((f) => f.size > MAX_PHOTO_BYTES);
      if (oversized) {
        setError('Some photos are larger than 8 MB and were skipped.');
      }
      const accepted = incoming.filter((f) => f.size <= MAX_PHOTO_BYTES);

      const room = MAX_PHOTOS_PER_POST - prev.length;
      if (accepted.length > room) {
        setError(`Only ${MAX_PHOTOS_PER_POST} photos are allowed per post.`);
      }
      const toAdd = accepted.slice(0, Math.max(room, 0));

      return [
        ...prev,
        ...toAdd.map((file) => ({ file, preview: URL.createObjectURL(file), name: file.name })),
      ];
    });
  }, []);

  const removeImage = useCallback((idx) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const reset = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    setError(null);
  }, []);

  return { images, addFiles, removeImage, reset, error };
}
