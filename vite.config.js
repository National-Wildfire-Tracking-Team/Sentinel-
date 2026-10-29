/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'node:https';
import { ROUTES as NWS_MAPSERVICE_ROUTES } from './netlify/edge-functions/nws-mapservices-proxy.js';
import { ROUTES as WEATHER_GOV_ROUTES } from './netlify/edge-functions/weather-gov-proxy.js';
import { ROUTES as ARCGIS_ROUTES } from './netlify/edge-functions/arcgis-proxy.js';
import { ROUTES as AWC_ROUTES } from './netlify/edge-functions/awc-proxy.js';
import { ROUTES as TFR_ROUTES } from './netlify/edge-functions/faa-tfr-proxy.js';
import { fetchGlobalFires } from './netlify/functions/kanari-fires/kanari-fires.mjs';

// Dev/preview twin of netlify/edge-functions/nws-mapservices-proxy.js: one
// proxy entry per route, so /api/nws/<key>/... reaches the same upstream
// service locally (without it these requests fall through to index.html and
// the SPC/WPC/CPC/NHC/LSR/DAT layers come up empty).
//
// No keep-alive: Node 19+ reuses sockets by default, and NOAA's ArcGIS hosts
// close idle ones, so a reused socket fails with "http proxy error … ECONNRESET"
// (the NHC layer's burst of slot queries hit this most).
const noaaAgent = new https.Agent({ keepAlive: false });
const nwsMapServiceProxy = Object.fromEntries(
  Object.entries(NWS_MAPSERVICE_ROUTES).map(([key, route]) => {
    const prefix = `/api/nws/${key}`;
    return [`^${prefix}(/|\\?|$)`, {
      target: route.origin ?? 'https://mapservices.weather.noaa.gov',
      changeOrigin: true,
      secure: true,
      agent: noaaAgent,
      // Same fixed User-Agent the edge proxy sends (edgeProxy.js UPSTREAM_HEADERS):
      // WPC's server rejects some browser agents (e.g. headless Chrome) with 403.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)' },
      rewrite: (path) => route.path + path.slice(prefix.length),
    }];
  })
);

// Dev/preview twin of netlify/edge-functions/arcgis-proxy.js (/api/arcgis/<route>/...),
// each route pinned to its own ArcGIS origin as in production.
const arcgisProxy = Object.fromEntries(
  Object.entries(ARCGIS_ROUTES).map(([key, route]) => {
    const prefix = `/api/arcgis/${key}`;
    return [`^${prefix}(/|\\?|$)`, {
      target: route.origin ?? 'https://services.arcgis.com',
      changeOrigin: true,
      secure: true,
      // forcedParams are added upstream as the edge proxy does (buildUpstreamUrl).
      rewrite: (path) => {
        const rewritten = route.path + path.slice(prefix.length);
        if (!route.forcedParams) return rewritten;
        const [pathname, query = ''] = rewritten.split('?');
        const params = new URLSearchParams(query);
        for (const [k, v] of Object.entries(route.forcedParams)) params.set(k, v);
        return `${pathname}?${params.toString().replace(/%2C/g, ',')}`;
      },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)' },
    }];
  })
);

// Dev/preview twin of netlify/edge-functions/weather-gov-proxy.js
// (/api/wx/<route>/... → api.weather.gov), which asks for a User-Agent.
const weatherGovProxy = Object.fromEntries(
  Object.entries(WEATHER_GOV_ROUTES).map(([key, route]) => {
    const prefix = `/api/wx/${key}`;
    return [`^${prefix}(/|\\?|$)`, {
      target: 'https://api.weather.gov',
      changeOrigin: true,
      secure: true,
      agent: noaaAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)' },
      rewrite: (path) => route.path + path.slice(prefix.length),
    }];
  })
);

// Dev/preview twin of netlify/edge-functions/awc-proxy.js (/api/awc/<route>/...).
// aviationweather.gov errors on any query param its spec doesn't document,
// so only each route's own `params` are passed on, as the edge proxy does.
const awcProxy = Object.fromEntries(
  Object.entries(AWC_ROUTES).map(([key, route]) => {
    const prefix = `/api/awc/${key}`;
    return [`^${prefix}(/|\\?|$)`, {
      target: 'https://aviationweather.gov',
      changeOrigin: true,
      secure: true,
      // AWC's front door also closes idle sockets ("socket hang up" on reuse).
      agent: noaaAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)' },
      rewrite: (path) => {
        const [pathname, query = ''] = (route.path + path.slice(prefix.length)).split('?');
        const params = new URLSearchParams();
        for (const [k, v] of new URLSearchParams(query)) {
          if (route.params.includes(k)) params.append(k, v);
        }
        const qs = params.toString().replace(/%2C/g, ',');
        return qs ? `${pathname}?${qs}` : pathname;
      },
    }];
  })
);

// Dev/preview twin of netlify/edge-functions/faa-tfr-proxy.js (/api/tfr/<route>/...).
// Caller params are dropped; each route's forcedParams are its whole query.
const tfrProxy = Object.fromEntries(
  Object.entries(TFR_ROUTES).map(([key, route]) => {
    const prefix = `/api/tfr/${key}`;
    return [`^${prefix}(/|\\?|$)`, {
      target: 'https://tfr.faa.gov',
      changeOrigin: true,
      secure: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)' },
      rewrite: (path) => {
        const pathname = route.path + path.slice(prefix.length).split('?')[0];
        const qs = new URLSearchParams(route.forcedParams || {}).toString();
        return qs ? `${pathname}?${qs}` : pathname;
      },
    }];
  })
);

// Inlines the entry stylesheet into index.html. As a <link> it was the one
// request blocking the first paint, which matters most on the prerendered
// marketing pages (scripts/prerender.mjs) that have content to show before JS.
//
// It's taken off the entry chunk's importedCss before Vite's own
// generateBundle hooks run, so Vite neither writes the <link> nor lists the
// file in lazy chunks' preload deps — the preload helper would otherwise
// fetch it again as soon as the router loads, since no <link> matches it.
function inlineEntryCss() {
  let css = '';
  return {
    name: 'inline-entry-css',
    apply: 'build',
    generateBundle: {
      order: 'pre',
      handler(_options, bundle) {
        const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
        for (const fileName of entry.viteMetadata.importedCss) {
          css += bundle[fileName].source;
          delete bundle[fileName];
        }
        entry.viteMetadata.importedCss.clear();
      },
    },
    transformIndexHtml: {
      order: 'post',
      // `<\/style` is the same text to CSS but can't close the tag early.
      handler: (html) => html.replace('</head>', `<style>${css.replaceAll('</style', '<\\/style')}</style>\n</head>`),
    },
  };
}

// Starts every file the visitor's page needs while the HTML is still parsing.
// main.jsx picks the route tree by hostname and lazy-loads it, and the
// marketing router lazy-loads the page, so the homepage's hero image used to
// wait on a chain — entry → router → HomePage → image — each step starting
// only once the previous one had run. Vite only preloads the entry's static
// imports. This inline script, written at build time from the real chunk
// graph, preloads the tree using the same hostname tests as main.jsx.
//
// Only where it measured faster (throttled mobile): the homepage, with its
// page chunk and hero AVIF (hero shown 1.35 s → 0.89 s), and the tracker (map
// shown 7.0 s → 5.0 s). On the reporter and the other marketing pages it made
// no difference — they still wait on a lazy page chunk after the router, and
// the marketing ones are prerendered — so they're left out.
function preloadRouteChunks() {
  return {
    name: 'preload-route-chunks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
        const chunkFor = (modulePath) => {
          const chunk = chunks.find((c) => c.facadeModuleId?.endsWith(modulePath));
          if (!chunk) throw new Error(`preload-route-chunks: no chunk for ${modulePath}`);
          return chunk;
        };
        const staticClosure = (chunk, files = new Set()) => {
          for (const fileName of chunk.imports) {
            if (!files.has(fileName)) {
              files.add(fileName);
              staticClosure(bundle[fileName], files);
            }
          }
          return files;
        };

        const entry = chunks.find((c) => c.isEntry);
        const inHtml = new Set([entry.fileName, ...staticClosure(entry)]);
        const filesFor = (...modulePaths) => {
          const files = new Set();
          for (const modulePath of modulePaths) {
            const chunk = chunkFor(modulePath);
            for (const fileName of [chunk.fileName, ...staticClosure(chunk)]) {
              if (inHtml.has(fileName)) continue;
              files.add(fileName);
              bundle[fileName].viteMetadata.importedCss.forEach((css) => files.add(css));
            }
          }
          return [...files];
        };

        const homePage = chunkFor('/src/main/pages/HomePage.jsx');
        const heroAvif = [...homePage.viteMetadata.importedAssets].find((file) => file.endsWith('.avif'));
        const plan = {
          home: [...filesFor('/src/main/router.jsx', '/src/main/pages/HomePage.jsx'), heroAvif],
          app: filesFor('/src/app/AppTree.jsx'),
        };

        // CSS and JS carry crossorigin to match the <link>s Vite's preload
        // helper adds later; the image matches the hero <img>, which has none.
        const script = `(function (plan) {
  var host = location.hostname;
  var files = host.indexOf('app.') === 0 ? plan.app
    : host.indexOf('reporter.') !== 0 && location.pathname === '/' ? plan.home
    : [];
  files.forEach(function (file) {
    var link = document.createElement('link');
    if (/\\.js$/.test(file)) {
      link.rel = 'modulepreload';
      link.crossOrigin = '';
    } else if (/\\.css$/.test(file)) {
      link.rel = 'preload';
      link.as = 'style';
      link.crossOrigin = '';
    } else {
      link.rel = 'preload';
      link.as = 'image';
      link.type = 'image/avif';
      link.setAttribute('fetchpriority', 'high');
    }
    link.href = '/' + file;
    document.head.appendChild(link);
  });
})(${JSON.stringify(plan)});`;

        return [{ tag: 'script', children: script, injectTo: 'head' }];
      },
    },
  };
}

// Dev/preview twin of netlify/functions/kanari-fires (/api/kanari/fires). Holds
// the result for 2 minutes like the CDN does, so a dev server also stays
// within Kanari's once-a-minute polling guidance.
function kanariFiresDevProxy() {
  let cached = null;
  let cachedAt = 0;
  const handler = async (req, res, next) => {
    if (!req.url.startsWith('/api/kanari/fires')) return next();
    res.setHeader('Content-Type', 'application/json');
    try {
      if (!cached || Date.now() - cachedAt > 120_000) {
        cached = JSON.stringify(await fetchGlobalFires());
        cachedAt = Date.now();
      }
      res.end(cached);
    } catch (err) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: err.message }));
    }
  };
  return {
    name: 'kanari-fires-dev-proxy',
    configureServer: (server) => { server.middlewares.use(handler); },
    configurePreviewServer: (server) => { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [react(), inlineEntryCss(), preloadRouteChunks(), kanariFiresDevProxy()],
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
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks, matched by exact package path (a loose
        // `includes('react')` once swept lucide-react and react-map-gl into
        // vendor-react). Everything else is left to the default splitting, so
        // each page only downloads the code it imports.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//,
              priority: 3,
            },
            {
              name: 'vendor-mapbox',
              test: /\/node_modules\/(mapbox-gl|react-map-gl)\//,
              priority: 2,
              // mapbox-gl contains an import(), so it depends on Vite's preload
              // helper — which every lazy route also uses. Capturing
              // dependencies would put that helper in this chunk and make the
              // entry statically import all of mapbox-gl on every page.
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor-supabase',
              test: /\/node_modules\/@supabase\//,
              priority: 1,
            },
            {
              // One small chunk for every icon, instead of a sub-1 KB chunk per
              // icon for each set of pages that shares it.
              name: 'vendor-icons',
              test: /\/node_modules\/lucide-react\//,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
    // 'app.localhost'/'reporter.localhost' let the hostname-based bootstrap in
    // src/main.jsx mount the tracker app/reporter portal locally — see README
    // for the /etc/hosts entries needed.
    allowedHosts: ['localhost', 'app.localhost', 'reporter.localhost'],
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
      ...nwsMapServiceProxy,
      ...weatherGovProxy,
      ...arcgisProxy,
      ...awcProxy,
      ...tfrProxy,
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
      ...nwsMapServiceProxy,
      ...weatherGovProxy,
      ...arcgisProxy,
      ...awcProxy,
      ...tfrProxy,
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
