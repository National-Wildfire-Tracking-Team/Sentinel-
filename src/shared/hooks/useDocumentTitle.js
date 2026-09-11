import { useEffect } from 'react';

/**
 * Sets `document.title` for the current page/view.
 * Pass a value that changes (e.g. based on active tab or view state) to
 * keep the title in sync with what's actually on screen — useful for
 * Google Analytics page/event reporting on single-route, multi-view pages.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
