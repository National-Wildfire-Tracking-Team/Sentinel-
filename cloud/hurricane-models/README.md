# hurricane-models

Live hurricane model guidance ("spaghetti models") for Sentinel, from NOAA's
National Hurricane Center ATCF data. One service reads each storm's guidance
file once per change and serves normalized model tracks to every user. Before
this, each browser downloaded a 250 KB+ gzipped file and parsed about 20,000
lines itself.

```
NHC ATCF a-deck (ftp.nhc.noaa.gov)          NHC CurrentStorms.json
        │  conditional GET (ETag / Last-Modified), every 5 min on demand
        ▼
  hurricane-models  ── atcf.mjs (parse) → guidance.mjs (normalize) → in-memory cache
        │  /v1/hurricanes, /v1/hurricanes/{stormId}/models
        ▼
  CloudFront (honours s-maxage)  →  Sentinel: Spaghetti Models control → map tracks
```

Runs on AWS Lambda behind the shared CloudFront distribution
(`infra/aws`, path `/hurricane-models`). The frontend uses it only when
`VITE_HURRICANE_MODELS_URL` is set. Without it, the browser reads the same
file through the existing `/api/nws/nhc-atcf` edge proxy and runs the **same
normalizer**, so both paths return the same response.

## NOAA data sources

All of these were checked against the live servers on 2026-10-08.

| What | URL | Format |
|---|---|---|
| Model guidance, current season | `https://ftp.nhc.noaa.gov/atcf/aid_public/a{bb}{nn}{yyyy}.dat.gz` | gzipped ATCF a-deck text |
| Model guidance, past seasons | `https://ftp.nhc.noaa.gov/atcf/archive/{yyyy}/a{bb}{nn}{yyyy}.dat.gz` | same |
| Active storms | `https://www.nhc.noaa.gov/CurrentStorms.json` | JSON |

`bb` is the basin (`al` Atlantic, `ep` East Pacific, `cp` Central Pacific),
`nn` the storm number (01–49 for depressions and storms, 90–99 for invests),
and `yyyy` the year. The decks are public: no credentials, no API key. Nothing
here scrapes NOAA graphics or web pages.

Upstream URLs are built only from a validated storm id (`parseStormId`: basin
in AL/EP/CP, a valid number, a year no later than this one) on a fixed host.
Callers cannot supply a URL, host or path, and any query parameter other than
`cycle` is rejected.

## ATCF a-deck format

Comma-separated text, one line per **technique** (model or aid), **cycle**
and **forecast hour (tau)**. Each hour repeats once per wind-radii threshold
(34, 50 and 64 kt), with the same position. These are the fields Sentinel
reads, 0-based (full spec:
[abdeck.txt](https://www.nrlmry.navy.mil/atcf_web/docs/database/new/abdeck.txt)):

| # | Field | Example | Notes |
|---|---|---|---|
| 0 | basin | `AL` | |
| 1 | storm number | `09` | |
| 2 | cycle | `2026100806` | YYYYMMDDHH, the init time |
| 4 | technique | `HFSA` | model id |
| 5 | tau | `12` | forecast hour; negative = analysis history |
| 6/7 | lat / lon | `242N` `900W` | tenths of a degree → signed decimal (S, W negative) |
| 8 | max wind | `85` | kt; `0` = missing |
| 9 | min pressure | `970` | mb; `0` = missing |
| 10 | storm type | `HU` | |
| 11–16 | radii threshold, code, NE/SE/SW/NW | `34, NEQ, 110, 70, 50, 100` | nm; `AAA` = one full-circle value |
| 19 | RMW | | radius of max wind |
| 27 | storm name | `ISAIAS` | |

Only the first 10 fields are guaranteed; aids write anywhere from 9 to 40+.
The parser (`atcf.mjs`):

- treats `0N 0W`, wind 0 and pressure 0 as missing values, not data. Intensity-only aids write `0N 0W` at every hour;
- counts malformed lines by reason and skips them, never failing the whole file;
- drops lines filed under another storm;
- folds the 34/50/64-kt repeats into one point carrying all its wind radii;
- counts exact duplicate lines and conflicting positions (the first wins);
- sorts points by forecast hour.

## Supported models

The registry is [`registry.mjs`](registry.mjs), the only place model ids,
names and colors live.

| Id | Name | Category | ATCF techniques (raw, preferred first) | Runs every |
|---|---|---|---|---|
| `OFCL` | NHC Official | official | `OFCL` | 6 h |
| `HFSA` | HAFS-A | operational | `HFSA` | 6 h |
| `HFSB` | HAFS-B | operational | `HFSB` | 6 h |
| `AVNO` | GFS | operational | `AVNO` | 6 h |
| `EMX` | ECMWF | operational | `EMX`, `ECMF` | 12 h |
| `UKX` | UKMET | operational | `UKX`, `EGRR` | 12 h |
| `CMC` | CMC | operational | `CMC` | 12 h |
| `CTCX` | COAMPS-TC | operational | `CTCX` | 6 h |
| `HWRF` | HWRF | **legacy** | `HWRF` | 6 h |
| `HMON` | HMON | **legacy** | `HMON` | 6 h |

**Identifier notes**, verified against the live AL092026 a-deck:

- **UKMET** is published as `UKX` (interpolated `UKXI`/`UKX2`), not `EGRR`. `EGRR` stays as a fallback.
- **CMC** is published as `CMC` (interpolated `CMCI`/`CMC2`).
- **ECMWF** (`EMX`, `EMXI`, `EMX2`) is **not in NHC's public a-decks**. The
  model is always listed, as `status: "unavailable"` with an explanation.
  If NHC publishes it, the tracks appear automatically. Archived seasons do
  carry it; Ian 2022 (`AL092022`) has `EMX` runs.
- Sentinel draws the **raw** run of each model, which is the model's own
  forecast points from its own init time. The interpolated "early" versions
  (`HFAI`, `AVNI`, …) are adjusted to the current NHC position. They are
  listed under `related` and never drawn as separate tracks. A raw run
  usually lands about one cycle after its init time, so `initTime` is
  often 6–12 h before the newest cycle.

All other track guidance in the deck is returned in `guidance`, grouped as
consensus aids, statistical/trajectory, GEFS members and other models/means.
That covers what the old spaghetti groups showed. Intensity-only aids (SHIP,
LGEM, …) have no track and are left out.

### Legacy HWRF and HMON

HAFS replaced HWRF and HMON in 2023. Both have `category: "legacy"` and are
never in the default selection. The UI lists them under "Legacy (historical)",
and the map draws them dashed. Their runs are still read wherever a deck
carries them:

- **Past seasons:** `GET /v1/hurricanes/AL092022/models?cycle=2022092700`
  reads `atcf/archive/2022/` and returns Ian's HWRF/HMON tracks for that
  cycle.
- **Current decks:** NHC's 2026 decks still contain `HWRF`/`HMON` lines.
  These are returned with their real status, but stay labeled legacy.

## API

### `GET /v1/hurricanes`

Active storms from NHC's CurrentStorms.json:

```json
{
  "schemaVersion": 1,
  "source": "https://www.nhc.noaa.gov/CurrentStorms.json",
  "updatedAt": "2026-10-08T12:49:36Z",
  "stale": false,
  "storms": [
    { "stormId": "AL092026", "basin": "AL", "stormNumber": 9, "year": 2026, "name": "Isaias",
      "classification": "HU", "intensityKt": 70, "pressureMb": 975, "latitude": 23.7, "longitude": -90.6,
      "movementDirDeg": 60, "movementSpeedKt": 9, "lastUpdate": "2026-10-08T12:00:00.000Z",
      "binNumber": "AT4", "modelsPath": "/v1/hurricanes/AL092026/models" }
  ]
}
```

The Sentinel map doesn't need this list: it already finds storms (and their
ATCF ids) through the NHC MapServer layers, and invests by position. The
endpoint is for other API consumers.

### `GET /v1/hurricanes/{stormId}/models[?cycle=YYYYMMDDHH]`

`stormId` is the ATCF id (`AL092026`; case-insensitive). The optional `cycle`
(or an ISO time on the hour) answers as of an earlier cycle, which is how
historical runs are reached.

```json
{
  "schemaVersion": 1,
  "stormId": "AL092026", "basin": "AL", "stormNumber": 9, "year": 2026, "stormName": "ISAIAS",
  "source": { "provider": "NOAA/NHC Automated Tropical Cyclone Forecasting (ATCF) system",
              "file": "aal092026.dat.gz", "url": "https://ftp.nhc.noaa.gov/atcf/aid_public/aal092026.dat.gz",
              "lastModified": "2026-10-08T12:44:27Z" },
  "generatedAt": "2026-10-08T12:45:02Z",
  "updatedAt": "2026-10-08T12:44:27Z",
  "latestCycle": "2026-10-08T12:00:00Z",
  "asOf": "2026-10-08T12:00:00Z",
  "historical": false,
  "stale": false,
  "staleReason": null,
  "currentPosition": { "time": "2026-10-08T12:00:00Z", "latitude": 23.4, "longitude": -90.6,
                       "maxWindKt": 70, "minPressureMb": 976, "stormType": "HU" },
  "models": [
    { "id": "HFSA", "name": "HAFS-A", "category": "operational", "status": "available",
      "technique": "HFSA", "techniques": ["HFSA"], "description": "…",
      "initTime": "2026-10-08T00:00:00Z", "ageHours": 12, "error": null,
      "points": [
        { "tau": 6, "validTime": "2026-10-08T06:00:00Z", "latitude": 23.0, "longitude": -91.5,
          "maxWindKt": 73, "minPressureMb": 980, "stormType": "XX",
          "windRadiiNm": { "34": { "ne": 81, "se": 68, "sw": 52, "nw": 68 } } }
      ] },
    { "id": "EMX", "name": "ECMWF", "category": "operational", "status": "unavailable",
      "technique": null, "initTime": null, "ageHours": null, "points": [],
      "error": "ECMWF tracks aren't included in NHC's public ATCF guidance files." }
  ],
  "guidance": [
    { "id": "TVCN", "name": "TVCN consensus", "group": "consensus", "initTime": "2026-10-08T12:00:00Z",
      "points": [{ "tau": 0, "latitude": 23.4, "longitude": -90.6, "maxWindKt": 70 }] }
  ],
  "cycles": ["2026-10-08T12:00:00Z", "2026-10-08T06:00:00Z"],
  "stats": { "records": 19780, "malformed": 0, "duplicates": 0, "conflicts": 0 }
}
```

- `models` always lists every registry model, in registry order. One failing
  model never fails the response.
- **Model `status`:**
  - `available`: the run is no older than the model's cycle plus 12 h,
    measured against the newest guidance.
  - `stale`: up to 48 h old. The points are included and flagged.
  - `unavailable`: no run at all, or an older one. `points` is `[]` and
    `error` says why.
- **Response `stale` / `staleReason`:**
  - `upstream-unavailable`: NOAA is failing and this is the last good copy.
  - `no-recent-guidance`: live data whose newest cycle is over 18 h old,
    meaning the storm has dissipated or the feed has stalled.
  - `no-guidance`: the deck has no usable cycles.
- **Times** are ISO 8601 UTC. `updatedAt` is when NHC last changed the file.
  `generatedAt` is when the service read it.
- **Errors:**
  - `400`: invalid id, or an unknown or invalid parameter.
  - `404`: no file for that storm, or no such `cycle`.
  - `429`: rate limited.
  - `502`: NOAA is down and nothing is cached.

### `GET /health`

Cache and request counters. No storm data.

## Caching and update frequency

Models run every 6 or 12 h, but NHC appends each run to the deck as it
arrives, all through the cycle. So the service checks the deck rather than
waiting for a cycle boundary.

- **Per-storm cache (`StormStore`):**
  - Fresh for `HURRICANE_MODELS_CACHE_TTL_SECONDS` (300). After that, the
    next request revalidates with `If-None-Match` / `If-Modified-Since`.
  - An unchanged deck costs one 304: nothing is downloaded or re-parsed.
  - Concurrent requests share one fetch.
  - It fetches on demand only, so a storm nobody views costs nothing.
- **NOAA outages:** the last good deck is served flagged `stale` (and
  `Cache-Control: no-store`) for up to `HURRICANE_MODELS_MAX_STALE_SECONDS`
  (6 h) past its TTL. After that the storm returns 502 rather than keep
  presenting old guidance as current. Errors are never cached.
- **Memory:**
  - Caps: `HURRICANE_MODELS_MAX_STORMS` (32) storms and 2 M parsed lines,
    least recently used evicted first. A live storm is about 20k lines; an
    archived season is about 200k.
  - Ids with no NHC file are remembered for 5 minutes.
- **Shared caches:**
  - Live responses carry `s-maxage` set to whatever is left of the TTL.
  - Pinned cycles and past seasons carry `s-maxage=3600`.
  - Every response has an ETag; browsers send `If-None-Match` and get a 304.
- **Active storms:** cached 120 s (`HURRICANE_ACTIVE_CACHE_TTL_SECONDS`),
  with stale served for up to 1 h.
- **Client:** refetches every 5 minutes while tracks are shown or the model
  list is open.

## Observability

Every log line is one JSON object with `severity`, `message` and
`component: "hurricane-models"`. Logs contain counts, cycles and ids, never
raw NOAA lines.

| message | when |
|---|---|
| `adeck_ingested` | new deck read: bytes, fetch/parse ms, lines, records, malformed, missingPosition, duplicates, conflicts, runs, latestCycle |
| `adeck_not_modified` | revalidation returned 304 |
| `cycle_change` | the deck's newest cycle moved |
| `model_cycle_change` | a model's newest run changed (model, from, to) |
| `model_availability` | after each ingest: available / stale / unavailable ids, points per model |
| `noaa_fetch_failed` | network error or non-2xx from NHC |
| `adeck_parse_failed` | the file had no usable records |
| `adeck_refresh_failed_serving_stale` / `adeck_unavailable` | outage, with or without a stale copy |
| `storm_evicted`, `adeck_not_found`, `rate_limited`, `request` | housekeeping |

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | 8080 | |
| `ALLOWED_ORIGINS` | (any) | comma-separated CORS allowlist |
| `NOAA_USER_AGENT` | `SentinelWildfireTracker/1.0 (+…)` | identifies us to NOAA |
| `HURRICANE_MODELS_CACHE_TTL_SECONDS` | 300 | |
| `HURRICANE_MODELS_MAX_STALE_SECONDS` | 21600 | |
| `HURRICANE_ACTIVE_CACHE_TTL_SECONDS` | 120 | |
| `HURRICANE_MODELS_MAX_STORMS` | 32 | |
| `HURRICANE_MODELS_RATE_LIMIT_PER_MINUTE` | 120 | per client IP |

No secrets: every source is public.

## Adding a model

1. Confirm the ATCF technique id in a live deck. For example:
   ```sh
   curl -s https://ftp.nhc.noaa.gov/atcf/aid_public/aal092026.dat.gz | gunzip | awk -F', *' '{print $5}' | sort | uniq -c
   ```
2. Add an entry to `HURRICANE_MODELS` in
   [`src/app/api/atcf/registry.mjs`](../../src/app/api/atcf/registry.mjs).
   Give it `id`, `name`, `category` (`operational` / `official` / `legacy`),
   `cycleHours`, `techniques` (raw run ids, preferred first), `related`
   (interpolated and derived ids, so they don't also show as other
   guidance), `color` and `description`. Add the id to `MODEL_ORDER`. Add
   `availabilityNote` if NHC doesn't publish it.
3. Copy the file to `cloud/hurricane-models/registry.mjs`. The parity test
   fails until the copies match.
4. Extend the registry test in `Tests/Vitest/atcfParser.test.js`, then
   deploy the service and the frontend.

The picker, map layer and API pick up the new entry with no other change.

## Local run and tests

```sh
cd cloud/hurricane-models && PORT=8099 node index.mjs
curl -s localhost:8099/v1/hurricanes
curl -s localhost:8099/v1/hurricanes/AL092026/models | head -c 600
VITE_HURRICANE_MODELS_URL=http://localhost:8099 npm run dev   # from the repo root
```

These suites need no network access:

- `Tests/Vitest/atcfParser.test.js`: parser and normalizer, against a real
  excerpt of NHC's AL092026 a-deck.
- `Tests/Vitest/hurricaneModelsService.test.js`: cache, revalidation,
  outages, validation and the router; also pins the shared files.
- `Tests/Vitest/nhcModelTracks.test.js`: the client paths and map GeoJSON.

## Deploy and rollback

The service is registered in `infra/aws/lib/services.mjs` (`HurricaneModels`).
Deploy the `sentinel-data-services` stack, then set the
`VITE_HURRICANE_MODELS_URL` GitHub secret (and the Netlify env var for
previews) to `https://<distribution>/hurricane-models`.

**Rollback:** unset `VITE_HURRICANE_MODELS_URL`. The app goes back to reading
the deck in the browser through `/api/nws/nhc-atcf`, with the same normalizer
and the same UI, and no code change.

## Shared files

`atcf.mjs`, `registry.mjs` and `guidance.mjs` are byte-identical copies of
[`src/app/api/atcf/`](../../src/app/api/atcf/), because the build context is
this directory. Edit the `src` copy and copy it here; the parity test in
`hurricaneModelsService.test.js` enforces it.
