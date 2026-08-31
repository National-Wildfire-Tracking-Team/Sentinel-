/**
 * main.jsx – Application entry point
 *
 * Serves two separate route trees from one build: the marketing site
 * (main domain) and the wildfire tracker app (app.* subdomain). Which
 * one mounts is decided at runtime by hostname, since both are served
 * from the same Netlify site/deploy.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ErrorBoundary from './shared/components/ErrorBoundary';
import DeferredAnalytics from './shared/components/DeferredScripts/DeferredAnalytics';
import { ErrorLogger } from './shared/services/error-logger';
import { AuthProvider } from './shared/context/AuthContext';
import { ThemeProvider } from './app/context/ThemeContext';
import { AppProvider } from './app/context/AppContext';
import MainRouter from './main/router';
import AppRouter from './app/router';

ErrorLogger.init();

const isAppHost = window.location.hostname.startsWith('app.');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <DeferredAnalytics />
      <AuthProvider>
        {isAppHost ? (
          <ThemeProvider>
            <AppProvider>
              <AppRouter />
            </AppProvider>
          </ThemeProvider>
        ) : (
          <MainRouter />
        )}
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
