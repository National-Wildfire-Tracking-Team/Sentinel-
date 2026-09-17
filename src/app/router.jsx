/**
 * app/router.jsx
 * Wildfire tracker application routes — rendered on the app subdomain.
 * The live tracker is the app's root; all pages render full-screen
 * without the public marketing Navbar/Footer.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { getReporterOrigin } from '../shared/utils/getAppOrigin';
import { supabase } from '../shared/api/supabaseClient';
import Seo from '../shared/components/Seo';

const LiveTrackerPage = lazy(() => import('./pages/LiveTrackerPage'));
const FireIncidentPage = lazy(() => import('./pages/FireIncidentPage'));
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
 * rendering it here. Also the actual target LoginPage.jsx sends a freshly
 * signed-in reporter/admin to (see its role check), so this doubles as the
 * one spot handling that handoff.
 *
 * The reporter subdomain is a different origin with its own
 * localStorage/sessionStorage — a signed-in session on app.* can't reach it
 * on its own, so a signed-in visitor's tokens are carried across in the
 * redirect URL's hash, in Supabase's own implicit-grant callback format
 * (access_token/refresh_token/expires_in/token_type). The reporter
 * subdomain's Supabase client already has `detectSessionInUrl: true` (see
 * supabaseClient.js) and picks this up automatically on load — the same
 * mechanism Supabase uses for magic-link/OAuth redirects, just reused here
 * for a same-app cross-subdomain handoff instead of a provider redirect.
 * A visitor with no session (or an old bookmark) just lands there logged
 * out, same as visiting the reporter subdomain directly.
 */
function ReporterPortalRedirect({ reporterPath }) {
  useEffect(() => {
    (async () => {
      const target = new URL(`${getReporterOrigin()}${reporterPath}`);
      const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
      const session = data?.session;
      if (session?.access_token && session?.refresh_token) {
        target.hash = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: String(session.expires_in ?? 3600),
          token_type: session.token_type ?? 'bearer',
          type: 'magiclink',
        }).toString();
      }
      window.location.replace(target.toString());
    })();
  }, [reporterPath]);
  return (
    <>
      <Seo noindex />
      <RouteLoader />
    </>
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

          {/* Standalone, shareable, indexable overview for a single fire */}
          <Route path="/fire/:id" element={<FireIncidentPage />} />

          {/* Auth pages — noindex: thin forms with no standalone search value */}
          <Route path="/login" element={<><Seo title="Sign In | Sentinel" noindex /><LoginPage /></>} />
          <Route path="/register" element={<><Seo title="Create Account | Sentinel" noindex /><RegisterPage /></>} />

          {/* Reporter portal moved to its own subdomain — redirect old bookmarks/links */}
          <Route path="/reporter-login" element={<ReporterPortalRedirect reporterPath="/login" />} />
          <Route path="/reporter-register" element={<ReporterPortalRedirect reporterPath="/register" />} />
          <Route path="/reporter-dashboard" element={<ReporterPortalRedirect reporterPath="/" />} />

          {/* Account settings — protected, not linked in public nav, noindex */}
          <Route path="/account" element={<><Seo title="Account Settings | Sentinel" noindex /><AccountPage /></>} />
          <Route path="/manage-zipcodes" element={<><Seo title="Manage Alert Zip Codes | Sentinel" noindex /><ManageZipcodesPage /></>} />

          {/* Admin — protected (see AdminDashboardPage's own auth/role gate), never exposed on the main domain, noindex */}
          <Route path="/admin" element={<><Seo title="Admin Dashboard | Sentinel" noindex /><AdminDashboardPage /></>} />
          <Route path="/admin/deployments" element={<><Seo title="Manage Deployments | Sentinel" noindex /><ManageDeploymentsPage /></>} />

          {/* Disaster Response volunteer program — public content */}
          <Route
            path="/deployments"
            element={(
              <>
                <Seo
                  title="Disaster Response Deployments | NWTT"
                  description="Browse upcoming disaster-response deployment opportunities and volunteer signups from the National Wildfire Tracking Team."
                  path="/deployments"
                />
                <DeploymentsPage />
              </>
            )}
          />
          <Route path="/volunteer-profile" element={<><Seo title="Volunteer Profile | Sentinel" noindex /><VolunteerProfilePage /></>} />

          {/* Test-only route for ErrorBoundary e2e testing, noindex */}
          <Route path="/error-test" element={<><Seo noindex /><ErrorTestPage /></>} />

          {/* Catch-all: redirect unknown routes to the tracker instead of black screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
