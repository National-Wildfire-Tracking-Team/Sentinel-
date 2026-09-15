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
import { Capacitor } from '@capacitor/core';
import './index.css';
import ErrorBoundary from './shared/components/ErrorBoundary';
import DeferredAnalytics from './shared/components/DeferredScripts/DeferredAnalytics';
import { ErrorLogger } from './shared/services/error-logger';
import { AuthProvider } from './shared/context/AuthContext';

// The Capacitor native shell has one fixed origin (capacitor://localhost or
// https://localhost) that matches none of the hostname prefixes below, and
// it only ever bundles the tracker app — so it skips the hostname sniff
// entirely and always mounts AppTree.
const isNative = Capacitor.isNativePlatform();

// Hostname is fixed for the life of the page, so only the router tree the
// visitor actually needs (and its module graph — page chunks, Navbar/Footer,
// the app's context providers) should be fetched, not both.
const isReporterHost = !isNative && window.location.hostname.startsWith('reporter.');
const isAppHost = isNative || window.location.hostname.startsWith('app.');

const MainRouter = lazy(() => import('./main/router'));
const AppTree = lazy(() => import('./app/AppTree'));
const ReporterTree = lazy(() => import('./app/ReporterTree'));

ErrorLogger.init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {!isNative && <DeferredAnalytics />}
      <AuthProvider>
        <Suspense fallback={null}>
          {isReporterHost ? <ReporterTree /> : isAppHost ? <AppTree /> : <MainRouter />}
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
