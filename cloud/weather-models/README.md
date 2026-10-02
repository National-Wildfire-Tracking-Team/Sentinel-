# weather-models

Sentinel's numerical weather model service. It reads NOAA **HRRR** and **GFS** forecasts straight from dynamical.org's Icechunk/Zarr datasets on AWS Open Data. It returns small normalized point forecasts to the live map's **Models** tab (next to All Hazards / Wildfire / Weather) and to the incident panel's model summary.

```
s3://dynamical-noaa-hrrr ┐  (us-west-2, public, anonymous reads)
s3://dynamical-noaa-gfs  ┘
        │  only the chunks a request needs (2-4 MB per variable)
        ▼
weather-models  (Python 3.13, Lambda arm64, us-west-2)   providers/ → service.py → normalize.py
        │  /weather-models/v1/forecast · /v1/models
        ▼
CloudFront (the SentinelDataServices distribution, edge cache)
        ▼
Sentinel web app: live map Models tab, incident panel summary
```

All of it is **model output**. It is never mixed with observations (RAWS) or alerts (NWS/SPC). Every response says so (`kind: "model-forecast"`, `notice`) and names the model and run behind every number.

## Data sources

| | HRRR | GFS |
|---|---|---|
| Dataset | `noaa-hrrr-forecast-48-hour` v0.1.0 | `noaa-gfs-forecast` v0.2.7 |
| Location | `s3://dynamical-noaa-hrrr/noaa-hrrr-forecast-48-hour/v0.1.0.icechunk` | `s3://dynamical-noaa-gfs/noaa-gfs-forecast/v0.2.7.icechunk` |
| AWS region | us-west-2 | us-west-2 |
| Marketplace | [prodview-hzxypd2ui7whu](https://aws.amazon.com/marketplace/pp/prodview-hzxypd2ui7whu) | [prodview-g6r32hvhd37uc](https://aws.amazon.com/marketplace/pp/prodview-g6r32hvhd37uc) |
| Operator / processor | NOAA NWS NCEP / dynamical.org | NOAA NWS NCEP / dynamical.org |
| License | CC-BY-4.0 (attribution in every response) | CC-BY-4.0 |
| Domain | Continental U.S. | Global |
| Grid | 3 km Lambert conformal conic (1059 × 1799) | 0.25° regular lat/lon (721 × 1440) |
| Runs | 00, 06, 12, 18 UTC (the 48 h runs) | 00, 06, 12, 18 UTC |
| Lead times | 0-48 h, hourly | 0-120 h hourly, then every 3 h to 384 h |
| Typical arrival | ~2 h after init | ~5 h after init |

### Dataset structure

Both datasets are Icechunk repositories (Zarr v3) with these dimensions and coordinates:

- **Dimensions:** `(init_time, lead_time, <y|latitude>, <x|longitude>)`.
- **Time coordinates:**
  - `init_time` is int64 seconds since the epoch.
  - `lead_time` is float64 seconds.
  - `valid_time = init_time + lead_time`.
  - `expected_forecast_length` is the planned length of each run.
  - `ingested_forecast_length` is also present but is empty (NaT) on recent runs, so the service doesn't rely on it.
- **Missing data:** values that haven't been ingested read as the fill value, NaN.
- **Chunking:**

  | Model | Chunk (init × lead × y × x) | Sharded into |
  |---|---|---|
  | HRRR | 1 × 49 × 265 × 300 | 1 × 49 × 1060 × 1800 |
  | GFS | 1 × 105 × 121 × 121 | 1 × 210 × 726 × 726 |

  One chunk holds every lead time of one run for one tile. A point read fetches one compressed chunk per variable. For HRRR that tile covers ~800 × 900 km, so nearby points share chunks.
- **HRRR u/v winds** are *grid-relative* (along the Lambert grid's x/y axes). The service rotates them to true north before computing direction, by up to ~13° in the far west and east. GFS winds are already east/north.

## Variables

The service returns only what the model provides. A variable a model lacks is listed in `unavailableVariables` and never estimated: GFS has no gust field, and no dew point is derived for GFS.

| Variable | Source (both models unless noted) | Level | Timing | `us` units | `si` units |
|---|---|---|---|---|---|
| `temperature` | `temperature_2m` | 2 m | instant | °F | °C |
| `dewPoint` | `dew_point_temperature_2m` (**HRRR only**) | 2 m | instant | °F | °C |
| `relativeHumidity` | `relative_humidity_2m` | 2 m | instant | % | % |
| `windSpeed` | from `wind_u_10m`, `wind_v_10m` | 10 m | instant | mph | m/s |
| `windDirection` | from `wind_u_10m`, `wind_v_10m` | 10 m | instant | ° from, true north (`null` when calm) | ° |
| `windGust` | `wind_gust_surface` (**HRRR only**) | surface | instant | mph | m/s |
| `precipitationRate` | `precipitation_surface` | surface | average over the preceding step | in/h | mm/h |
| `precipitationAmount` | `precipitation_surface` × step length | surface | total in the preceding step | in | mm |
| `pressureSurface` | `pressure_surface` | surface | instant | hPa | hPa |
| `pressureMsl` | `pressure_reduced_to_mean_sea_level` | MSL | instant | hPa | hPa |
| `cloudCover` | `total_cloud_cover_atmosphere` | atmosphere | instant | % | % |

When a request doesn't name variables it gets the fire-weather inputs: `temperature, relativeHumidity, windSpeed, windDirection, windGust, precipitationRate, precipitationAmount, pressureSurface`.

### Forecast semantics

- **Observed vs forecast.** Every value is a *model forecast valid at `validTime`*. None of it is an observation. `forecastHour` is hours after `run.runTime`. Lead hour 0 is the model's analysis, which is still model output.
- **Precipitation.** The dataset stores the *average rate since the previous forecast step*. So, for each entry:
  - `precipitationPeriodHours` is the length of that step: 1 h for HRRR, 1 h for GFS to 120 h, then 3 h.
  - `precipitationRate` is the average rate over the window `(validTime − period, validTime]`.
  - `precipitationAmount` is the total that fell in that same window only.

  Amounts are not cumulative. Don't sum entries with different periods as if they were the same window. Both values are `null` at hour 0, which has no preceding step.
- **Missing values** are `null`, never interpolated.
- **Location.** Values are for the **nearest grid cell**. `gridPoint` gives the cell centre and its distance from the requested point; there is no interpolation.

## API

Base path behind CloudFront: `https://<distribution>/weather-models`. The frontend reads it from `VITE_WEATHER_MODEL_SERVICE_URL`.

### `GET /v1/forecast`

| Param | Required | Default | Notes |
|---|---|---|---|
| `lat` (`latitude`) | yes | | −90…90 |
| `lon` (`lng`, `longitude`) | yes | | −180…180 |
| `model` | no | `auto` | `hrrr`, `gfs`, `auto` |
| `hours` (`forecastHours`) | no | HRRR 48, GFS 168 | 0…48 for HRRR, 0…384 for GFS |
| `variables` | no | fire-weather set | comma-separated names from the table above |
| `units` | no | `us` | `us` or `si` |

**`auto` selection rule:**
- It uses **HRRR** when the point is inside the HRRR grid and `hours` is not set or is 48 or less. Otherwise it uses **GFS**.
- If HRRR was chosen but returns no usable data (missing, stale or a read error), auto falls back to GFS. `modelSelection.fallbackFrom = "hrrr"` and a reason are included.
- An explicit `hrrr` or `gfs` request never falls back.
- `model` in the response is always the model that produced the numbers.

Abridged response:

```json
{
  "schemaVersion": 1,
  "kind": "model-forecast",
  "notice": "Numerical weather model forecast. These values are model output, not observed conditions, …",
  "model": { "id": "hrrr", "name": "HRRR", "fullName": "High-Resolution Rapid Refresh", "operator": "NOAA NWS NCEP", "resolution": "3 km", "domain": "Continental United States" },
  "modelSelection": { "requested": "auto", "mode": "auto", "reason": "auto: inside the HRRR domain and within 48 h" },
  "source": { "dataset": "noaa-hrrr-forecast-48-hour", "datasetVersion": "0.1.0", "uri": "s3://dynamical-noaa-hrrr/…", "region": "us-west-2", "processedBy": "dynamical.org", "attribution": "…", "license": "CC-BY-4.0", "snapshot": "KCSTYB7J0PC0G0ERBM4G" },
  "location": { "lat": 34.05, "lon": -118.25 },
  "gridPoint": { "lat": 34.05436, "lon": -118.26541, "distanceKm": 1.5, "method": "nearest grid cell" },
  "run": { "runTime": "2026-10-01T12:00:00Z", "ageMinutes": 132, "stale": false, "staleAfterHours": 12, "complete": true, "forecastHoursAvailable": 48, "forecastHoursExpected": 48, "selection": "latest", "newestRunTime": "2026-10-01T12:00:00Z" },
  "retrievedAt": "2026-10-01T14:12:41Z",
  "requestedHours": 48,
  "units": { "temperature": "°F", "windSpeed": "mph", "precipitationAmount": "in", "…": "…" },
  "unitSystem": "us",
  "variables": { "temperature": { "label": "Air temperature", "level": "2 m above ground", "timeSemantics": "instant", "description": "…" } },
  "unavailableVariables": [],
  "forecast": [
    { "validTime": "2026-10-01T18:00:00Z", "forecastHour": 6, "precipitationPeriodHours": 1, "temperature": 79.2, "relativeHumidity": 61, "windSpeed": 2.7, "windDirection": 228, "windGust": 3.2, "precipitationRate": 0.0, "precipitationAmount": 0.0, "pressureSurface": 998.4 }
  ]
}
```

Every field the brief asked for is present on every response:

| Requirement | Field |
|---|---|
| Source | `source` |
| Model | `model` |
| Run time | `run.runTime` |
| Valid time | `forecast[].validTime` |
| Forecast hour | `forecast[].forecastHour` |
| Retrieval time | `retrievedAt` |
| Data age | `run.ageMinutes` |
| Units | `units` |

### `GET /v1/models`

The model catalog. For each model it gives:
- identity, resolution and source
- supported variables
- the newest run and its age
- all lead hours
- `coverage`: a GeoJSON polygon of the HRRR grid outline, or `null` for GFS, which is global

The frontend draws the coverage outline and uses it to send out-of-domain points straight to GFS. Each model degrades separately: a broken dataset marks that model `status: "unavailable"` and leaves the other model's entry intact.

### `GET /health`

Counters and point-cache stats. It never touches S3, because it is the Lambda Web Adapter's readiness check.

### Errors

Every error is `{ "schemaVersion": 1, "error": { "code", "message" } }` with `Cache-Control: no-store`. Errors are never cached, and a partial or fabricated forecast is never returned.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_parameter` | missing or invalid `lat`/`lon`, unknown `model`/`units`/variable, `hours` out of range, or only unavailable variables requested |
| 422 | `out_of_domain` | `model=hrrr` for a point outside CONUS |
| 429 | `rate_limited` | over `WEATHER_MODELS_RATE_LIMIT_PER_MINUTE` per client (uncached requests only) |
| 502 | `dataset_error` | S3/Icechunk open or read failure, or the dataset's grid changed (see "Grid changes" below) |
| 503 | `no_data` | none of the newest 3 runs has data at this grid cell |
| 503 | `stale_data` | the newest usable run is older than `max_age_hours` (HRRR 24 h, GFS 36 h) |
| 500 | `internal_error` | unexpected processing error (logged as `forecast_exception`) |

### Run selection (latest-run discovery)

No run is assumed. For each request, the service:

1. Reads the run list (`init_time`, ~100 KB) once per Icechunk snapshot. The session is refreshed every 60 s, which is how new runs appear.
2. Reads the completeness variable (`temperature_2m`) at the grid cell for the newest 3 runs, newest first, stopping at the first that works. A run's available hours are the lead times before its first NaN.
3. Uses the newest run that covers the requested hours, up to its planned length. A run still arriving is used if it already covers them (`complete: false`, `selection: "latest"`).
4. Otherwise falls back to the previous run (`selection: "newest-run-incomplete"`). If no run covers the hours, it uses the run with the most hours (`selection: "partial-run"`).
5. Flags runs older than `stale_after_hours` (HRRR 12 h, GFS 18 h) with `stale: true`, and refuses runs older than `max_age_hours`.

### Grid changes

On each new snapshot the providers check the dataset's x/y or lat/lon coordinates against the projection they assume. If dynamical.org regrids, requests fail with `dataset_error` instead of quietly returning the wrong cell.

## Caching

Each layer is listed cheapest first:

1. **CloudFront** (the existing `OriginDrivenCachePolicy`, keyed on the query string). Responses carry:
   - `s-maxage=600` when the run is complete and the newest one;
   - `s-maxage=120` when the answer is provisional (stale, incomplete, an older run, or an auto fallback);
   - `s-maxage=300` for `/v1/models`.

   Browsers always revalidate (`max-age=0`). The frontend rounds coordinates to 0.01° (~1 km, finer than either grid) so nearby users share edge entries. Worst case, a new run appears at the edge 10 minutes after it lands.
2. **Point cache** (`cache.py`, in Lambda memory). One entry per (model, run, grid cell, dataset variable), holding a few hundred floats. A complete run never changes, so its entries live 6 h; entries for a run still arriving expire after 60 s. Any variable mix or units for the same cell and run reuses them.
3. **Icechunk chunk cache** (256 MB per instance, `WEATHER_MODELS_CHUNK_CACHE_MB`). This holds the compressed chunks behind those series. A second location in the same ~800 km HRRR tile costs no S3 read. Measured: 56 ms versus ~1-5 s for the first read.

Both weather-model origins sit behind **CloudFront Origin Shield** in us-west-2. After a new run, the first edge to ask for a frame or point fills one regional cache, and every other edge fills from it.

**Keep-warm.** An EventBridge rule invokes the API function every 5 minutes. The Lambda Web Adapter delivers that event as `POST /events`, which opens each dataset's session and reads its run index. One instance therefore stays initialised, and a user's first click skips the multi-second cold start. CloudFront allows only GET, so the path isn't public.

Nothing is persisted, and there's no DynamoDB, ElastiCache or S3 cache. Cold starts refill from a few S3 range requests. If traffic grows enough that cold-instance misses dominate cost, the next step is a small S3 or DynamoDB cache of normalized point series keyed `model/run/iy/ix`, shared across instances.

## Configuration

| Env var | Default | |
|---|---|---|
| `PORT` | 8080 | the Lambda Web Adapter's port |
| `ALLOWED_ORIGINS` | *(unset → `*`)* | comma list; the data is public, so `*` is fine |
| `WEATHER_MODELS_CHUNK_CACHE_MB` | 256 | Icechunk chunk cache per instance |
| `WEATHER_MODELS_SESSION_TTL_SECONDS` | 60 | how often to look for a new snapshot (new run) |
| `WEATHER_MODELS_POINT_CACHE_ENTRIES` | 20000 | point-cache LRU size |
| `WEATHER_MODELS_S_MAXAGE_SECONDS` | 600 | edge TTL for complete, current answers |
| `WEATHER_MODELS_RATE_LIMIT_PER_MINUTE` | 120 | per client IP, uncached requests only |
| `HRRR_STALE_AFTER_HOURS` / `HRRR_MAX_AGE_HOURS` | 12 / 24 | |
| `GFS_STALE_AFTER_HOURS` / `GFS_MAX_AGE_HOURS` | 18 / 36 | |

None of these is a secret, and the service needs no credentials (see IAM below).

## IAM and security

- **Datasets are read anonymously.** `icechunk.s3_storage(..., anonymous=True)` sends unsigned requests to the public Open Data buckets. The Lambda role therefore has **no S3 permissions at all**; it can only write its own log group (`/sentinel/weather-models`).
- **The browser never touches S3 or Icechunk.** The frontend calls only this service through CloudFront.
- **Function URL** is `AuthType AWS_IAM`, reachable only through CloudFront Origin Access Control. Its invoke permission is limited to CloudFront distributions in this account. Set `sentinel:distributionId` after the first deploy to narrow it to the one distribution.
- **No secrets** exist in code, config or the frontend. `tests/test_security.py` scans the feature's files for AWS keys, credential env vars and private keys, and checks the storage call is anonymous.
- **Logs** never contain the requested location, client IPs or forecast values.

## Observability

Each request writes one JSON log line. That line is also CloudWatch Embedded Metric Format, which creates metrics in the `Sentinel/WeatherModels` namespace (dimension `Service=weather-models`). There are no extra API calls or IAM permissions.

| Metric | Meaning |
|---|---|
| `weather_requests` | `/v1/forecast` requests that reached Lambda (edge hits never do) |
| `hrrr_requests`, `gfs_requests` | by the model that answered |
| `cache_hits`, `cache_misses` | point-cache lookups (per variable series) |
| `model_data_latency` | ms spent reading the dataset, on misses only |
| `dataset_errors` | S3/Icechunk failures (502s) |
| `stale_data_events` | stale runs served or refused |

The following alarms live in us-west-2 and go to the `alarmEmail` address:
- Lambda errors, throttles and p95 latency
- `dataset_errors` above 5 per 5 minutes
- `stale_data_events` above 10 per 5 minutes, which signals that dynamical.org's ingest has stopped

The metrics are also graphed on the existing `sentinel-data-services` dashboard.

## Cost

**Main cost drivers, in order:**

1. **Lambda compute, on edge misses only.** This is 1769 MB arm64 (~$0.0000267 per second).
   - A cold miss takes ~1-3 s in-region, about $0.00005.
   - A warm miss in a cached tile takes under 100 ms.
   - A few thousand misses a day comes to well under $5 a month.
2. **CloudFront requests and transfer.** Responses are ~2-6 KB gzipped, so this is negligible.
3. **S3.** These buckets are AWS Open Data, so dynamical.org pays for requests and storage. **Same-region transfer to Lambda is free**, which is why the function runs in us-west-2. From us-east-1, every uncached point read (~20-25 MB of chunks) would cost $0.02/GB in inter-region transfer.
4. **CloudWatch Logs.** One ~600-byte line per uncached request, kept 14 days.

**Already avoided:**
- No whole-dataset downloads, and no permanent storage.
- No VPC or NAT gateway, no always-on compute, and no browser-side dataset reads.
- No repeated identical S3 reads, thanks to the point cache and the chunk cache.

**Guards:**
- the per-IP rate limit
- the account budget in SentinelDataServices
- an optional reserved-concurrency cap (`sentinel:weatherModelsReservedConcurrency`)

## Develop and test

```bash
cd cloud/weather-models
# Unit + API tests: offline, synthetic in-memory Icechunk datasets with the real grids
uv run --python 3.13 --with-requirements requirements-dev.txt pytest

# Run locally against the real public datasets (anonymous, read-only)
PORT=8091 uv run --python 3.13 --with-requirements requirements.txt python app.py
curl 'localhost:8091/v1/forecast?lat=34.05&lon=-118.25&model=hrrr&hours=6'

# Frontend against it
VITE_WEATHER_MODEL_SERVICE_URL=http://localhost:8091 npm run dev   # from the repo root
```

## Build and deploy

The service is defined in `infra/aws/lib/weather-models-stack.mjs` (`SentinelWeatherModels`, us-west-2). The `/weather-models/*` route on the existing distribution is in `data-services-stack.mjs`. Both are **opt-in**: nothing changes until the app is synthesized with `-c sentinel:weatherModels=enabled`. The steps are in [infra/aws/README.md](../../infra/aws/README.md#weather-models).

The Lambda zip is built with `uv` for `aarch64-manylinux_2_28` / Python 3.13 (no Docker). Without `uv`, CDK falls back to the Lambda Python build image in Docker. The zip is ~114 MB unzipped, under Lambda's 250 MB limit.

## Adding a model

1. Subclass `WeatherModelProvider` in `providers/<model>.py`. Set the identity, the dataset location, `SOURCES` (normalized variable → dataset variables, listing only what the dataset really has), the forecast range, and the stale/max-age thresholds. Implement `locate()`, plus `earth_relative_wind()` if its winds aren't east/north, `validate_grid()`, and `domain_geojson()` for regional models.
2. Register it in `providers/__init__.py`. The API, catalog and metrics pick it up.
3. Add a synthetic-dataset fixture and tests like `tests/test_providers.py`.
4. Frontend: add its colour to `MODEL_STYLE` in `src/app/components/WeatherModels/modelTheme.js` (re-run the dataviz palette validator), an option to `ModelSwitcher`, and its id to `MODEL_MODES` in `src/app/hooks/useWeatherModels.js`.

## Map fields (the Models tab)

The Models tab is a map of model fields, not a set of points. The field builder turns each model run into map-ready images. The browser colours them, animates them through forecast time, and compares them. The point API above is used only to inspect a clicked location.

```
EventBridge, every 15 min ─▶ field builder Lambda (fields/, same code as the API)
   per model: has a newer *complete* run appeared? (one ~2 MB probe read; no → exit in seconds)
   per variable: one read of the whole run, all lead times (each chunk holds every lead time)
     → derive SI values → resample to Web Mercator (precomputed bilinear LUT; HRRR winds rotated to true north)
     → 8-bit PNG per forecast hour → s3://sentinel-weather-model-fields-<account>/weather-models/fields/v1/…
   HRRR − GFS frames at shared valid times; manifest.json written last
CloudFront /weather-models/fields/* ─Origin Shield (us-west-2)─OAC─▶ that bucket (frames immutable, manifest 60 s + 5 min stale-while-revalidate)
Browser: Mapbox image source + raster layer coloured by `raster-color`; canvas wind particles; second synced map for swipe
```

**Why per run, not per request.** Each dataset chunk holds every lead time. Reading one forecast hour therefore costs as much as reading all of them: about 63 MB per HRRR variable for the whole CONUS run. A run is built once, and every map request after that is a static CDN hit.

### Coverage, grids, frames

| | Area | Frames | Typical size |
|---|---|---|---|
| HRRR | its full Lambert grid (the CONUS) | `lo` 900 px (default; used for animation) and `hi` 1800 px (~3 km; used when paused at zoom ≥ 5) | lo 140–220 KB, hi 400–730 KB |
| GFS | 10–75°N, 180–50°W (CONUS, Alaska, Hawaii, Canada, Mexico, adjacent oceans), native 0.25° | `lo` 520 px | 60–120 KB |
| Difference | HRRR's area, HRRR `lo` grid | one size | ~220 KB |
| Wind vectors | each model, half the `lo` grid | RGBA, R = u, G = v | particles only |

**Frame encoding.** Each frame is an 8-bit greyscale PNG:
- byte 0 means no data (drawn transparent);
- bytes 1–255 map the variable's range, linearly or on a square-root scale for precipitation;
- the browser maps bytes to colour with `raster-color`, so palettes and units change without new images;
- frames are for display only (temperature resolves to about 0.35 °C). Clicked values come from the point API at full precision.

The Python encoding (`fields/variables.py`) and the JavaScript decoding (`src/app/api/modelFields.js`) are tested against the same numbers.

**Object keys** (under `weather-models/fields/v1/`):
- `{model}/{runId}/{variable}/{lo|hi}/{hour:03d}.png`
- `{model}/{runId}/wind/{hour:03d}.png`
- `diff/{hrrrRunId}_{gfsRunId}/{variable}/{YYYYMMDDTHHMMZ}.png`
- `manifest.json`: runs, hours, valid times, image corners, encodings, palettes, and the difference set.

**Current run.** A model's current run is its newest *complete* run. Until a newer run finishes, the previous one stays on the map. If no recent run is complete, the newest partial run is used and marked `complete: false`.

### Variables

| Map variable | HRRR | GFS | Difference (HRRR − GFS) | Notes |
|---|---|---|---|---|
| Temperature (2 m) | ✓ | ✓ | ✓ ±10 °C | |
| Humidity (2 m) | ✓ | ✓ | ✓ ±40 % | browns are dry (fire-weather concern) |
| Wind (10 m) + particles | ✓ | ✓ | ✓ ±15 m/s | particles use true-north u/v |
| Gusts | ✓ | — | — | not in GFS |
| Precipitation rate | ✓ | ✓ | ✓ ±10 mm/h, only where both average over the same step | average over the preceding step (1 h; GFS 3 h after 120 h) |
| Precip total | ✓ | ✓ | — | since each run's own start, so not comparable |
| Sea-level pressure | ✓ | ✓ | ✓ ±10 hPa | |
| Surface pressure | ✓ | ✓ | — | mostly terrain height, which differs by model resolution |
| Cloud cover | ✓ | ✓ | — | |

Difference frames exist only at valid times both current runs share. The legend and the timeline name both runs, both forecast hours, and "HRRR − GFS". Near-zero differences (within a tenth of the range) are drawn clear, so any colour on the map means the models genuinely disagree there.

### Frontend

- **Bottom bar:** the **Models** tab sits next to Weather. The map switches to flat Mercator, terrain is turned off, and operational layers are off.
- **Controls (top left):** HRRR / GFS / Compare (Swipe or Difference), a variable list (unavailable variables disabled, with the reason), and a wind-particles toggle.
- **Legend (top):** the colour scale, plus model, variable, units, valid time, forecast hour, run and age, and "Model forecast".
- **Timeline (bottom):** play/pause, a scrubber, and jumps (Now, +1h … +384h). It steps a valid time, so each model shows its own forecast hour for that time.
- **Loading fast:** the last manifest is kept in `localStorage` (used for up to 6 h) so the tab draws at once while a fresh one loads, and the live map fetches the manifest when idle and preconnects to the CDN before the tab is opened. Hovering, focusing or pressing the tab button fetches the frame the tab opens on. After that, a shared queue (`usePreloadFrames`, four requests at a time, low priority) warms frames in the order `prefetchPlan` gives: the next steps, the frame behind, the jump buttons, the same moment in the other variables and the other model, and the 3 km frames once zoomed to 4 or closer. While playing, it warms the whole loop. With a precise pointer (a desktop), it also warms the rest of the timeline for scrubbing. With Save-Data or a 2G/3G connection, it fetches only the first few.
- **Swipe:** HRRR on the main map, GFS on a second map synced to the first and clipped right of a draggable divider (keyboard: ←/→). Each swipe session is one extra Mapbox map load.
- **Click to inspect:** a popup with the point API value for the selected variable and time, from each model shown, plus HRRR − GFS in Compare. If the point API's run is newer than the map's, the popup says so. "Point forecast" opens the sidebar's full point panel.
- **Code:** `WeatherModelsContext` (state, mirrored to `/?tab=models&model=&var=&view=&lat=&lon=`), `WeatherModelsMapLayer`, `ModelFieldLayer`, `WindParticles`, `SwipeCompare`, `ModelFieldLegend`, `ModelFieldControls`, `ModelFieldTimeline` and `ModelInspectPopup`.

### Local development with real fields

```bash
cd cloud/weather-models
uv run --python 3.13 --with-requirements requirements.txt python -m fields /tmp/fields   # ~2–3 min, ~450 MB, reads the public datasets
WEATHER_MODELS_FIELDS_DIR=/tmp/fields PORT=8091 uv run --python 3.13 --with-requirements requirements.txt python app.py
# repo root:
VITE_WEATHER_MODEL_SERVICE_URL=http://localhost:8091 npm run dev     # then open the Models tab
```

`WEATHER_MODELS_FIELDS_DIR` is for development only. In production, CloudFront serves `/weather-models/fields/*` from S3 and never reaches the API Lambda.

### Field pipeline cost (from a measured build)

These figures are estimates: the measured workload multiplied by us-west-2 list prices. They are not a bill, because the pipeline hasn't been deployed. After deploying, check them in Cost Explorer filtered by the tag `component = weather-models`, and against the builder's `field_build_seconds` metric.

**Measured, one full build of both models plus differences**, run locally against the live datasets:
- 3,056 frames, 455 MB written;
- 120–155 s wall time, 120–225 CPU-seconds;
- 1.5–2.6 GB peak memory, which is why the builder has 4 GB.

**Assumptions:**
- 8 builds a day: each model's 4 runs complete at different times.
- 88 no-op checks a day, about 6 s each, including a cold start.
- A build takes about 200 s on Lambda, conservatively; 4 GB is about 2.3 Graviton vCPUs.

| Driver | Volume | List price / month |
|---|---|---|
| S3 PUTs | ~13,200/day (HRRR 931 + GFS 1,881 per run, differences 244 per build) | **$1.98** |
| Lambda (builder) | ~255,000 GB-s | **$3.40** (normally covered: Lambda's always-free tier is 400,000 GB-s/month per account) |
| S3 storage | ~4.4 GB on average (3-day expiry) | $0.10 |
| EventBridge schedule | 2,880 invocations | $0 |
| CloudFront transfer | ~12 MB per animated session: 1,000 sessions ≈ 12 GB, 10,000 ≈ 120 GB | $1.02 / $10.20 at list (always-free tier: 1 TB/month) |
| CloudWatch | 4 builder metrics, 2 alarms | $0 within the free tier (10 metrics, 10 alarms), else about $1.40 |

**Expected total:** about $2.10/month with the Lambda and CloudFront free tiers, or about $5.50 at full list price, before viewer traffic.

**If it must stay under $2 at list price,** in order of impact:
- build GFS for the 00Z and 12Z runs only: saves about $0.56 of S3 writes and about $1.20 of Lambda;
- stop GFS frames at 240 h instead of 384 h: about −20 % of GFS writes;
- write HRRR `hi` frames only for temperature, humidity, wind, gusts and precipitation: about −20 % of HRRR writes.
