/**
 * AppStatusContext.jsx
 * High-churn "background data" state, isolated from AppContext.
 *
 * alerts/alertsStatus update every ~60s (useWeatherAlerts), isLoading/
 * lastRefreshed flip on essentially every poll tick across ~15 independent
 * data hooks, and userLocation updates on every GPS fix while live location
 * tracking is on. Previously these lived in the same reducer as layers,
 * selectedFire, and every panel-open flag, so each tick re-rendered every
 * useApp() consumer in the app — including every rendered IncidentCard and
 * the full MapView/LiveTrackerPage tree — regardless of whether that
 * consumer read any of this state. Splitting it into its own context (same
 * rationale as ViewportContext) means a background refresh only re-renders
 * the handful of components that actually read it.
 */

import { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

const initialState = {
  // Active weather alerts list
  alerts: [],
  // Pipeline status for weather alerts (error, loading per-alert-system)
  alertsStatus: { loading: false, error: null, errorDetail: null, lastRefresh: null },
  // Last time data was refreshed
  lastRefreshed: null,
  // Whether any data fetch is in flight
  isLoading: false,
  // Live user location {latitude, longitude}, once granted
  userLocation: null,
};

const A = {
  SET_ALERTS:        'SET_ALERTS',
  SET_ALERTS_STATUS: 'SET_ALERTS_STATUS',
  SET_LOADING:       'SET_LOADING',
  SET_REFRESHED:     'SET_REFRESHED',
  SET_USER_LOCATION: 'SET_USER_LOCATION',
};

function reducer(state, action) {
  switch (action.type) {
    case A.SET_ALERTS:
      return { ...state, alerts: action.alerts };
    case A.SET_ALERTS_STATUS:
      return { ...state, alertsStatus: { ...state.alertsStatus, ...action.status } };
    case A.SET_LOADING:
      return { ...state, isLoading: action.value };
    case A.SET_REFRESHED:
      return { ...state, lastRefreshed: action.time };
    case A.SET_USER_LOCATION:
      return { ...state, userLocation: action.location };
    default:
      return state;
  }
}

const AppStatusContext = createContext(null);

export function AppStatusProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setAlerts       = useCallback((alerts) => dispatch({ type: A.SET_ALERTS, alerts }), []);
  const setAlertsStatus = useCallback((status) => dispatch({ type: A.SET_ALERTS_STATUS, status }), []);
  const setLoading      = useCallback((value) => dispatch({ type: A.SET_LOADING, value }), []);
  const setRefreshed    = useCallback((time = new Date()) => dispatch({ type: A.SET_REFRESHED, time }), []);
  const setUserLocation = useCallback((location) => dispatch({ type: A.SET_USER_LOCATION, location }), []);

  const value = useMemo(() => ({
    ...state,
    setAlerts,
    setAlertsStatus,
    setLoading,
    setRefreshed,
    setUserLocation,
  }), [state, setAlerts, setAlertsStatus, setLoading, setRefreshed, setUserLocation]);

  return (
    <AppStatusContext.Provider value={value}>
      {children}
    </AppStatusContext.Provider>
  );
}

/** Hook to consume the app status context */
export function useAppStatus() {
  const ctx = useContext(AppStatusContext);
  if (!ctx) throw new Error('useAppStatus must be used within <AppStatusProvider>');
  return ctx;
}
