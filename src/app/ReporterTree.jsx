/**
 * ReporterTree.jsx
 * The reporter portal's router, split into its own module so main.jsx can
 * lazy-load it only for reporter.* visitors (see main.jsx) instead of
 * pulling in the tracker app's map/theme/viewport providers, which the
 * reporter dashboard never uses.
 *
 * Routes are un-prefixed (/, /login, /register) since the subdomain itself
 * already scopes them to the reporter portal.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

const ReporterDashboardPage = lazy(() => import('./pages/reporter-dashboard'));
const ReporterLoginPage = lazy(() => import('./pages/ReporterLoginPage'));
const ReporterRegisterPage = lazy(() => import('./pages/ReporterRegisterPage'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sentinel-900">
      <div className="w-8 h-8 rounded-full border-2 border-fire-500 border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}

export default function ReporterTree() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<ReporterDashboardPage />} />
          <Route path="/login" element={<ReporterLoginPage />} />
          <Route path="/register" element={<ReporterRegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
