/**
 * app/router.jsx
 * Wildfire tracker application routes — rendered on the app subdomain.
 * The live tracker is the app's root; all pages render full-screen
 * without the public marketing Navbar/Footer.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { getReporterOrigin } from '../shared/utils/getAppOrigin';

const LiveTrackerPage = lazy(() => import('./pages/LiveTrackerPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ManageZipcodesPage = lazy(() => import('./pages/ManageZipcodesPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const DeploymentsPage = lazy(() => import('./pages/DeploymentsPage'));
const VolunteerProfilePage = lazy(() => import('./pages/VolunteerProfilePage'));
const ManageDeploymentsPage = lazy(() => import('./pages/ManageDeploymentsPage'));
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

/**
 * Backward-compat for old bookmarks/links to the reporter portal's former
 * paths on the app subdomain — the portal now lives on its own subdomain
 * (reporter.nationalwildfiretrackingteam.org), so redirect there instead of
 * rendering it here.
 */
function ReporterPortalRedirect({ reporterPath }) {
  useEffect(() => {
    window.location.replace(`${getReporterOrigin()}${reporterPath}`);
  }, [reporterPath]);
  return <RouteLoader />;
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

          {/* Reporter portal moved to its own subdomain — redirect old bookmarks/links */}
          <Route path="/reporter-login" element={<ReporterPortalRedirect reporterPath="/login" />} />
          <Route path="/reporter-register" element={<ReporterPortalRedirect reporterPath="/register" />} />
          <Route path="/reporter-dashboard" element={<ReporterPortalRedirect reporterPath="/" />} />

          {/* Account settings — protected, not linked in public nav */}
          <Route path="/account" element={<AccountPage />} />
          <Route path="/manage-zipcodes" element={<ManageZipcodesPage />} />

          {/* Admin — protected (see AdminDashboardPage's own auth/role gate), never exposed on the main domain */}
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/deployments" element={<ManageDeploymentsPage />} />

          {/* Disaster Response volunteer program */}
          <Route path="/deployments" element={<DeploymentsPage />} />
          <Route path="/volunteer-profile" element={<VolunteerProfilePage />} />

          {/* Test-only route for ErrorBoundary e2e testing */}
          <Route path="/error-test" element={<ErrorTestPage />} />

          {/* Catch-all: redirect unknown routes to the tracker instead of black screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
