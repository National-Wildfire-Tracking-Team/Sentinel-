/**
 * ViewportContext.jsx
 * Map viewport (camera) state, isolated from AppContext.
 *
 * The map fires onMove continuously during pan/zoom/pitch/rotate — many
 * times per second. Previously viewport lived in the same reducer as
 * everything else (layers, selectedFire, sidebar, alerts, ...), so every
 * drag frame re-rendered every useApp() consumer in the app (~19 components,
 * including off-screen sidebar panels). Splitting it into its own context
 * means panning only re-renders the handful of components that actually
 * read the viewport.
 */

import { createContext, useContext, useReducer, useCallback } from 'react';

const initialViewport = {
  longitude: -114.5,
  latitude:  44.0,
  zoom:      4.5,
  pitch:     0,
  bearing:   0,
};

function reducer(state, action) {
  return { ...state, ...action.viewport };
}

const ViewportContext = createContext(null);

export function ViewportProvider({ children }) {
  const [viewport, dispatch] = useReducer(reducer, initialViewport);

  const setViewport = useCallback((viewport) => dispatch({ viewport }), []);

  /** Fly the map to a specific fire incident */
  const flyToFire = useCallback((incident) => {
    const latitude = Number(incident?.lat);
    const longitude = Number(incident?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    dispatch({ viewport: { longitude, latitude, zoom: 10 } });
  }, []);

  return (
    <ViewportContext.Provider value={{ viewport, setViewport, flyToFire }}>
      {children}
    </ViewportContext.Provider>
  );
}

/** Hook to consume viewport context */
export function useViewport() {
  const ctx = useContext(ViewportContext);
  if (!ctx) throw new Error('useViewport must be used within <ViewportProvider>');
  return ctx;
}
