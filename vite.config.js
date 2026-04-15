import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Allow environment variables with VITE_ prefix
  // Copy .env.example to .env and fill in your API keys
  define: {
    global: 'globalThis',
  },
  server: {
    port: 3000,
    // NOTE: NASA FIRMS, AirNow, and Mapbox geocoding are now proxied through
    // Supabase edge functions – no local proxy rules needed for those APIs.
  },
});
