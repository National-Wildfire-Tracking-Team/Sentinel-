/**
 * App.jsx
 * Root component with React Router.
 * Standard pages get the Navbar + Footer layout.
 * The Live Tracker page renders full-screen without them.
 */

import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';

import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import VolunteerPage from './pages/VolunteerPage';
import LiveTrackerPage from './pages/LiveTrackerPage';

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

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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

        {/* Full-screen live tracker (no Navbar/Footer) */}
        <Route path="/live-tracker" element={<LiveTrackerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
