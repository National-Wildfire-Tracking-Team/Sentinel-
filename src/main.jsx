/**
 * main.jsx – Application entry point
 *
 * Serves two separate route trees from one build: the marketing site
 * (main domain) and the wildfire tracker app (app.* subdomain). Which
 * one mounts is decided at runtime by hostname, since both are served
 * from the same Netlify site/deploy.
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
const isAppHost = window.location.hostname.startsWith('app.');

const MainRouter = lazy(() => import('./main/router'));
const AppTree = lazy(() => import('./app/AppTree'));

ErrorLogger.init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <DeferredAnalytics />
      <AuthProvider>
        <Suspense fallback={null}>
          {isAppHost ? <AppTree /> : <MainRouter />}
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
