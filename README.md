# Sentinel – Wildfire Intelligence Platform

Real-time wildfire tracking dashboard inspired by Watch Duty and Ryan Hall Y'all.
Built with React + Mapbox GL + Tailwind CSS.

## Features

| Layer | Data Source | API Key Required |
|-------|------------|-----------------|
| Fire Hotspots (VIIRS) | NASA FIRMS | Yes (free) |
| Fire Perimeters | NIFC WFIGS ArcGIS | No |
| Historical Fire Perimeters | CAL FIRE FRAP ArcGIS (falls back to data.ca.gov) | No |
| AQI Stations | EPA AirNow | Yes (free) |
| Weather Alerts | NOAA NWS | No |
| Drought Monitor | USDA/UNL USDM | No |
| Smoke Forecast | NOAA HRRR-Smoke WMS | No |
| GOES Satellite | NOAA GOES East + West (Iowa Environmental Mesonet WMS, configurable) | No |
| NHC Tropical Weather (Invests, cyclones, cones, watches/warnings) | NOAA/NHC GIS + Tropical Weather Outlook | No |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in API keys
cp .env.example .env

# 3. Start dev server
npm run dev:all
```

Open http://localhost:3000 for the marketing site.

To test the tracker app locally, add this to `/etc/hosts`:

```
127.0.0.1 app.localhost
```

then open http://app.localhost:3000 — the marketing site and the tracker app
are one build, split at runtime by hostname (see `src/main.jsx`). In
production the tracker lives at `app.nationalwildfiretrackingteam.org`.

## API Keys Setup

### NASA FIRMS (fire hotspots)
1. Go to https://firms.modaps.eosdis.nasa.gov/api/
2. Register for a free MAP_KEY
3. Add to `.env`: `VITE_NASA_FIRMS_API_KEY=your_key`

### AirNow (AQI data)
1. Go to https://docs.airnowapi.org/login
2. Register for a free API key
3. Add to `.env`: `VITE_AIRNOW_API_KEY=your_key`

> Without API keys, the app runs in **demo mode** with realistic mock data for all layers.

## Optional: GOES-DL-backed satellite pipeline

If you want to use your own GOES tile infrastructure, you can point Sentinel to
custom GOES tile templates via environment variables in `.env`:

- `VITE_GOES_EAST_VISIBLE_TILE_URL`
- `VITE_GOES_WEST_VISIBLE_TILE_URL`
- `VITE_GOES_EAST_FIRE_RGB_TILE_URL`
- `VITE_GOES_WEST_FIRE_RGB_TILE_URL`

This is compatible with endpoints produced by a pipeline built with
[GOES-DL](https://github.com/wvenialbo/GOES-DL), as long as your service
exposes web map raster tiles (XYZ or WMS template).

## Tech Stack

- **React 18** + Hooks + Context API
- **react-map-gl + Mapbox GL** (token-based Mapbox rendering)
- **Tailwind CSS** v3 (dark theme)
- **Lucide React** (icons)
- **Vite** (build tool)

## Architecture

The marketing site and the tracker app are one Vite build, split at runtime
by hostname (`src/main.jsx` picks a router based on `window.location.hostname`).

```
src/
├── main/            # Marketing site (public domain) — router + pages
│   ├── router.jsx
│   └── pages/       # HomePage, AboutPage, VolunteerPage, PricingPage, ...
├── app/             # Tracker app (app.* subdomain) — router root is "/"
│   ├── router.jsx
│   ├── pages/       # LiveTrackerPage, LoginPage, AccountPage, AdminDashboardPage, ...
│   ├── components/
│   │   ├── Map/     # MapView + per-layer components
│   │   ├── Sidebar/ # Incident feed
│   │   ├── LayerControl/
│   │   ├── AlertBanner/
│   │   ├── FireDetailPanel/
│   │   └── Legend/
│   ├── context/     # AppContext, ThemeContext
│   ├── data/        # Mock/demo data
│   ├── hooks/       # useFireHotspots, useAQIData, etc.
│   ├── api/         # Data fetching (FIRMS, NIFC, AirNow, NOAA)
│   ├── fireEngine/  # Fire spread simulation
│   └── utils/       # Colors, formatting, caching
└── shared/          # Used by both sides: Navbar, Footer, AuthContext,
                      # ErrorBoundary, supabaseClient, error-logging pipeline
```

## Adding a New Data Layer

1. Create `src/app/api/myNewSource.js` with fetch + normalize functions
2. Create `src/app/hooks/useMyNewData.js`
3. Create `src/app/components/Map/layers/MyNewLayer.jsx`
4. Add toggle to `LAYER_GROUPS` in `LayerControl.jsx`
5. Wire into `app/router.jsx` and `MapView.jsx`

## Production Build

```bash
npm run build   # outputs to dist/
npm run preview # preview production build
```

## CI/CD Pipeline

### GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `NETLIFY_AUTH_TOKEN` | Netlify API authentication |
| `NETLIFY_SITE_ID` | Netlify site identifier |

### Branch Workflow

```
dev → stage → Main
     (staging)  (production)
```

### PR Validation

All pull requests automatically run:
- Lint (ESLint)
- Build (Vite)
- Tests (Vitest)
- Typecheck (TypeScript)
- Coverage (Vitest v8)
- E2E Tests (Playwright) - only when targeting Main, stage, or dev

### Deployment

- **stage/dev**: Netlify auto-deploys on branch push
- **Main**: Netlify auto-deploys to production on merge
