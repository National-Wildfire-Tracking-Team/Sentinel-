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
        'src/app/data/**',
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
    // 'app.localhost' lets the hostname-based bootstrap in src/main.jsx mount
    // the tracker app locally — see README for the /etc/hosts entry needed.
    allowedHosts: ['localhost', 'app.localhost'],
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
        headers: {
          Accept: 'application/json',
          // api.water.noaa.gov returns 403 to requests without a User-Agent.
          'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
        },
        rewrite: (path) => path.replace(/^\/api\/nwps/, ''),
      },
      // NOAA ArcGIS "Full Forecast Period Stages" (layer 15) – forecasted
      // stage/status per gauge, joined to /api/river-gauges by gaugelid.
      // Must be registered BEFORE /api/river-gauges below: Vite matches proxy
      // keys with startsWith and takes the first match, so the shorter path
      // would otherwise swallow every /api/river-gauges-forecast request.
      '/api/river-gauges-forecast': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const params = new URLSearchParams(qs);
          const count = params.get('resultRecordCount') || '10000';
          const offset = params.get('resultOffset') || '0';
          return `/eventdriven/rest/services/water/riv_gauges/MapServer/15/query?where=1%3D1&outFields=gaugelid,status,forecast,action,flood,moderate,major&outSR=4326&f=geojson&resultRecordCount=${count}&resultOffset=${offset}`;
        },
      },
      // NOAA ArcGIS "Observed River Stages" – primary river-gauge list source
      // (more reliable than NWPS's own /gauges list endpoint); paginated via
      // resultOffset/resultRecordCount, forwarded through to the query string.
      '/api/river-gauges': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const params = new URLSearchParams(qs);
          const count = params.get('resultRecordCount') || '10000';
          const offset = params.get('resultOffset') || '0';
          return `/eventdriven/rest/services/water/riv_gauges/MapServer/0/query?where=1%3D1&outFields=gaugelid,status,location,waterbody,state,wfo,url,action,flood,moderate,major,observed,hdatum&outSR=4326&f=geojson&resultRecordCount=${count}&resultOffset=${offset}`;
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
        headers: {
          Accept: 'application/json',
          // api.water.noaa.gov returns 403 to requests without a User-Agent.
          'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
        },
        rewrite: (path) => path.replace(/^\/api\/nwps/, ''),
      },
      // Must be registered BEFORE /api/river-gauges below: Vite matches proxy
      // keys with startsWith and takes the first match, so the shorter path
      // would otherwise swallow every /api/river-gauges-forecast request.
      '/api/river-gauges-forecast': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const params = new URLSearchParams(qs);
          const count = params.get('resultRecordCount') || '10000';
          const offset = params.get('resultOffset') || '0';
          return `/eventdriven/rest/services/water/riv_gauges/MapServer/15/query?where=1%3D1&outFields=gaugelid,status,forecast,action,flood,moderate,major&outSR=4326&f=geojson&resultRecordCount=${count}&resultOffset=${offset}`;
        },
      },
      '/api/river-gauges': {
        target: 'https://mapservices.weather.noaa.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const qs = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
          const params = new URLSearchParams(qs);
          const count = params.get('resultRecordCount') || '10000';
          const offset = params.get('resultOffset') || '0';
          return `/eventdriven/rest/services/water/riv_gauges/MapServer/0/query?where=1%3D1&outFields=gaugelid,status,location,waterbody,state,wfo,url,action,flood,moderate,major,observed,hdatum&outSR=4326&f=geojson&resultRecordCount=${count}&resultOffset=${offset}`;
        },
      },
    },
  },
});
