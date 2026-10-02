# mrms

Sentinel's NOAA **MRMS** (Multi-Radar/Multi-Sensor System) radar layer for the live map's **Weather** tab. A builder Lambda turns MRMS files into small map frames every 2 minutes. Browsers fetch only those frames, from Sentinel's CDN. They never touch NOAA's bucket, and they need no AWS credentials.

```
s3://noaa-mrms-pds  (NOAA Open Data, us-east-1, public)
        │  every 2 min: list only keys newer than what's published; download each new file once
        ▼
MRMS builder  (Python 3.13, Lambda arm64, us-east-1)   source.py → grib2.py → grids.py → products.py/png.py
        │  8-bit Web Mercator PNG frames (lo + hi), manifest.json written last
        ▼
s3://sentinel-mrms-frames-<account>/mrms/v1/…  (private, 1-day expiry)
        │  OAC
        ▼
CloudFront /mrms/*  (the SentinelDataServices distribution)
        ▼
Sentinel web app: Weather tab → Radar & satellite → MRMS Radar
```

The browser side lives in these files:
- `src/app/api/mrms.js`
- `src/app/context/MrmsContext.jsx`
- `src/app/components/Map/layers/MrmsLayer.jsx`
- `src/app/components/LayerControl/MrmsControls.jsx`
- `src/app/components/MapControls/MrmsStatus.jsx`
- a section in `Legend.jsx`

Frames are drawn the same way as the Models tab's fields: a Mapbox image source coloured by `raster-color` (see `cloud/weather-models/README.md`, "Map fields").

## Products

The bucket has ~250 CONUS products. The builder renders six, chosen because each:
- is operationally useful;
- updates every 2 minutes;
- reads well as a single colour-ramped raster.

| id | MRMS product (`CONUS/<dir>/`) | Shows | Units (encoded → shown) | Range | Clear below |
|---|---|---|---|---|---|
| `reflectivity` | `MergedReflectivityQCComposite_00.50` | Column-max radar echo, QC'd, all NEXRAD + Canadian radars | dBZ | −10…75, linear | 5 dBZ |
| `precipRate` | `PrecipRate_00.00` | Surface precipitation rate | mm/h → in/h | 0…150, sqrt | 0.1 mm/h |
| `qpe1h` | `RadarOnly_QPE_01H_00.00` | Radar rainfall over the past 60 min (rolling, every 2 min) | mm → in | 0…150, sqrt | 0.25 mm |
| `hail` | `MESH_00.50` | Maximum Estimated Size of Hail | mm → in | 0…100, linear | 6.35 mm (¼ in) |
| `rotation` | `RotationTrack60min_00.50` | 0–2 km azimuthal shear, 60-min max: rotating-storm tracks | 10⁻³ s⁻¹ → s⁻¹ | 0…50, linear | 0.006 s⁻¹ |
| `echoTops` | `EchoTop_18_00.50` | Height of the 18 dBZ echo top, i.e. convective depth | km → kft | 0…20, linear | 1.5 km |

Left out on purpose:
- **Surface wind.** MRMS has no wind field. Rotation (azimuthal shear) is the closest product, and it is included.
- **Multi-sensor (gauge-corrected) QPE.** It is published hourly with roughly an hour of latency, so it isn't near real time. It would be a good addition for flood work.
- **Categorical products** such as `PrecipFlag` (precipitation type). Max-pooling and colour ramps don't suit them.
- **NLDN lightning density.** It is derived from a commercial lightning network; check its terms before adding it.
- **Alaska, Hawaii, Caribbean and Guam domains.** They live in separate prefixes on other grids. A product would need a domain field to support them.

Adding a product means one `Product(...)` entry in `products.py`. The palette is in the product's own units. The frontend picks it up from the manifest; only an unseen `quantity` also needs a unit in `src/app/api/mrms.js`.

## How a file becomes a frame

MRMS GRIB2 files have the same shape, which `grib2.py` checks and decodes without eccodes:
- one message per gzipped file;
- grid template 3.0, a regular lat/lon grid, north row first: 0.01° and 7000 × 3500 (rotation tracks: 0.005°, 14000 × 7000), over 130–60°W, 20–55°N;
- data template 5.41, where section 7 is a PNG of the packed integers, decoded with Pillow;
- no bitmap.

The physical value is `(R + X·2^E) / 10^D`. Anything else, such as a template, scan mode or grid change, raises an error instead of decoding wrongly.

**Missing values.** These are the MRMS conventions:
- **No radar coverage** is −999 (reflectivity) or −3. It becomes byte 0, drawn transparent.
- **No echo** is −99, −1 or 0. It clips to the bottom of the range, which every palette draws clear.
- Rotation tracks have no coverage value, so they don't show the coverage outline.

**Downsampling: block maximum, not averaging.** A frame is coarser than the 1 km source:
- `lo` is 2048 px wide (~3.4 km), used for animation and zoomed-out views.
- `hi` is 4096 px wide (~1.7 km), used when paused at zoom ≥ 5.

What matters is often a small peak: a hail core, a rotation track, a 60 dBZ cell. `grids.max_pool` keeps the block maximum, so peaks survive. It runs on the raw integers, which is valid because the scaling is monotonic. Because the "no coverage" values are the lowest, a partly covered block takes its covered value.

**Encoding.** This is the Models-tab encoding:
- 8-bit greyscale PNG;
- byte 0 = no data;
- bytes 1–255 map `[lo, hi]`, linearly or on a square-root scale;
- the browser maps bytes to colour, so palettes change without new frames.

Frames are for display only. A frame is never presented as a point measurement.

## Manifest (`mrms/v1/manifest.json`)

```json
{
  "schemaVersion": 1, "kind": "mrms-manifest", "generatedAt": "2026-10-02T01:11:14Z",
  "notice": "Radar-derived observations, quality-controlled automatically. …",
  "attribution": "MRMS: NOAA National Severe Storms Laboratory and NWS NCEP, via the NOAA Open Data Dissemination program on AWS. Processed by Sentinel; not endorsed by NOAA.",
  "source": { "name": "NOAA Multi-Radar/Multi-Sensor System (MRMS)", "uri": "s3://noaa-mrms-pds/CONUS/", "region": "us-east-1", "registry": "https://registry.opendata.aws/noaa-mrms-pds/" },
  "windowMinutes": 60, "cadenceSeconds": 120, "staleAfterSeconds": 900,
  "image": { "coordinates": [[-130, 55], [-60, 55], [-60, 20], [-130, 20]], "levels": { "lo": [2048, 1337], "hi": [4096, 2674] } },
  "keys": { "frame": "{product}/{encodingId}/{res}/{frameId}.png", "frameIdFormat": "YYYYMMDD-HHMMSS, UTC observation time" },
  "products": {
    "reflectivity": {
      "label": "Composite reflectivity", "quantity": "reflectivity", "units": "dBZ", "description": "…",
      "source": { "product": "MergedReflectivityQCComposite_00.50", "uri": "s3://noaa-mrms-pds/CONUS/MergedReflectivityQCComposite_00.50/" },
      "encoding": { "transform": "linear", "lo": -10, "hi": 75, "nodata": 0, "min": 1, "max": 255 },
      "palette": [[-10, "#000000", 0], [5, "#04e9e7", 0.55], "…"],
      "encodingId": "ec818e421", "status": "ok", "error": null, "latest": "2026-10-02T01:08:40Z",
      "frames": [{ "id": "20261002-001041", "time": "2026-10-02T00:10:41Z" }, "…"]
    }
  }
}
```

**Product status:**
- `ok`: the newest frame is within 15 minutes.
- `stale`: there are frames, but the newest is older than that. The UI says "MRMS is delayed".
- `unavailable`: no frames in the window.

`error` is `null`, or one of these codes, and the product keeps any frames still inside the window:
- `source_unavailable`: listing failed;
- `frame_failed`: a file failed to download or decode.

`encodingId` is a hash of the encoding and image grid. Changing either writes new keys, so an immutable, CDN-cached frame is never read with the wrong scale.

## Freshness, caching and cleanup

- **Window.** The manifest lists the last 60 minutes of frames per product (~30), for the animation. The window follows the clock, not the newest file. If MRMS stops publishing, frames age out (`stale`, then `unavailable`), so old radar never passes for current.
- **Downloads.** Each run lists only keys newer than the window start (`start-after`) and skips frames already published. Each MRMS file is downloaded once, by one function, whatever the number of viewers.
- **Catch-up.** A run builds at most 4 new frames per product, newest first (on Lambda each frame takes ~1.85 s, so a catch-up run is ~45 s against the 100 s timeout). A cold start shows the current picture at once and backfills the hour over the next few runs.
- **CDN.**
  - Frames are `immutable` (1 year).
  - The manifest is `max-age=30`, and the browser re-reads it every 60 s while the layer is on.
  - In practice a new MRMS file reaches the map within about 2–4 minutes. MRMS itself lags real time by ~4 minutes.
- **Cleanup.** The bucket's lifecycle rule deletes frames after 1 day. The builder never deletes.
- **Browser.** Nothing is fetched until the layer is switched on, on the Weather tab. While playing, the next 4 frames are prefetched.

## Security

- **The NOAA bucket is read anonymously.** `source.py` uses unsigned HTTPS GETs, with no SDK and no credentials. The builder role has **no permissions on `noaa-mrms-pds`**.
- **The role writes only what it must.** It can write its own logs and read/write `mrms/*` in its own bucket.
- **The frames bucket is private.** CloudFront reads it through OAC. The bucket policy names this account's distributions, or only the one set in `sentinel:distributionId`.
- **No secrets.** None exist in code, config or the frontend. `tests/test_security.py` scans the feature's files for keys, and checks that the source is unsigned and that only `store.py` touches the SDK.

## Observability

Each run logs one JSON line, which is also CloudWatch EMF (namespace `Sentinel/MRMS`, dimension `Service=mrms`).

| Metric | Meaning |
|---|---|
| `mrms_build_seconds` | run duration |
| `mrms_frames_written` / `mrms_bytes_written` | output |
| `mrms_source_bytes` | MRMS bytes downloaded |
| `mrms_product_errors` | products with a listing or decode error this run |
| `mrms_latest_age_seconds` | age of the stalest product's newest frame |
| `mrms_build_errors` | whole-run failures |

These alarms go to `alarmEmail`:
- builder errors;
- runs near the 100 s timeout;
- sustained product errors;
- the newest frame older than 20 minutes.

## Cost (estimate, us-east-1 list prices, from a local run; not yet measured on Lambda)

Measured locally against the live bucket:
- a steady-state run (6 new frames, one per product, lo + hi) took 4.8 s with 3 workers;
- peak memory was 1.1 GB;
- a catch-up run of 48 frames took 19 s;
- `lo` frames are 15–230 KB and `hi` frames 35–740 KB, with reflectivity the largest.

| Driver | Volume | List / month |
|---|---|---|
| Lambda (2 GB arm64) | 720 runs/day × ~8 s ≈ 350,000 GB-s | ~$4.60, mostly inside the 400,000 GB-s free tier (shared with the weather-models builder) |
| S3 PUTs | 13 per run (12 frames + manifest) ≈ 280,000 | ~$1.40 |
| S3 storage | ~2–3 GB (1-day expiry) | ~$0.07 |
| CloudFront transfer | ~6 MB per animated hour of reflectivity; 1,000 sessions ≈ 6 GB | ~$0.50 (free tier: 1 TB) |
| NOAA bucket reads | ~5 MB per run, same region, Open Data | $0 |
| EventBridge, CloudWatch | 21,600 events, 4 alarms | ~$0 |

**Expected total:** about $2–7 a month, depending on how much of the Lambda free tier is left.

**If it needs to be cheaper:**
- drop `hi` frames for low-detail products (−40 % of PUTs);
- lower `lo_width`;
- trim the product list.

## Develop and test

```bash
cd cloud/mrms
# Unit tests: offline, synthetic GRIB2 files built the same way MRMS writes them
uv run --python 3.13 --with-requirements requirements-dev.txt pytest

# Real data: build from the live bucket every 2 min and serve the frames with CORS (stands in for CloudFront)
uv run --python 3.13 --with-requirements requirements.txt python local.py /tmp/mrms-frames --loop --serve 8092
# repo root:
VITE_MRMS_URL=http://localhost:8092/mrms npm run dev     # Weather tab → Layers → MRMS Radar
```

## Build and deploy

The stack is defined in `infra/aws/lib/mrms-stack.mjs` (`SentinelMrms`, us-east-1). The `/mrms/*` route is in `data-services-stack.mjs`. Both are **opt-in** via `-c sentinel:mrms=enabled`. The steps are in [infra/aws/README.md](../../infra/aws/README.md#mrms-radar).

**Rollback.** Unset `VITE_MRMS_URL`. The MRMS row disappears from the layer panel, and nothing else in the app changes.

## Attribution

NOAA data is public domain. The UI credits NOAA NSSL and NWS NCEP, and the NOAA Open Data Dissemination program, wherever the layer is on: under the status chip and in the legend. It says "processed by Sentinel; not endorsed by NOAA", so nothing implies NOAA affiliation or endorsement. The NOAA logo is not used.
