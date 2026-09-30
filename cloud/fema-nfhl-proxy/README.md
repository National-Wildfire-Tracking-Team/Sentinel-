# FEMA NFHL proxy — Google Cloud Run deploy

This directory is a self-contained deploy unit for a small Cloud Run
**service** that fronts FEMA's National Flood Hazard Layer (NFHL) for
Sentinel's **Flood Hazard** map layer (`src/app/api/femaFloodHazards.js`,
`src/app/hooks/useFloodHazards.js`,
`src/app/components/Map/layers/FloodHazardLayer.jsx`).

```
Sentinel web app ──► fema-nfhl-proxy (Cloud Run) ──► FEMA NFHL ArcGIS REST
                         per-tile cache
```

The browser never calls FEMA. It asks this service for its viewport, and
the service answers from an in-memory, per-tile cache, fetching from FEMA
only the tiles it doesn't already hold. The national dataset is never
copied: tiles are fetched on demand and expire, so FEMA's map revisions
show up within one TTL without any rebuild.

- **Upstream:** `https://hazards.fema.gov/arcgis/rest/services/FIRMette/NFHLREST_FIRMette/MapServer`
  (the service behind FEMA's NFHL ArcGIS Experience). Sublayers used:
  `0` NFHL Availability, `1` FIRM Panels, `20` Flood Hazard Zones.
  FEMA publishes these GIS services for use in websites and GIS
  applications. The service carries no copyright text. Attribution
  ("Flood hazard data: FEMA National Flood Hazard Layer (NFHL)") is shown
  whenever the layer is on.
- **No credentials, no Firestore, no GCS, no Secret Manager.** FEMA's
  service is public, so there is nothing to authenticate or store.

## API

`GET /flood-hazards?bbox=<west>,<south>,<east>,<north>&zoom=<mapZoom>`

| Map zoom | Level | Returned |
|---|---|---|
| < 7 | — | `400` (too broad to be useful) |
| 7 – 12 | `overview` | NFHL availability polygons (where digital FIRMs exist) |
| 12 – 14 | `detail` | flood zones (z12 tiles, ~20 m simplification) + FIRM panels |
| ≥ 14 | `fine` | flood zones (z14 tiles, ~3 m simplification) + FIRM panels |

The response is `{ level, zones, panels, availability, attribution,
truncated, stale?, generatedAt }`, where each collection is a GeoJSON
FeatureCollection with normalized, human-readable properties. Zones carry
a FEMA `category` (floodway, 1%, coastal high hazard, 0.2%, levee, …).
Unshaded Zone X and open water are filtered out upstream.

The service validates coordinates, extent, and zoom. It returns `413` when
the area needs more than 64 tiles per dataset at that zoom, `429` above
`NFHL_RATE_LIMIT_PER_MINUTE` per client per instance, and a generic `502`
("Flood hazard data is temporarily unavailable.") when FEMA fails. It never
exposes upstream details.

`GET /health` returns aggregate counters (requests, tile hits, misses and
stale serves, upstream requests and errors, rate-limited requests).

## Caching

- **Key:** `nfhl:<NFHL_CACHE_VERSION>:<dataset>:<z>/<x>/<y>`, on a
  slippy-map tile grid rather than raw URLs. Neighbouring viewports share
  most tiles, and a pan fetches only the newly exposed ones.
- **TTL:** `NFHL_CACHE_TTL_HOURS` (default 24h). NFHL revisions (LOMRs,
  new studies) publish continuously, but any single area changes on the
  scale of months.
- **Stale fallback:** expired tiles are kept 7 more days and served
  (`stale: true`, `Cache-Control: no-store`) if FEMA is down.
- **Invalidate:** bump `NFHL_CACHE_VERSION`, e.g.
  `gcloud run services update fema-nfhl-proxy --region <REGION> --update-env-vars NFHL_CACHE_VERSION=v2`.
  That creates a new revision with an empty cache. Any redeploy also
  clears it.
- **Upstream protection:** at most 4 concurrent FEMA requests per
  instance, and connection resets, 5xx, and 429 are retried twice with
  backoff. FEMA resets connections when it receives ~10 parallel queries.
  Concurrent requests for the same tile share one fetch.
- **Downstream:** responses are gzipped, and the browser may cache them
  for 15 minutes. The client snaps requests to the same tile grid and keeps
  its own stale-while-revalidate cache.

Because the cache is per instance, its hit rate improves with
`--min-instances 1`. That costs a little more but keeps the cache warm.

## Observability

Every request logs one structured JSON line (`severity` + `jsonPayload`).
Fields: `level`, `zoomBucket`, `areaKm2`, `tiles`, `cacheHits`,
`cacheMisses`, `cacheStale`, `cacheHitRate`, `upstreamRequests`,
`upstreamBytes`, `responseBytes`, `features`, `truncated`, `latencyMs`.
Failures log as `upstream_error`, `invalid_request`, or `rate_limited`.
**No coordinates, bboxes, or IP addresses are logged.** Query size is
recorded only as approximate area.

Example log-based metrics (Logging → Log-based metrics):

- FEMA request count: counter on `jsonPayload.upstreamRequests`, filter `jsonPayload.message="flood_hazards"`
- Cache hit rate: distribution on `jsonPayload.cacheHitRate`
- FEMA errors: counter, filter `jsonPayload.message="upstream_error"`
- Latency / response size: distributions on `jsonPayload.latencyMs` / `jsonPayload.responseBytes`

## Deploy

Replace `<PROJECT_ID>` and `<REGION>` throughout, using the same project
and region as the other `cloud/*` services.

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud artifacts repositories create fema-nfhl-proxy \
  --repository-format=docker \
  --location=<REGION>

# from the repo root
gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/fema-nfhl-proxy/fema-nfhl-proxy:latest \
  cloud/fema-nfhl-proxy

gcloud run deploy fema-nfhl-proxy \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/fema-nfhl-proxy/fema-nfhl-proxy:latest \
  --region <REGION> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --concurrency 40 \
  --memory 1Gi \
  --timeout 60s \
  --set-env-vars ALLOWED_ORIGINS=https://app.nationalwildfiretrackingteam.org
```

`--allow-unauthenticated` is intentional. The service serves public
federal data and holds no secrets, the same as the other `cloud/*` data
proxies. `ALLOWED_ORIGINS` limits browser CORS to Sentinel, so other sites
can't use it as a free NFHL backend. Add the stage/dev origins if those
builds should use the same service. Memory is 1Gi because the tile cache
holds up to `NFHL_CACHE_MAX_ENTRIES` entries (default 4000, roughly
100–500MB in dense areas).

### Optional environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NFHL_CACHE_VERSION` | `v1` | Cache namespace; bump to invalidate |
| `NFHL_CACHE_TTL_HOURS` | `24` | Fresh lifetime of a cached tile |
| `NFHL_CACHE_MAX_ENTRIES` | `4000` | LRU bound on cached tiles |
| `NFHL_RATE_LIMIT_PER_MINUTE` | `120` | Per-client limit, per instance |
| `ALLOWED_ORIGINS` | *(unset → `*`)* | Comma-separated CORS allowlist |
| `NFHL_SERVICE_URL` | FEMA FIRMette NFHL | Upstream override (e.g. if FEMA moves the service) |

### Verify

```bash
URL=$(gcloud run services describe fema-nfhl-proxy --region <REGION> --format 'value(status.url)')
curl "$URL/health"
curl -s "$URL/flood-hazards?bbox=-121.52,38.56,-121.48,38.60&zoom=14" | head -c 400
curl -s "$URL/flood-hazards?bbox=-125,25,-66,49&zoom=12"   # → 413
```

### Wire up the client

Set the `VITE_FEMA_NFHL_PROXY_URL` repository secret to `$URL`. It is
passed to the production build in `.github/workflows/deploy.yml`. Also set
it in Netlify's environment variables for deploy-preview and branch builds,
and in `.env` for local development. Until it is set, the Flood Hazard
layer shows "Flood hazard data is not configured for this deployment."
There is deliberately no direct-to-FEMA browser fallback.

## Local development

```bash
cd cloud/fema-nfhl-proxy && PORT=8791 node index.mjs
# in .env:  VITE_FEMA_NFHL_PROXY_URL=http://localhost:8791
```

Unit tests: `npx vitest run Tests/Vitest/femaNfhlProxy.test.js`
