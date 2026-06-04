# Sentinel – Wildfire Intelligence Platform

Real-time wildfire tracking dashboard inspired by Watch Duty and Ryan Hall Y'all.
Built with React + Mapbox GL + Tailwind CSS.

## Features

| Layer | Data Source | API Key Required |
|-------|------------|-----------------|
| Fire Hotspots (VIIRS) | NASA FIRMS | Yes (free) |
| Fire Perimeters | NIFC WFIGS ArcGIS | No |
| AQI Stations | EPA AirNow | Yes (free) |
| Weather Alerts | NOAA NWS | No |
| Drought Monitor | USDA/UNL USDM | No |
| Smoke Forecast | NOAA HRRR-Smoke WMS | No |
| GOES Satellite | NOAA GOES East + West (Iowa Environmental Mesonet WMS, configurable) | No |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in API keys
cp .env.example .env

# 3. Start dev server
npm run dev
```

Open http://localhost:3000

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

```
src/
├── api/          # Data fetching (FIRMS, NIFC, AirNow, NOAA)
├── components/
│   ├── Map/      # MapView + per-layer components
│   ├── Sidebar/  # Incident feed
│   ├── LayerControl/
│   ├── AlertBanner/
│   ├── FireDetailPanel/
│   └── Legend/
├── context/      # AppContext – global state
├── data/         # Mock/demo data
├── hooks/        # useFireHotspots, useAQIData, etc.
└── utils/        # Colors, formatting, caching
```

## Adding a New Data Layer

1. Create `src/api/myNewSource.js` with fetch + normalize functions
2. Create `src/hooks/useMyNewData.js`
3. Create `src/components/Map/layers/MyNewLayer.jsx`
4. Add toggle to `LAYER_GROUPS` in `LayerControl.jsx`
5. Wire into `App.jsx` and `MapView.jsx`

## Production Build

```bash
npm run build   # outputs to dist/
npm run preview # preview production build
```
