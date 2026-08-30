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
    fireHotspots:      false,
    /** NOAA NESDIS NGFS — GOES satellite fire detections */
    ngfsDetections:    false,
    firePerimeters:    false,
    /** CAL FIRE FRAP historical fire perimeter scars */
    calFireHistoricalPerimeters: false,
    incidentLocations: false,
    aqi:               false,
    weatherAlerts:     false,
    smoke:             false,
    goesEast:          false,
    goesWest:          false,
    goesFire16:        false,
    goesFire18:        false,
    stormReports:      false,
    goesFireTemperature: false,
    spcWeatherOutlooks: false,
    fireWeatherOutlooks: false,
    fireRiskOutlook: false,
    radar:             false,
    /** NWS/NOAA NEXRAD Level 2 radar site locations + live operability status */
    nexradSites:       false,
    /** Caltrans District CCTV — live California highway camera locations */
    wildfireCameras:   false,
    evacZones:         true,
    rawsStations:          false,
    airNowMonitors:        false,
    droughtOutlook:        false,
    ndgdSmokeForecast:     false,
    criticalInfrastructure: false,
    /** USGS National Map — colleges/universities (structures layer 56); Pro */
    schoolsUniversities: false,
    /** NHC tropical tracks, cone, and disturbances */
    nhcTropicalWeather: false,
    /** NOAA NWPS water gauges */
    waterGauges: false,
    /** NWS Damage Assessment Toolkit — post-storm survey points/tracks/polygons */
    damageAssessment: false,
    /** Rothermel-based spread projection rings for the selected fire */
    fireBehaviorModeling: false,
  },
  // Currently selected 7-day fire risk forecast (1-7)
  fireRiskDay: 1,
  // Currently clicked/selected fire feature (hotspot or perimeter)
  selectedFire: null,
  // Currently selected water gauge (properties from map feature)
  selectedGauge: null,
  // Currently selected NEXRAD radar site (properties from map feature, incl. lat/lng)
  selectedRadarSite: null,
  // Currently selected California highway camera (properties from map feature, incl. lat/lng)
  selectedCamera: null,
  // Sidebar open/closed (left panel) — closed by default, opened via the top-left corner buttons
  sidebarOpen: false,
  // Layer control panel open/closed (right panel)
  layerPanelOpen: true,
  // Placeholder "future features" panel open/closed (top-left corner button 1)
  futurePanelOpen: false,
  // Account center panel open/closed (top-left corner button 3)
  accountPanelOpen: false,
  // Legend visibility
  legendOpen: true,
  // Active weather alerts list
  alerts: [],
  // Pipeline status for weather alerts (error, loading per-alert-system)
  alertsStatus: { loading: false, error: null, errorDetail: null, lastRefresh: null },
  // Sidebar feed filter: 'all' or 'focused' (hides old/contained fires)
  feedFilter: 'all',
  // Last time data was refreshed
  lastRefreshed: null,
  // Whether any data fetch is in flight
  isLoading: false,
  // Map viewport (controlled)
  viewport: {
    longitude: -114.5,
    latitude:  44.0,
    zoom:      4.5,
    pitch:     0,
    bearing:   0,
  },
  // Whether the user has granted live location (only requested via the locate-me corner button)
  locationGranted: false,
  // Live user location {latitude, longitude}, once granted
  userLocation: null,
};

// ─── Action Types ─────────────────────────────────────────────────────────────
const A = {
  TOGGLE_LAYER:       'TOGGLE_LAYER',
  SET_LAYER:          'SET_LAYER',
  SET_FIRE_RISK_DAY:  'SET_FIRE_RISK_DAY',
  SELECT_FIRE:        'SELECT_FIRE',
  CLEAR_SELECTED:     'CLEAR_SELECTED',
  SELECT_GAUGE:       'SELECT_GAUGE',
  SELECT_RADAR_SITE:  'SELECT_RADAR_SITE',
  SELECT_CAMERA:      'SELECT_CAMERA',
  TOGGLE_SIDEBAR:     'TOGGLE_SIDEBAR',
  TOGGLE_LAYER_PANEL: 'TOGGLE_LAYER_PANEL',
  TOGGLE_FUTURE_PANEL: 'TOGGLE_FUTURE_PANEL',
  TOGGLE_ACCOUNT_PANEL: 'TOGGLE_ACCOUNT_PANEL',
  TOGGLE_LEGEND:      'TOGGLE_LEGEND',
  SET_ALERTS:         'SET_ALERTS',
  SET_ALERTS_STATUS:  'SET_ALERTS_STATUS',
  SET_LOADING:        'SET_LOADING',
  SET_REFRESHED:      'SET_REFRESHED',
  SET_VIEWPORT:       'SET_VIEWPORT',
  SET_FEED_FILTER:    'SET_FEED_FILTER',
  GRANT_LOCATION:     'GRANT_LOCATION',
  SET_USER_LOCATION:  'SET_USER_LOCATION',
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
    case A.SET_FIRE_RISK_DAY:
      return { 
        ...state,
        fireRiskDay: Math.min(
          7,
          Math.max(1, Number(action.day) || 1)
        ),
      };
    case A.SELECT_FIRE:
      return { ...state, selectedFire: action.fire, selectedGauge: null, selectedRadarSite: null, selectedCamera: null };
    case A.CLEAR_SELECTED:
      return { ...state, selectedFire: null, selectedGauge: null, selectedRadarSite: null, selectedCamera: null };
    case A.SELECT_GAUGE:
      return { ...state, selectedGauge: action.gauge, selectedFire: null, selectedRadarSite: null, selectedCamera: null };
    case A.SELECT_RADAR_SITE:
      return { ...state, selectedRadarSite: action.site, selectedFire: null, selectedGauge: null, selectedCamera: null };
    case A.SELECT_CAMERA:
      return { ...state, selectedCamera: action.camera, selectedFire: null, selectedGauge: null, selectedRadarSite: null };
    case A.TOGGLE_SIDEBAR: {
      const next = !state.sidebarOpen;
      return { ...state, sidebarOpen: next, futurePanelOpen: next ? false : state.futurePanelOpen, accountPanelOpen: next ? false : state.accountPanelOpen };
    }
    case A.TOGGLE_LAYER_PANEL:
      return { ...state, layerPanelOpen: !state.layerPanelOpen };
    case A.TOGGLE_FUTURE_PANEL: {
      const next = !state.futurePanelOpen;
      return { ...state, futurePanelOpen: next, sidebarOpen: next ? false : state.sidebarOpen, accountPanelOpen: next ? false : state.accountPanelOpen };
    }
    case A.TOGGLE_ACCOUNT_PANEL: {
      const next = !state.accountPanelOpen;
      return { ...state, accountPanelOpen: next, sidebarOpen: next ? false : state.sidebarOpen, futurePanelOpen: next ? false : state.futurePanelOpen };
    }
    case A.TOGGLE_LEGEND:
      return { ...state, legendOpen: !state.legendOpen };
    case A.SET_ALERTS:
      return { ...state, alerts: action.alerts };
    case A.SET_ALERTS_STATUS:
      return { ...state, alertsStatus: { ...state.alertsStatus, ...action.status } };
    case A.SET_LOADING:
      return { ...state, isLoading: action.value };
    case A.SET_REFRESHED:
      return { ...state, lastRefreshed: action.time };
    case A.SET_VIEWPORT:
      return { ...state, viewport: { ...state.viewport, ...action.viewport } };
    case A.SET_FEED_FILTER:
      return { ...state, feedFilter: action.value };
    case A.GRANT_LOCATION:
      return { ...state, locationGranted: true };
    case A.SET_USER_LOCATION:
      return { ...state, userLocation: action.location };
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
  const setFireRiskDay     = useCallback((day) => dispatch({ type: A.SET_FIRE_RISK_DAY, day }), [] ); 
  const selectFire       = useCallback((fire) => dispatch({ type: A.SELECT_FIRE, fire }), []);
  const clearSelected    = useCallback(() => dispatch({ type: A.CLEAR_SELECTED }), []);
  const selectGauge      = useCallback((gauge) => dispatch({ type: A.SELECT_GAUGE, gauge }), []);
  const selectRadarSite  = useCallback((site) => dispatch({ type: A.SELECT_RADAR_SITE, site }), []);
  const selectCamera     = useCallback((camera) => dispatch({ type: A.SELECT_CAMERA, camera }), []);
  const toggleSidebar    = useCallback(() => dispatch({ type: A.TOGGLE_SIDEBAR }), []);
  const toggleLayerPanel = useCallback(() => dispatch({ type: A.TOGGLE_LAYER_PANEL }), []);
  const toggleFuturePanel = useCallback(() => dispatch({ type: A.TOGGLE_FUTURE_PANEL }), []);
  const toggleAccountPanel = useCallback(() => dispatch({ type: A.TOGGLE_ACCOUNT_PANEL }), []);
  const toggleLegend     = useCallback(() => dispatch({ type: A.TOGGLE_LEGEND }), []);
  const setAlerts        = useCallback((alerts) => dispatch({ type: A.SET_ALERTS, alerts }), []);
  const setAlertsStatus  = useCallback((status) => dispatch({ type: A.SET_ALERTS_STATUS, status }), []);
  const setLoading       = useCallback((value) => dispatch({ type: A.SET_LOADING, value }), []);
  const setRefreshed     = useCallback((time = new Date()) => dispatch({ type: A.SET_REFRESHED, time }), []);
  const setViewport      = useCallback((viewport) => dispatch({ type: A.SET_VIEWPORT, viewport }), []);
  const setFeedFilter    = useCallback((value) => dispatch({ type: A.SET_FEED_FILTER, value }), []);
  const grantLocation    = useCallback(() => dispatch({ type: A.GRANT_LOCATION }), []);
  const setUserLocation  = useCallback((location) => dispatch({ type: A.SET_USER_LOCATION, location }), []);

  /** Fly the map to a specific fire incident */
  const flyToFire = useCallback((incident) => {
    const latitude = Number(incident?.lat);
    const longitude = Number(incident?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    dispatch({
      type: A.SET_VIEWPORT,
      viewport: { longitude, latitude, zoom: 10 },
    });
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      toggleLayer,
      setLayer,
      setFireRiskDay,
      selectFire,
      clearSelected,
      selectGauge,
      selectRadarSite,
      selectCamera,
      toggleSidebar,
      toggleLayerPanel,
      toggleFuturePanel,
      toggleAccountPanel,
      toggleLegend,
      setAlerts,
      setAlertsStatus,
      setLoading,
      setRefreshed,
      setViewport,
      flyToFire,
      setFeedFilter,
      grantLocation,
      setUserLocation,
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
