/**
 * AppContext.jsx
 * Global application state for Sentinel.
 * Manages: layer visibility, selected fire, sidebar, alerts, map state.
 */

import { createContext, useContext, useReducer, useCallback } from 'react';

// ─── Initial State ────────────────────────────────────────────────────────────
const initialState = {
  // Which map data layers are currently visible
  layers: {
    fireHotspots:      true,
    firePerimeters:    true,
    incidentLocations: true,
    aqi:               false,
    weatherAlerts:     true,
    drought:           false,
    smoke:             false,
    goesEast:          false,
    goesWest:          false,
  },
  // Currently clicked/selected fire feature (hotspot or perimeter)
  selectedFire: null,
  // Sidebar open/closed (left panel)
  sidebarOpen: true,
  // Layer control panel open/closed (right panel)
  layerPanelOpen: true,
  // Legend visibility
  legendOpen: true,
  // Active weather alerts list
  alerts: [],
  // Last time data was refreshed
  lastRefreshed: null,
  // Whether any data fetch is in flight
  isLoading: false,
  // Map viewport (controlled)
  viewport: {
    longitude: -114.5,
    latitude:  44.0,
    zoom:      4.5,
  },
};

// ─── Action Types ─────────────────────────────────────────────────────────────
const A = {
  TOGGLE_LAYER:       'TOGGLE_LAYER',
  SET_LAYER:          'SET_LAYER',
  SELECT_FIRE:        'SELECT_FIRE',
  CLEAR_SELECTED:     'CLEAR_SELECTED',
  TOGGLE_SIDEBAR:     'TOGGLE_SIDEBAR',
  TOGGLE_LAYER_PANEL: 'TOGGLE_LAYER_PANEL',
  TOGGLE_LEGEND:      'TOGGLE_LEGEND',
  SET_ALERTS:         'SET_ALERTS',
  SET_LOADING:        'SET_LOADING',
  SET_REFRESHED:      'SET_REFRESHED',
  SET_VIEWPORT:       'SET_VIEWPORT',
};

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case A.TOGGLE_LAYER:
      return {
        ...state,
        layers: { ...state.layers, [action.layer]: !state.layers[action.layer] },
      };
    case A.SET_LAYER:
      return {
        ...state,
        layers: { ...state.layers, [action.layer]: action.value },
      };
    case A.SELECT_FIRE:
      return { ...state, selectedFire: action.fire };
    case A.CLEAR_SELECTED:
      return { ...state, selectedFire: null };
    case A.TOGGLE_SIDEBAR:
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case A.TOGGLE_LAYER_PANEL:
      return { ...state, layerPanelOpen: !state.layerPanelOpen };
    case A.TOGGLE_LEGEND:
      return { ...state, legendOpen: !state.legendOpen };
    case A.SET_ALERTS:
      return { ...state, alerts: action.alerts };
    case A.SET_LOADING:
      return { ...state, isLoading: action.value };
    case A.SET_REFRESHED:
      return { ...state, lastRefreshed: action.time };
    case A.SET_VIEWPORT:
      return { ...state, viewport: { ...state.viewport, ...action.viewport } };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const toggleLayer      = useCallback((layer) => dispatch({ type: A.TOGGLE_LAYER, layer }), []);
  const setLayer         = useCallback((layer, value) => dispatch({ type: A.SET_LAYER, layer, value }), []);
  const selectFire       = useCallback((fire) => dispatch({ type: A.SELECT_FIRE, fire }), []);
  const clearSelected    = useCallback(() => dispatch({ type: A.CLEAR_SELECTED }), []);
  const toggleSidebar    = useCallback(() => dispatch({ type: A.TOGGLE_SIDEBAR }), []);
  const toggleLayerPanel = useCallback(() => dispatch({ type: A.TOGGLE_LAYER_PANEL }), []);
  const toggleLegend     = useCallback(() => dispatch({ type: A.TOGGLE_LEGEND }), []);
  const setAlerts        = useCallback((alerts) => dispatch({ type: A.SET_ALERTS, alerts }), []);
  const setLoading       = useCallback((value) => dispatch({ type: A.SET_LOADING, value }), []);
  const setRefreshed     = useCallback((time = new Date()) => dispatch({ type: A.SET_REFRESHED, time }), []);
  const setViewport      = useCallback((viewport) => dispatch({ type: A.SET_VIEWPORT, viewport }), []);

  /** Fly the map to a specific fire incident */
  const flyToFire = useCallback((incident) => {
    if (!incident?.lat || !incident?.lng) return;
    dispatch({
      type: A.SET_VIEWPORT,
      viewport: { longitude: incident.lng, latitude: incident.lat, zoom: 10 },
    });
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      toggleLayer,
      setLayer,
      selectFire,
      clearSelected,
      toggleSidebar,
      toggleLayerPanel,
      toggleLegend,
      setAlerts,
      setLoading,
      setRefreshed,
      setViewport,
      flyToFire,
    }}>
      {children}
    </AppContext.Provider>
  );
}

/** Hook to consume app context */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}
