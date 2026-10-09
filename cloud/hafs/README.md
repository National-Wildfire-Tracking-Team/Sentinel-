# hafs

Gridded HAFS hurricane-model output for Sentinel, as map frames. It reads
NOAA's public HAFS files, picks one field from one forecast hour with HTTP
range requests, and returns it as an 8-bit Web Mercator PNG for Mapbox to
colour. It is the gridded companion to `cloud/hurricane-models`, which serves
the track ("spaghetti") guidance; storms share ATCF ids (`09l` → `AL092026`).

```
s3://noaa-nws-hafs-pds (AWS Open Data, us-east-1)   NOMADS (fallback for data reads)
        │  listings · .idx inventories · byte ranges of single GRIB2 messages
        ▼
  hafs  ── idx.py → grib2.py (decode) → fields.py (units, calculations) → render.py (Mercator) → png.py
        │  /v1/catalog · /v1/runs/… · /v1/frames/….png
        ▼
  CloudFront (/hafs/*, immutable frames)  →  Sentinel map
```

Frames are rendered on demand, not pre-built. One storm-run is ~48 GB of
GRIB2 and ~1,300 possible frames, most of which nobody opens. A frame reads
~0.5–2 MB in-region and takes about 0.4–1 s cold (2–4 s for the parent
domain). CloudFront then serves it as immutable, because a NOAA file never
changes once it and its `.idx` are written.

## Data

Checked against the live bucket on 2026-10-08:

```
s3://noaa-nws-hafs-pds/{hfsa|hfsb}/{YYYYMMDD}/{HH}/{storm}.{YYYYMMDDHH}.{hfsa|hfsb}.{storm|parent}.atm.f{hhh}.grb2  (+ .idx)
https://nomads.ncep.noaa.gov/pub/data/nccf/com/hafs/prod/{hfsa|hfsb}.{YYYYMMDD}/{HH}/…  (same names)
```

- **Models** (`models.py`): HAFS-A and HAFS-B, every 6 h, 126 h. HWRF and
  HMON are listed as `legacy` with no source. They were retired in 2023, and
  nothing stands in for them.
- **Domains:** `storm`, the 0.02° storm-following nest (it moves every hour,
  and about half its points are masked), and `parent`, the fixed 0.06° outer
  domain.
- **Fields** (`fields.py`): 19 fields, each marked `native` (a HAFS message
  as-is) or `calculated` (wind speed from u/v, apparent temperature, wind
  chill). A field is offered at an hour only if that hour's `.idx` has every
  message it needs. Nothing is substituted, so there's no precipitation at +0 h.
- Runs, storms, domains and hours all come from the listing. A file counts
  only when its `.idx` exists too.

## API

All `GET`. Query strings are refused, so the path is the whole cache key.

| Path | Returns | Cache-Control |
|---|---|---|
| `/v1/catalog` | models → runs (last 3 days) → storms (ATCF id, name, status, hours per domain), and every field's encoding and palette | 60 s |
| `/v1/runs/{model}/{cycle}/{storm}` | per domain: hours, each hour's frame corners and valid time, which hours have each field, per-hour problems | 60 s; 1 day once the run settles (no new file for 6 h) |
| `/v1/frames/{model}/{cycle}/{storm}/{domain}/{field}/{hour}.png` | 8-bit greyscale PNG: byte 0 = no data, 1–255 = the field's `[lo, hi]`, linear or `sqrt` | 1 year, `immutable` |
| `/health` | counters; never reads NOAA | `no-store` |

Example: `/v1/frames/hfsa/2026100806/09l/storm/mslp/24.png`.

Frame responses also carry `X-Hafs-Bounds` (west,south,east,north) and
`X-Hafs-Valid-Time`. The corners are the same ones `/v1/runs` lists, and a
client draws the PNG as a Mapbox image source between them. Grids across
the antimeridian keep a continuous longitude range, so `east` can pass 180.

Run `status`: `complete` (every 3-hourly file to +126 h), `in-progress` (a
file landed in the last 90 min) or `incomplete`.

Errors are JSON, `{"error": {"code", "message"}}`, with `no-store`:

- `400` `bad_request`: bad cycle, storm or query string.
- `404`: `unknown_model`, `model_retired`, `unknown_domain`, `unknown_field`,
  `run_not_found`, `hour_unavailable`, `field_unavailable`, or `not_found`.
- `429` `rate_limited`: per client IP, on run and frame requests (CloudFront
  misses only).
- `502` `upstream_unavailable`: NOAA unreadable. Details are logged, not
  returned.
- `500` `internal_error`.

## Security

- Every path segment is matched by pattern in `lambda_handler.py`, then
  checked against the registries in `service.py`.
- URLs are built only in `source.py`, from validated parts, on two fixed
  hosts.
- NOAA is read with unsigned HTTPS: no credentials, no boto3.
- `tests/test_security.py` checks all of the above.

## Observability

One JSON line per event (`metrics.py`, the `cloud/mrms` shape). Lines that
carry metrics are also CloudWatch EMF in `Sentinel/HAFS`:

- `request`: `hafs_request_ms`, `hafs_server_errors`, `hafs_upstream_errors`.
- `frame`: `hafs_frame_ms`, `hafs_png_bytes`.
- Service events: `hafs_catalog`, `hafs_run_detail`, `hafs_frame` (source
  bytes, decode ms), `hafs_upstream_failed`.

## Configuration

| Variable | Default | |
|---|---|---|
| `ALLOWED_ORIGINS` | (any) | comma-separated CORS allowlist |
| `HAFS_RATE_LIMIT_PER_MINUTE` | 600 | per client IP; one user scrubbing hours and fields makes many |
| `HAFS_WORKERS` | 16 | parallel NOAA reads per request |

## Local run and tests

```sh
cd cloud/hafs
uv run --python 3.13 --with-requirements requirements.txt python local.py 8098
curl -s localhost:8098/hafs/v1/catalog | head -c 600

uv run --python 3.13 --with-requirements requirements-dev.txt python -m pytest
```

The tests run offline. `tests/conftest.py` writes HAFS-shaped GRIB2 (template
3.0 scanned south to north, 5.3 complex packing with spatial differencing or
5.0 simple packing, with bitmaps) and an in-memory bucket.

## Frontend

HAFS is a model on the live map's **Models** tab (`model=hafs`), offered only
when the build has `VITE_HAFS_URL` (`https://<distribution>/hafs`). Its layer
pop-up row picks the storm, configuration, run and domain:
`src/app/api/hafs.js`, `src/app/hooks/useHafs.js`,
`src/app/utils/hafsSelection.js` and `src/app/components/WeatherModels/HafsControls.jsx`.
Frames are drawn with the Models tab's `raster-color` paint, each between
its own hour's corners. Links carry the storm: `/?tab=models&model=hafs&storm=AL092026`.

Local: `python local.py 8098`, then
`VITE_HAFS_URL=http://localhost:8098/hafs npm run dev` and open the app host
(`app.localhost`).

## Deploy

`infra/aws/lib/hafs-stack.mjs` (`SentinelHafs`, opt-in with
`sentinel:hafs=enabled`): `lambda_handler.handler` on Python 3.13 arm64,
1769 MB, 30 s, behind an IAM-only `BUFFERED` Function URL, served by the
shared distribution at `/hafs/*` with Origin Shield. The runbook is in
[infra/aws/README.md](../../infra/aws/README.md#hafs-hurricane-model). After it's
deployed, set the `VITE_HAFS_URL` secret (already read by `deploy.yml`) to
the `HafsBaseUrl` output. Until then the Models tab doesn't offer HAFS.
