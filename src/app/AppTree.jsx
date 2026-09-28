/**
 * AppTree.jsx
 * The tracker app's provider stack + router, split into its own module so
 * main.jsx can lazy-load it only for app.* visitors (see main.jsx) instead
 * of always importing it alongside the marketing site's MainRouter.
 */

import { ThemeProvider } from './context/ThemeContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { AppProvider } from './context/AppContext';
import { AppStatusProvider } from './context/AppStatusContext';
import { HomeSetupProvider } from './context/HomeSetupContext';
import { ViewportProvider } from './context/ViewportContext';
import PreventPinchZoom from '../shared/components/PreventPinchZoom';
import AppRouter from './router';

export default function AppTree() {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <AppProvider>
          <AppStatusProvider>
            <HomeSetupProvider>
              <ViewportProvider>
                <PreventPinchZoom />
                <AppRouter />
              </ViewportProvider>
            </HomeSetupProvider>
          </AppStatusProvider>
        </AppProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
