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
| GOES Satellite | NOAA GOES East + West (Esri tiles) | No |

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

## Fire weather risk API (Open-Meteo)

Small Node.js service under `server/` that pulls hourly forecast data from [Open-Meteo](https://open-meteo.com/) (no API key), computes a 0–100 fire risk score per hour, and returns JSON suitable for Mapbox or other web clients. Responses include `Access-Control-Allow-Origin: *` for browser use.

### Run locally

```bash
npm run fire-weather-api
```

Default port is **3847**. Override with `PORT`, and optional cache TTL with `FIRE_WEATHER_CACHE_TTL_MS` (default 5 minutes).

### Endpoints

| Path | Description |
|------|-------------|
| `GET /api/fire-weather?latitude={lat}&longitude={lon}` | Full hourly series with scores |
| `GET /api/fire-weather/max-24h?latitude={lat}&longitude={lon}` | Single hour with highest risk in the next 24 hours |
| `GET /health` | Liveness check |

`lat` / `lon` are accepted as aliases for `latitude` / `longitude`.

### Example request

```bash
curl "http://127.0.0.1:3847/api/fire-weather?latitude=37.7749&longitude=-122.4194"
```
