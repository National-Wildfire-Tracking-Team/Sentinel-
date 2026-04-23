/**
 * App.jsx
 * Root component with React Router.
 * Standard pages get the Navbar + Footer layout.
 * The Live Tracker page renders full-screen without them.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import DeferredAnalytics from './components/DeferredScripts/DeferredAnalytics';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const VolunteerPage = lazy(() => import('./pages/VolunteerPage'));
const LiveTrackerPage = lazy(() => import('./pages/LiveTrackerPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ReporterLoginPage = lazy(() => import('./pages/ReporterLoginPage'));
const ReporterRegisterPage = lazy(() => import('./pages/ReporterRegisterPage'));
const ReporterDashboardPage = lazy(() => import('./pages/ReporterDashboardPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ManageZipcodesPage = lazy(() => import('./pages/ManageZipcodesPage'));
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
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DeferredAnalytics />
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
            path="/pricing"
            element={
              <SiteLayout>
                <PricingPage />
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

          {/* Auth pages — full-screen, no Navbar/Footer */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Reporter portal — hidden (not linked in public nav), direct URL only */}
          <Route path="/reporter-login" element={<ReporterLoginPage />} />
          <Route path="/reporter-register" element={<ReporterRegisterPage />} />
          <Route path="/reporter-dashboard" element={<ReporterDashboardPage />} />
          {/* Account settings — protected, not linked in public nav */}
          <Route path="/account" element={<AccountPage />} />
          <Route path="/manage-zipcodes" element={<ManageZipcodesPage />} />
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

          {/* Catch-all: redirect unknown routes to home instead of black screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
