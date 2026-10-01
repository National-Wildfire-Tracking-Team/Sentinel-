# Sentinel data platform — Google Cloud

> **Moving to AWS.** `calfire-frap-proxy`, `california-land-ownership-proxy`,
> `fema-nfhl-proxy`, `fire-perimeters-merge` and `nws-alerts` now also deploy,
> unchanged, to AWS Lambda behind CloudFront from [`infra/aws/`](../infra/aws/README.md).
> Each service's `run.sh` is the Lambda entry point; Cloud Run ignores it.
> Cloud Run stays live until the cutover and decommission steps in
> [`infra/aws/MIGRATION.md`](../infra/aws/MIGRATION.md) are complete. The old
> NEXRAD services (`nexrad-sync`, `nexrad-heartbeat`) have been removed:
> radar is being rebuilt. References to them below are historical.

`cloud/` holds Sentinel's Google Cloud data layer. Each subdirectory is one
self-contained, independently deployable Cloud Run service or job. The
frontend stays on Netlify; this layer takes over the work that shouldn't
happen once per browser tab.

```
 NWS / NOAA · FEMA · NIFC · ArcGIS · USGS · …
                      │
          ┌───────────▼────────────┐
          │  Google Cloud data layer│   cloud/*  (Cloud Run services + jobs)
          │  ingest · normalize ·   │   Cloud Storage for large/processed data
          │  cache · spatial filter │   Cloud Scheduler for periodic ingest
          └───────────┬────────────┘
                      │  versioned JSON / GeoJSON APIs (/v1/…)
          ┌───────────▼────────────┐
          │  Netlify               │   frontend, static assets, deploy previews,
          │  (edge cache + proxies)│   existing /api/* proxies (the fallback path)
          └───────────┬────────────┘
                      ▼
                Sentinel UI
```

## What lives where

| Responsibility | Where |
|---|---|
| Frontend, static assets, deploy previews | Netlify (unchanged) |
| Thin pass-through proxies for small or public upstreams | Netlify edge functions (`netlify/edge-functions/`), CDN-cached via `_shared/edgeProxy.js` tiers |
| Work that's identical for every user: ingest, normalize, merge, dedupe | Cloud Run **service**, one shared in-memory cache per instance |
| Heavy or scheduled processing (decode, rebuild, precompute) | Cloud Run **job** triggered by Cloud Scheduler |
| Large or static geospatial datasets and processed outputs | Cloud Storage, read through a Cloud Run service (buckets aren't public; see `nexrad-heartbeat`) |

## Services

| Service | Kind | Replaces (per-browser) | Client switch | Frontend wiring |
|---|---|---|---|---|
| `nexrad-sync` / `nexrad-heartbeat` | job + service | Supabase radar pipeline | `VITE_NEXRAD_HEARTBEAT_URL` | in `deploy.yml` |
| `fema-nfhl-proxy` | service | direct FEMA NFHL queries | `VITE_FEMA_NFHL_PROXY_URL` | in `deploy.yml` (no fallback by design) |
| `fire-perimeters-merge` | service | 4-source fetch + merge in each tab | `VITE_FIRE_MERGE_SERVICE_URL` | in `deploy.yml` |
| `california-land-ownership-proxy` | service | direct ArcGIS | `VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL` | in `deploy.yml`, optional |
| `calfire-frap-proxy` | service | direct ArcGIS | `VITE_CALFIRE_FRAP_PROXY_URL` | in `deploy.yml`, optional |
| `nws-alerts` | service | api.weather.gov + WWA MapServer in each tab, every 60 s | `VITE_NWS_ALERTS_SERVICE_URL` | in `deploy.yml`, opt-in |
| `weather-models` | service (Python, **AWS only**, us-west-2) | new: HRRR/GFS model forecasts from AWS Open Data for `/weather-models` | `VITE_WEATHER_MODEL_SERVICE_URL` | in `deploy.yml`, opt-in, no fallback (model data has no other source) |

## Conventions every service follows

These are taken from the existing services. New ones should match them.

- **Self-contained deploy unit.** `Dockerfile` (`node:24-slim`),
  `package.json` with no runtime dependencies, `index.mjs` for HTTP, and
  the logic in a separate module that unit tests import from
  `Tests/Vitest/`. The build context is the service directory, so shared
  logic is copied, and a parity test keeps each copy in step with its twin
  in `src/`.
- **Versioned contracts.** New services expose `/v1/<resource>` with
  `schemaVersion` in the body. A breaking change ships as `/v2` alongside
  `/v1`. The contract is documented in the service README.
- **Opt-in client rollout.** The frontend calls a service only when its
  `VITE_*_URL` is set, and falls back to the existing Netlify or direct path
  when it's unset or the service errors. Unsetting the variable is the
  rollback, with no code change. Production URLs are passed to the build in
  `.github/workflows/deploy.yml`, and set in Netlify env vars for preview
  and branch builds.
- **No secrets in the repo.** Project ids, regions and bucket names are
  `<PLACEHOLDERS>` in READMEs and set at deploy time. Upstream credentials,
  where needed, live in Secret Manager. Public-data services are
  `--allow-unauthenticated`, with CORS limited by `ALLOWED_ORIGINS` and a
  per-client rate limit.
- **Observability.** One structured JSON log line per request or ingest
  (`severity`, `message`, `component`, counts, bytes, ms), plus
  `GET /health` with aggregate counters. Never log user location, IPs or
  full payloads. Build log-based metrics on the counters.
- **Freshness is explicit.** Every cache documents its TTL and worst-case
  staleness in its README. Errors are never cached. Life-safety data
  (alerts, evacuation zones) stays at 45 s or less, the same bound as the
  Netlify `lifeSafety` tier.

## Cost control

- **Scale to zero.** `--min-instances 0` unless a warm cache is worth the
  cost (NFHL tiles). No VMs, no Kubernetes, no Redis.
- **Small instances.** `--max-instances` sets the ceiling on both cost and
  upstream load. Size memory from measured payloads (see each README).
- **Fetch on demand, not by timer.** A service with no traffic makes no
  upstream requests. Use Cloud Scheduler only for work that's
  expensive to do on demand (decode, full rebuilds), and never for
  something a request-time cache already covers.
- **No database** unless a feature needs history or querying. Firestore and
  Cloud Storage are already in use for NEXRAD; reuse them before adding
  anything.
- **Watch egress.** Cloud Run egress to browsers is billed much like
  Netlify bandwidth. Moving a payload doesn't make it cheaper; making it
  smaller does (ID-first queries, spatial filtering, gzip, ETag/304).

## Migration roadmap

0. **Compress `fire-perimeters-merge`: done.** Responses are gzipped, taking
   the production query from ~80 MB to ~15.8 MB with an unchanged payload.
   Next: cache the compressed body per refresh instead of re-compressing
   on every request.
1. **NWS alerts — `cloud/nws-alerts`.** Deployed and verified side by
   side against the app's own pipeline. The client uses it when
   `VITE_NWS_ALERTS_SERVICE_URL` is set, with the Netlify path as the
   fallback.
2. **NWS zone, county and CWA reference geometry (next NWS step).**
   `useWeatherAlerts` downloads the nationwide public, fire-weather and
   marine zone, county and CWA catalogs on every page load (~60 MB+
   gzipped; inventory rows 3–7), only to look up
   geometry for UGC-coded alerts. This is the natural first
   **scheduled-ingest + Cloud Storage** workload: a daily Cloud Run job
   writes simplified catalogs to GCS, and `nws-alerts` (or a small
   reference service) resolves UGC codes server-side, so the browser
   receives only the polygons of active alerts.
3. **FEMA.** The NFHL flood-hazard layer is already on Cloud Run
   (`fema-nfhl-proxy`: viewport-tiled, cached, never copies the national
   dataset). The remaining FEMA pieces are IPAWS alerts (`/api/fema`
   edge function) and any other large FEMA ArcGIS layers from the
   inventory below. These should reuse NFHL's tile-grid cache pattern.
4. Remaining large layers, in the order of the inventory below.
   Consider vector tiles only for datasets too big to ship as GeoJSON
   even after spatial filtering.

## Geospatial inventory

Measured 2026-09-30 against the real upstreams, with the exact queries the
code builds. raw / gz = bytes without / with `Accept-Encoding: gzip`.
"Edge tier" refers to `_shared/edgeProxy.js`; before this phase none of
those tiers were in effect, because `netlify.toml` lacked `cache = "manual"`.
Sorted by estimated bandwidth impact (size × frequency × always-on).

| # | Source → current route | Size (raw / gz) | Frequency | Cache today | Proposed home |
|---|---|---|---|---|---|
| 1 | NIFC WFIGS + FIRIS + IRWIN + CAL FIRE → `fire-perimeters-merge` `/merged` | **80.4 MB raw; now gzipped to 15.8 MB** | every 5 min, always on (Wildfire tab) | Cloud Run 3 min; `max-age=60` | Already on GCP. Gzip done; next, simplify and publish as a scheduler-refreshed GCS object; vector tiles later |
| 2 | NWS WWA MapServer L1 → `/api/nws/wwa` | 13.7 MB / 4.66 MB | every 60 s, always on | lifeSafety tier | **Fixed this phase** (ID-first: ~22 KB raw per poll); then `nws-alerts` |
| 3 | NWS fire-weather zones → `/api/noaa/firewxzones` | 59.5 MB / 22.4 MB | every page load, always on | browser 24 h | GCS, pre-simplified and UGC-keyed; resolved server-side by `nws-alerts` |
| 4 | NWS CWA → `/api/noaa/cwa` | 54.2 MB / 20.7 MB | every page load, always on | browser 24 h | same as #3 |
| 5 | NWS marine zones → `/api/noaa/marinezones` | 45.4 MB / 17.6 MB | every page load, always on | browser 24 h | same as #3 |
| 6 | Census TIGERweb counties → `/api/census/counties` (pages of 500) | ≥25.7 MB per page, uncompressed; the WAF rejects most pages | every page load, always on | browser 1 h | GCS pre-simplified (fixes reliability too) |
| 7 | NWS public zones → `/api/arcgis/nws-zones` | 3.7 MB / 1.3 MB | every page load, always on | static tier | same as #3 |
| 8 | CPC drought outlook → `/api/nws/cpc-drought` | 32.6 MB / 12.1 MB | on toggle, hourly | outlook tier | Cloud Run job: simplify → GCS on issuance |
| 9 | CAL FIRE FRAP ≥2016 → `/api/arcgis/frap-mirror` | 39.4 MB / 7.3 MB | on toggle, 12 h | client 12 h; static tier | GCS processed dataset / vector tiles |
| 10 | WPC QPF → `/api/nws/wpc-qpf` | 15.1 MB / 6.4 MB | on toggle, every 5 min | client 5 min | edge cache; simplify → GCS later |
| 11 | NESDIS NGFS → `/api/nesdis/collections` | 5.2 MB, no upstream gzip | every 5 min, always on | client 3 min; active tier | edge cache |
| 12 | CMRA transmission lines → `/api/arcgis/cmra-transmission` (sample W-CA bbox) | 4.4 MB / 1.4 MB | per viewport, Pro toggle | static tier, 1° grid | vector tiles |
| 13 | NWS DAT, RAWS, NDGD smoke, AirNow | 1–3.3 MB / 0.1–0.95 MB each | toggled, 15–30 min | client + edge tiers | edge cache is enough |
| 14 | NWS active alerts → `/api/wx/alerts/active` | 1.1 MB / 113 KB | every 60 s, always on | client 45 s; lifeSafety | `nws-alerts` (together with #2–#7) |
| 15 | FEMA NFHL → `fema-nfhl-proxy` | ~188 KB gz per z12 viewport | per viewport, zoom ≥ 7, toggled | Cloud Run 24 h tiles; gzip | already right |
| — | IPAWS `/api/fema`, CA evac, IRWIN, SPC, WPC ERO/fronts/WSSI, land ownership, CAL FIRE list | < 600 KB each | — | — | edge cache / existing service is enough |

Not measured: FIRMS (needs an API key). Other issues found during
measurement:

- `calfire-frap-proxy` and `california-land-ownership-proxy` don't gzip their
  responses.
- `caEvacZones.js` builds its `where` clause from `Date.now()`, to the
  second, so neither its client cache nor the edge cache can ever hit.
  Rounding the cutoff to the day fixes it.
