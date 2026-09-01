/**
 * app/router.jsx
 * Wildfire tracker application routes — rendered on the app subdomain.
 * The live tracker is the app's root; all pages render full-screen
 * without the public marketing Navbar/Footer.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

const LiveTrackerPage = lazy(() => import('./pages/LiveTrackerPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ReporterLoginPage = lazy(() => import('./pages/ReporterLoginPage'));
const ReporterRegisterPage = lazy(() => import('./pages/ReporterRegisterPage'));
const ReporterDashboardPage = lazy(() => import('./pages/ReporterDashboardPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ManageZipcodesPage = lazy(() => import('./pages/ManageZipcodesPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const ErrorTestPage = lazy(() => import('./pages/ErrorTestPage'));

/** Scroll to top on route change */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RouteLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/* Full-screen live tracker — app root */}
          <Route path="/" element={<LiveTrackerPage />} />

          {/* Auth pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Reporter portal — hidden (not linked in public nav), direct URL only */}
          <Route path="/reporter-login" element={<ReporterLoginPage />} />
          <Route path="/reporter-register" element={<ReporterRegisterPage />} />
          <Route path="/reporter-dashboard" element={<ReporterDashboardPage />} />

          {/* Account settings — protected, not linked in public nav */}
          <Route path="/account" element={<AccountPage />} />
          <Route path="/manage-zipcodes" element={<ManageZipcodesPage />} />

          {/* Admin — protected (see AdminDashboardPage's own auth/role gate), never exposed on the main domain */}
          <Route path="/admin" element={<AdminDashboardPage />} />

          {/* Test-only route for ErrorBoundary e2e testing */}
          <Route path="/error-test" element={<ErrorTestPage />} />

          {/* Catch-all: redirect unknown routes to the tracker instead of black screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
