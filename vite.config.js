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
      '/alerts': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        rewrite: () => '/api/alerts',
      },
      '/api/calfire': {
        target: 'https://incidents.fire.ca.gov',
        changeOrigin: true,
        secure: true,
        rewrite: path => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?')) : '';
          return `/umbraco/api/IncidentApi/GeoJsonList${qs}`;
        },
      },
      // NHC – nhc.noaa.gov lacks CORS headers; dev server proxies same paths as Netlify edge fn
      '/api/nhc/current': {
        target: 'https://www.nhc.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/CurrentStorms.json',
      },
      '/api/nhc/gis': {
        target: 'https://www.nhc.noaa.gov',
        changeOrigin: true,
        rewrite: (path) => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const file = new URLSearchParams(qs).get('file') || '';
          return `/gis/forecast/archive/${file}`;
        },
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      '/alerts': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        rewrite: () => '/api/alerts',
      },
      '/api/calfire': {
        target: 'https://incidents.fire.ca.gov',
        changeOrigin: true,
        secure: true,
        rewrite: path => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?')) : '';
          return `/umbraco/api/IncidentApi/GeoJsonList${qs}`;
        },
      },
      '/api/nhc/current': {
        target: 'https://www.nhc.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/CurrentStorms.json',
      },
      '/api/nhc/gis': {
        target: 'https://www.nhc.noaa.gov',
        changeOrigin: true,
        rewrite: (path) => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const file = new URLSearchParams(qs).get('file') || '';
          return `/gis/forecast/archive/${file}`;
        },
      },
    },
  },
});
