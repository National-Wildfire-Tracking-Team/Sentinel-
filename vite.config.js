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
    // Proxy API requests to avoid CORS issues in development
    proxy: {
      '/api/airnow': {
        target: 'https://www.airnowapi.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/airnow/, ''),
      },
      '/api/firms': {
        target: 'https://firms.modaps.eosdis.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/firms/, ''),
      },
    },
  },
});
