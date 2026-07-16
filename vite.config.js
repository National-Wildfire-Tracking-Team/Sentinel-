/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/main.jsx',
        'src/index.css',
        'src/test/**',
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/data/**',
      ],
      thresholds: {
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('mapbox-gl') || id.includes('react-map-gl')) {
              return 'vendor-mapbox';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('date-fns') || id.includes('lucide-react')) {
              return 'vendor-utils';
            }
          }
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
      '/api/census/counties': {
        target: 'https://tigerweb.geo.census.gov',
        changeOrigin: true,
        headers: {
          Accept: 'application/json, application/geo+json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
        },
        rewrite: (path) => {
          const search = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const params = new URLSearchParams(search);
          const offset = params.get('resultOffset') || '0';
          const count = params.get('resultRecordCount') || '500';
          return `/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/82/query?where=1%3D1&outFields=STATE,COUNTY,NAME&outSR=4326&f=geojson&resultRecordCount=${count}&resultOffset=${offset}`;
        },
      },
      '/api/noaa/cwa': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
      },
      '/api/noaa/firewxzones': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/9/query?where=1%3D1&outFields=state,zone&outSR=4326&f=geojson',
      },
      '/api/noaa/marinezones': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/5/query?where=1%3D1&outFields=id&outSR=4326&f=geojson',
      },
      // NWPS – api.water.noaa.gov lacks CORS headers; dev server proxies same paths as Netlify edge fn
      '/api/nwps': {
        target: 'https://api.water.noaa.gov/nwps/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/nwps/, ''),
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
      '/api/census/counties': {
        target: 'https://tigerweb.geo.census.gov',
        changeOrigin: true,
        headers: {
          Accept: 'application/json, application/geo+json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
        },
        rewrite: (path) => {
          const search = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const params = new URLSearchParams(search);
          const offset = params.get('resultOffset') || '0';
          const count = params.get('resultRecordCount') || '500';
          return `/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/82/query?where=1%3D1&outFields=STATE,COUNTY,NAME&outSR=4326&f=geojson&resultRecordCount=${count}&resultOffset=${offset}`;
        },
      },
      '/api/noaa/cwa': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/2/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
      },
      '/api/noaa/firewxzones': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/9/query?where=1%3D1&outFields=state,zone&outSR=4326&f=geojson',
      },
      '/api/noaa/marinezones': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/static/rest/services/nws_reference_maps/nws_reference_map/FeatureServer/5/query?where=1%3D1&outFields=id&outSR=4326&f=geojson',
      },
      '/api/nwps': {
        target: 'https://api.water.noaa.gov/nwps/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/nwps/, ''),
      },
    },
  },
});
