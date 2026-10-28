# Sentinel Mobile (iOS)

Expo SDK 58 · React Native 0.88 · Expo Router · `@rnmapbox/maps` · Supabase. Runs as an
[Expo development build](https://docs.expo.dev/develop/development-builds/introduction/), not in
Expo Go, because native Mapbox is not part of Expo Go.

## What's here

The app mirrors the web live map (`src/app/pages/LiveTrackerPage.jsx`) at phone width: same
header, round corner buttons, bottom bar and tabs, sidebar, layer panel, menu and incident sheet,
with colours taken from the web's Tailwind and CSS tokens (`src/theme.ts`).

| Path | What it does |
|---|---|
| `src/app/index.tsx` | The live map screen: header, corner buttons, zoom stack, bottom bar, panels and detail sheets |
| `src/app/places.tsx` | My Places: Home Setup, saved locations with alert radius, followed fires |
| `src/app/account.tsx` | Supabase email/password sign-in and account info |
| `src/map/SentinelMap.tsx` | Mapbox map: fire dots and flame clusters, perimeters, evacuation zones, places, raster overlays, MRMS radar, lightning, radar-site sweeps and the GeoJSON layers |
| `src/map/featureSources.ts`, `featureStyles.ts`, `rasterSources.ts` | Each GeoJSON layer's loader and refresh, its web paint values, and the tile overlays (WFPI, LANDFIRE fuels, GOES) |
| `src/map/radarSweepImage.ts`, `src/hooks/useRadarSite.ts` | Individual Radar Site: Level 3 scans drawn by an SkSL shader into a map-aligned image (the web's WebGL sweep layer) |
| `src/map/WindParticles.tsx` | Wind particles: a Skia overlay stepped on the UI thread by a Reanimated frame callback |
| `src/components/FeatureSheet.tsx`, `RadarSitePanel.tsx` | Details for a tapped station, camera, gauge, TFR, hotspot or fire danger feature; radar site controls |
| `src/map/catalog.ts` | The web's layer catalog and tab sections; `NATIVE_LAYERS` lists what the app draws so far |
| `src/components/SidebarPanel.tsx`, `IncidentList.tsx`, `AlertsList.tsx` | The web sidebar: stat pills, feed tabs, incident cards, NWS alerts |
| `src/components/IncidentSheet.tsx` | The web's IncidentSidebar: situation, evacuations, Updates / Shelters / Info, Share and Follow |
| `src/components/LayerPanel.tsx`, `MenuPanel.tsx`, `MapChrome.tsx` | The layer card, menu, corner buttons and zoom stack |
| `src/data/` | Data loaders: incidents (AWS merge service), evacuation zones (Cal OES, IPAWS, reporter zones), NOAA ArcGIS overlays, MRMS, lightning, NWS alerts, fire activity and smoke, fire danger and fuels, monitoring and aviation, radar sites, the wind field |
| `src/lib/nexrad/` | The web's NEXRAD Level 3 and bzip2 decoders, copied unchanged |
| `src/context/`, `src/hooks/` | Home Setup and near-me, display preferences, saved locations, follows, per-incident realtime data |

### Data sources

- **AWS data services** (`EXPO_PUBLIC_DATA_SERVICES_URL`): `/fire-perimeters-merge`, `/mrms`, `/nws-alerts`, `/fire-danger` (NFDRS stations), `/weather-models/fields` (wind), `/california-land-ownership-proxy`.
- **The website's `/api/*` proxies** (`app.nationalwildfiretrackingteam.org/api`): Cal OES evacuation zones and FEMA IPAWS.
- **NOAA ArcGIS MapServers**, called directly (no CORS on native): NWS alerts, NHC, storm reports, SPC and WPC outlooks, drought, FEMA flood zones. The web reaches the same servers through `/api/nws/*`.
- **Other public services, called directly** (the web goes through its `/api/*` proxies for most): NASA FIRMS (the keyless 48-hour CSVs), NOAA NESDIS NGFS, CAL FIRE FRAP, NDGD smoke, AirNow, NWCG significant fire potential, NWCC fuel samples, USGS WFPI, LANDFIRE, NASA GIBS (GOES), RAWS, Caltrans CCTV, NOAA river gauges and NWPS, FAA TFRs, aviationweather.gov, USGS National Map, CMRA and EIA infrastructure, api.weather.gov radar status, and the Unidata NEXRAD Level 3 bucket.
- **Supabase**, with the same anon key and RLS as the website. Reads `incident_updates`, `incident_evacuations`, `incident_shelters`, `reporter_evac_zones`, `profiles`, `subscriptions` and the `lightning` storage bucket. Writes only the signed-in user's own rows in `incident_follows`, `saved_locations`, `home_setups` and `display_preferences`, the same way the website does. No schema or backend changes.

## Setup

```bash
cd mobile
npm install
cp .env.example .env.local   # then fill in the four values (the same publishable keys as the website's VITE_*)
```

`.env.local` is gitignored. Put only publishable values in it: the Supabase anon key and a `pk.`
Mapbox token.

## Run on an iPhone

You need: a Mac with Xcode, an iPhone with **Developer Mode** on (Settings → Privacy & Security), and
an Apple ID signed in to Xcode (Xcode → Settings → Accounts). A free Apple ID works; its builds
expire after 7 days.

### Option A: local build over USB (no paid account required)

```bash
# One time: CocoaPods (system Ruby is too old; use Homebrew)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install cocoapods

# Plug in the iPhone, unlock it, tap "Trust This Computer"
npm run ios:device          # = npx expo run:ios --device; pick your iPhone from the list
```

The first build takes 10–15 minutes. If signing fails, open `ios/Sentinel.xcworkspace`, select the
**Sentinel** target → Signing & Capabilities, choose your team, and run again. On the phone, trust
the developer certificate once: Settings → General → VPN & Device Management.

After that, day-to-day work only needs Metro:

```bash
npm start -- --lan          # phone and Mac on the same Wi-Fi; the dev build connects automatically
```

JS changes hot-reload. Rebuild (`npm run ios:device`) only after you add a native module or change
`app.json`.

### Option B: EAS cloud build (paid Apple Developer account)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                      # links the project to an EAS project ID
npx eas-cli@latest device:create             # registers your iPhone (open the link on the phone)
npx eas-cli@latest env:create --environment development   # add each EXPO_PUBLIC_* from .env.local
npx eas-cli@latest build --profile development --platform ios
```

Install the build from the QR code or link that EAS prints, then run `npm start` on your Mac.

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

`ios/` and `android/` are generated (`npx expo prebuild`) and gitignored. Never edit them by hand;
change `app.json` or a config plugin instead.
