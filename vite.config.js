import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mapbox': ['mapbox-gl', 'react-map-gl'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-utils': ['date-fns', 'lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      // OSM temporary road closures API — avoid mixed-content redirect to http:// and dev CORS issues
      '/api/osm-closures': {
        target: 'https://api.closures.osm.ch',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/osm-closures/, '/api/v1/closures'),
      },
    },
  },
});
