import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/auth/AuthContext';
import { AlertSettingsProvider } from '@/context/AlertSettingsContext';
import { HomeSetupProvider } from '@/context/HomeSetupContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { colors } from '@/theme';

// Sentinel is dark-only, like the web app's live map.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, primary: colors.fire500 },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <AuthProvider>
          <PreferencesProvider>
          <HomeSetupProvider>
          <AlertSettingsProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen
              name="account"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.6, 0.95],
                sheetGrabberVisible: true,
                contentStyle: { backgroundColor: colors.surface },
              }}
            />
            <Stack.Screen
              name="places"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.75, 0.95],
                sheetGrabberVisible: true,
                contentStyle: { backgroundColor: colors.surface },
              }}
            />
          </Stack>
          </AlertSettingsProvider>
          </HomeSetupProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
