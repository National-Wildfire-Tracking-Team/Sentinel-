/**
 * main.jsx – Application entry point
 *
 * Serves three separate route trees from one build: the marketing site
 * (main domain), the wildfire tracker app (app.* subdomain), and the
 * reporter portal (reporter.* subdomain). Which one mounts is decided at
 * runtime by hostname, since all three are served from the same Netlify
 * site/deploy.
 */

import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ErrorBoundary from './shared/components/ErrorBoundary';
import DeferredAnalytics from './shared/components/DeferredScripts/DeferredAnalytics';
import { ErrorLogger } from './shared/services/error-logger';
import { AuthProvider } from './shared/context/AuthContext';

// Hostname is fixed for the life of the page, so only the router tree the
// visitor actually needs (and its module graph — page chunks, Navbar/Footer,
// the app's context providers) should be fetched, not both.
const isReporterHost = window.location.hostname.startsWith('reporter.');
const isAppHost = window.location.hostname.startsWith('app.');

const MainRouter = lazy(() => import('./main/router'));
const AppTree = lazy(() => import('./app/AppTree'));
const ReporterTree = lazy(() => import('./app/ReporterTree'));

ErrorLogger.init();

// A tab opened before a deploy still references the previous build's chunk
// filenames, which no longer exist. Vite raises vite:preloadError when such a
// dynamic import fails; reload once to pick up the new index.html. The
// sessionStorage stamp stops a reload loop if the chunk is genuinely broken.
const RELOAD_KEY = 'chunk-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    // storage unavailable — fall through and let the error surface
  }
  if (Date.now() - last < 10_000) return;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <DeferredAnalytics />
      <AuthProvider>
        <Suspense fallback={null}>
          {isReporterHost ? <ReporterTree /> : isAppHost ? <AppTree /> : <MainRouter />}
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
