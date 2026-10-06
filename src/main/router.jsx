/**
 * main/router.jsx
 * Public marketing site routes — rendered on the main domain.
 * Standard pages get the Navbar + Footer layout.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

import Navbar from '../shared/components/Navbar/Navbar';
import { readSharedTheme, applyThemeClass } from '../shared/utils/sharedTheme';
import Footer from '../shared/components/Footer/Footer';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const DisasterResponsePage = lazy(() => import('./pages/disaster-response'));
const DisasterResponsePreparednessPage = lazy(() => import('./pages/disaster-response/PreparednessPage'));
const DisasterResponseRecoveryPage = lazy(() => import('./pages/disaster-response/RecoveryPage'));
const DisasterResponseGetInvolvedPage = lazy(() => import('./pages/disaster-response/GetInvolvedPage'));
const VolunteerPage = lazy(() => import('./pages/VolunteerPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

/** Scroll to top on route change */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Follow the light/dark choice made in the tracker app. index.html applies it
 * before first paint; this re-reads it when the visitor comes back to this tab,
 * in case they switched it in the app meanwhile.
 */
function SharedThemeSync() {
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') applyThemeClass(readSharedTheme() ?? 'dark');
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
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

export default function MainRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <SharedThemeSync />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<SiteLayout><HomePage /></SiteLayout>} />
          <Route path="/about" element={<SiteLayout><AboutPage /></SiteLayout>} />
          <Route path="/disaster-response" element={<SiteLayout><DisasterResponsePage /></SiteLayout>} />
          <Route path="/disaster-response/preparedness" element={<SiteLayout><DisasterResponsePreparednessPage /></SiteLayout>} />
          <Route path="/disaster-response/recovery" element={<SiteLayout><DisasterResponseRecoveryPage /></SiteLayout>} />
          <Route path="/disaster-response/get-involved" element={<SiteLayout><DisasterResponseGetInvolvedPage /></SiteLayout>} />
          <Route path="/volunteer" element={<SiteLayout><VolunteerPage /></SiteLayout>} />
          <Route path="/pricing" element={<SiteLayout><PricingPage /></SiteLayout>} />
          <Route path="/privacy-policy" element={<SiteLayout><PrivacyPolicyPage /></SiteLayout>} />
          <Route path="/terms" element={<SiteLayout><TermsPage /></SiteLayout>} />

          {/* Catch-all: redirect unknown routes to home instead of black screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
