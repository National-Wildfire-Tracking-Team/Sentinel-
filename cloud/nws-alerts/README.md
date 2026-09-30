# NWS alerts — Google Cloud Run deploy

This directory is a self-contained deploy unit for a small Cloud Run
**service** that builds one shared snapshot of every active NWS alert. It is
the first NWS piece of Sentinel's Google Cloud data layer (see
[../README.md](../README.md)).

```
api.weather.gov ──┐
                  ├─► nws-alerts (Cloud Run) ──► Sentinel web app
WWA MapServer ────┘    45 s shared snapshot
```

Today every open Sentinel tab builds this itself every 60 seconds, in
`src/app/hooks/useWeatherAlerts.js`. It pulls api.weather.gov through
`/api/wx`, then the WWA MapServer supplement through `/api/nws/wwa`. This
service does the same work once per instance per 45 seconds, and every tab
reads the result.

> **Status: opt-in.** `src/app/api/nwsAlertsService.js` uses this service
> only when `VITE_NWS_ALERTS_SERVICE_URL` is set. When it's unset, or the
> service fails, returns `stale: true` or returns an unexpected schema,
> `useWeatherAlerts` keeps the original Netlify path.

- **Upstream:** `https://api.weather.gov/alerts/active` (primary, all pages)
  and `https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer`
  layers 0 and 1 (supplement).
- **No credentials, no database, no GCS, no Secret Manager.** Both sources
  are public.

## API contract — `GET /v1/alerts`

The path carries the major version. A breaking change ships as `/v2/alerts`
next to `/v1`, never as an in-place change. `schemaVersion` in the body
matches the path.

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-30T17:55:00.000Z",
  "stale": false,            // true only when serving the last good snapshot after an upstream failure
  "alerts": [ /* api.weather.gov alerts, same shape as fetchNWSAlerts() */ ],
  "supplemental": [ /* MapServer-only alerts, same shape as fetchMapServerSupplement().alerts */ ],
  "counts": { "alerts": 220, "supplemental": 4 },
  "sources": {
    "nws": { "pages": 1, "ms": 361 },
    "mapServer": { "mode": "id-first", "mapServerIds": 223, "missingIds": 2, "geometryRequests": 1, "fallbackLayers": [], "ms": 320 }
  }
}
```

- **`alerts[]`** has the same fields `normalizeAlerts()` in
  `src/app/api/noaaWeather.js` produces: `id, type, headline, description,
  instruction, severity, urgency, certainty, sent, effective, onset, expires,
  senderName, affectedArea, geocode, affectedZones, parameters, geometry`.
  Geometry is flattened to Polygon/MultiPolygon, the same way the client does it.
- **`supplemental[]`** has the same fields as the client's MapServer
  supplement: `id, type, severity, urgency, geometry, geocode: null,
  source: "NWS"`. It only includes ids that are **not** in `alerts[]`, and
  one entry per MapServer segment row, as the client receives them today.
- **Zone, county and CWA geometry fallback and FEMA IPAWS merging stay in
  the client.** The client would feed `alerts` and `supplemental` into the
  same `enrichAlertsWithGeometry()` and `mergeAlerts()` it already runs, so
  what users see is unchanged.

Response headers:

| Header | Value |
|---|---|
| `ETag` | Content hash of `alerts` and `supplemental`, excluding `generatedAt`. Send `If-None-Match` to get a `304` when nothing changed. |
| `Cache-Control` | `public, max-age=0, s-maxage=<seconds left in TTL>, must-revalidate`; `no-store` when `stale: true` |
| `X-Sentinel-Cache` | `hit` / `miss` / `coalesced` / `stale` |

Errors: `502 {"error":"NWS alert data is temporarily unavailable."}` when
api.weather.gov fails and no snapshot recent enough to serve exists; `429`
above `NWS_ALERTS_RATE_LIMIT_PER_MINUTE` per client per instance. Upstream
details never reach the client.

`GET /health` returns aggregate counters (requests, cache hits, misses,
coalesced and stale serves, 304s, ingest failures, upstream requests) and
the current snapshot age. It contains no alert data.

## Freshness

| Setting | Default | Meaning |
|---|---|---|
| `NWS_ALERTS_CACHE_TTL_SECONDS` | `45` | Snapshot lifetime. Matches the Netlify `lifeSafety` tier and the client's own 45 s cache. |
| `NWS_ALERTS_MAX_STALE_SECONDS` | `300` | After a **failed** rebuild only, the last good snapshot may be served, flagged `stale: true` and `no-store`, for this long past its TTL. After that the service returns `502` rather than present old warnings as current. |

- An expired snapshot is never served *instead of* trying upstream. The first
  request after the TTL always rebuilds; concurrent requests wait for that
  one rebuild.
- In normal operation, no response is older than 45 s.
- There is **no background polling**. An idle service makes zero upstream
  requests, and with `--min-instances 0` it scales to zero.

## Ingestion and ID-first supplement

1. Every page of `/alerts/active?status=actual&message_type=alert,update`
   is fetched. `pagination.next` is only followed on the api.weather.gov
   origin, and there's a limit of 20 pages. An empty feed counts as a
   failure (the same rule the client uses), so it can never replace a good
   snapshot.
2. For each WWA layer, the service fetches distinct `cap_id`s only
   (`returnGeometry=false`, a few KB).
3. It then fetches geometry only for `cap_id`s missing from step 1, in
   `cap_id IN (…)` batches of 50.
4. If the id list is missing, malformed, truncated or contains ids that
   can't be safely quoted, or a geometry batch fails, that layer falls back
   to the full-layer query. The optimization may cost bandwidth when it
   fails; it never drops an alert. The MapServer is best-effort, as in the
   client: if it's down, the snapshot still builds from api.weather.gov.

`alerts.mjs` holds deliberate copies of the client's normalization and
ID-first logic, because each `cloud/*` service is its own build context.
`Tests/Vitest/nwsAlertsService.test.js` checks the two stay in step.

## Observability

Structured JSON logs (`severity` plus `jsonPayload`). No alert text, no
geometry, no IPs.

- `ingest`: `alerts`, `supplemental`, `nwsPages`, `mapServerMode`,
  `mapServerIds`, `mapServerMissingIds`, `mapServerGeometryRequests`,
  `mapServerFallbackLayers`, `upstreamRequests`, `upstreamBytes`,
  `upstreamMs`, `ingestMs`
- `ingest_failed` (ERROR): `error`
- `alerts`: `status`, `cacheStatus`, `ageMs`, `alerts`, `supplemental`,
  `responseBytes`, `latencyMs`
- `alerts_unavailable` (ERROR), `rate_limited` (WARNING)

Every line carries `revision` (Cloud Run's `K_REVISION`).

Suggested log-based metrics:
- NOAA request volume: sum of `jsonPayload.upstreamRequests` where `message="ingest"`
- Cache hit rate: count of `message="alerts"`, grouped by `jsonPayload.cacheStatus`
- Ingestion failures: count of `message="ingest_failed"` (alert on more than 3 in 5 minutes)
- Supplement fallback rate: count of `message="ingest"` with `jsonPayload.mapServerMode="fallback"`

## Deploy

Replace `<PROJECT_ID>` and `<REGION>` throughout, using the same project
and region as the other `cloud/*` services.

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud artifacts repositories create nws-alerts \
  --repository-format=docker \
  --location=<REGION>

# from the repo root
gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/nws-alerts/nws-alerts:latest \
  cloud/nws-alerts

gcloud run deploy nws-alerts \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/nws-alerts/nws-alerts:latest \
  --region <REGION> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --concurrency 80 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 60s \
  --set-env-vars ALLOWED_ORIGINS=https://app.nationalwildfiretrackingteam.org,NWS_USER_AGENT="SentinelWildfireTracker/1.0 (<ops contact email>)"
```

- **`--allow-unauthenticated`** is intentional. The service serves public
  federal data and holds no secrets, the same as the other `cloud/*` data
  proxies. `ALLOWED_ORIGINS` limits browser CORS to Sentinel. Add the
  deploy-preview and branch origins if those builds should use it.
- **`NWS_USER_AGENT`:** api.weather.gov asks every client to include a
  contact. Put the team's ops mailbox in it; don't commit it here.
- **Sizing:** one snapshot is about 1–2 MB in memory, so 512Mi is ample.
  Each instance holds its own snapshot, so `--max-instances 3` bounds NOAA
  load to at most three builds per 45 s.

### Optional environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NWS_ALERTS_CACHE_TTL_SECONDS` | `45` | Snapshot lifetime |
| `NWS_ALERTS_MAX_STALE_SECONDS` | `300` | Stale-on-error bound |
| `NWS_ALERTS_RATE_LIMIT_PER_MINUTE` | `120` | Per-client limit, per instance |
| `NWS_USER_AGENT` | generic Sentinel UA | Identifies Sentinel to api.weather.gov |
| `ALLOWED_ORIGINS` | *(unset → `*`)* | Comma-separated CORS allowlist |
| `NWS_API_BASE` | `https://api.weather.gov` | Upstream override |
| `WWA_MAPSERVER_URL` | NOAA WWA MapServer | Upstream override |

### 4. Verify independently

```bash
URL=$(gcloud run services describe nws-alerts --region <REGION> --format 'value(status.url)')
curl "$URL/health"
curl -s -D - -o /tmp/nws.json "$URL/v1/alerts" | grep -iE 'etag|x-sentinel-cache'
python3 -c "import json;d=json.load(open('/tmp/nws.json'));print(d['counts'],d['sources'])"
```

Then compare with the live app over a few refresh cycles:

- **Counts:** `counts.alerts` should match the `[WeatherAlerts] NWS fetch
  complete: N alerts` console line.
- **Supplement:** `supplemental` ids should match the `[WeatherAlerts]
  MapServer supplement:` stats line (same `missingIds`).
- **Rendering:** spot-check a few warnings' polygons on the map. Also check
  them on a severe-weather day, when alert counts and pagination are at
  their highest.

### 5. Wire up the client

Set the `VITE_NWS_ALERTS_SERVICE_URL` repository secret to the service URL.
It is passed to the production build in `.github/workflows/deploy.yml`.
When it's set, `useWeatherAlerts` reads `alerts` and `supplemental` from
`/v1/alerts` in place of `fetchNWSAlerts()` and
`fetchMapServerSupplement()`. Zone geometry enrichment, FEMA merging and the
60 s refresh are unchanged.

To roll back, unset the secret and redeploy. Any single failed request
already falls back to the Netlify path by itself.

Only the origins in `ALLOWED_ORIGINS` can call the service from a browser.
A deploy preview or branch build that sets the variable needs its origin
added there, or CORS blocks the request and that build quietly uses the
Netlify path.

## Local development

```bash
cd cloud/nws-alerts && PORT=8793 node index.mjs
curl -s localhost:8793/v1/alerts | head -c 400
```

Unit tests: `npx vitest run Tests/Vitest/nwsAlertsService.test.js`
