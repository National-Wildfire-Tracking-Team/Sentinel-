/**
 * App.jsx
 * Root component with React Router.
 * Standard pages get the Navbar + Footer layout.
 * The Live Tracker page renders full-screen without them.
 */

import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const VolunteerPage = lazy(() => import('./pages/VolunteerPage'));
const LiveTrackerPage = lazy(() => import('./pages/LiveTrackerPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SubmitReportPage = lazy(() => import('./pages/SubmitReportPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));

/** Scroll to top on route change */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Layout wrapper for pages that use the shared Navbar + Footer */
function SiteLayout({ children }) {
  return (
    <div className="flex flex-col min-h-screen bg-sentinel-900 text-white">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function RouteLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sentinel-200">
      Loading page...
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/* Standard pages with Navbar + Footer */}
          <Route
            path="/"
            element={
              <SiteLayout>
                <HomePage />
              </SiteLayout>
            }
          />
          <Route
            path="/about"
            element={
              <SiteLayout>
                <AboutPage />
              </SiteLayout>
            }
          />
          <Route
            path="/volunteer"
            element={
              <SiteLayout>
                <VolunteerPage />
              </SiteLayout>
            }
          />

          <Route
            path="/privacy-policy"
            element={
              <SiteLayout>
                <PrivacyPolicyPage />
              </SiteLayout>
            }
          />
          <Route
            path="/terms"
            element={
              <SiteLayout>
                <TermsPage />
              </SiteLayout>
            }
          />

          {/* Reporter submission system — full-screen, no Navbar/Footer */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/submit-report" element={<SubmitReportPage />} />
          {/* Account settings — protected, not linked in public nav */}
          <Route path="/account" element={<AccountPage />} />
          <Route
            path="/admin"
            element={
              <SiteLayout>
                <AdminDashboardPage />
              </SiteLayout>
            }
          />

          {/* Full-screen live tracker (no Navbar/Footer) */}
          <Route path="/sentinel" element={<LiveTrackerPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
