# lightning

Live lightning for the live map's **Weather** and **All Hazards** tabs: the
last 15 minutes of flashes detected by the Geostationary Lightning Mapper
(GLM) on GOES-East and GOES-West. A builder Lambda reads NOAA's GLM files
every minute and keeps one small gzipped file on Sentinel's CDN. Browsers
fetch only that file. They never touch NOAA's buckets, and they need no AWS
credentials.

```
s3://noaa-goes19, s3://noaa-goes18  (NOAA Open Data, us-east-1, public)
        │  every minute: list the window's GLM-L2-LCFA files; download each new one once
        ▼
lightning builder  (Python 3.13, Lambda arm64, us-east-1)   source.py → glm.py → builder.py
        │  latest.json: last 15 min of flashes, gzipped, max-age 30
        ▼
s3://sentinel-lightning-<account>/lightning/v1/latest.json  (private, 1-day expiry)
        │  OAC
        ▼
CloudFront /lightning/*  (the SentinelDataServices distribution)
        ▼
Sentinel web app: Weather → Radar & satellite → Lightning; All Hazards → Monitoring & imagery → Lightning
```

The browser side lives in:
- `src/app/api/lightning.js`
- `src/app/hooks/useLightning.js`
- `src/app/components/Map/layers/LightningLayer.jsx`
- the `lightning` rows in `LayerControl.jsx` and a section in `Legend.jsx`

## Why GLM

GLM is free, public NOAA data from the same Open Data program as MRMS, with
no licensing limits. Ground networks (Vaisala NLDN, Earth Networks) are
commercial, and Blitzortung is for non-commercial use only. GLM sees in-cloud
and cloud-to-ground lightning across the Americas, locates flashes to about
8 km, and doesn't detect every flash. It doesn't tell cloud-to-ground from
in-cloud.

## Data

Checked against the live buckets on 2026-10-18:

```
s3://noaa-goes19/GLM-L2-LCFA/{YYYY}/{DDD}/{HH}/OR_GLM-L2-LCFA_G19_s{YYYYDDDHHMMSSs}_e…_c….nc   GOES-East
s3://noaa-goes18/GLM-L2-LCFA/{YYYY}/{DDD}/{HH}/OR_GLM-L2-LCFA_G18_s…                          GOES-West
```

- One NetCDF-4 (HDF5) file per satellite per 20 seconds, ~0.2–0.5 MB.
- Only **flashes** are used (not events or groups): `flash_lat`, `flash_lon`,
  `flash_time_offset_of_first_event`, `flash_energy`, and only
  `flash_quality_flag == 0`. Packed variables are int16 read as unsigned, then
  `scale_factor`/`add_offset` (glm.py).
- **Area:** 10–80°N, west of 50°W, plus 170–180°E for the western Aleutians:
  the U.S., Canada, Mexico, Central America and the Caribbean.
- **Overlap:** both satellites see the western U.S. Each flash is kept only
  from the satellite whose sub-satellite longitude is nearest (GOES-East
  75.2°W, GOES-West 137.2°W), so it's drawn once.

## latest.json (schemaVersion 1)

`GET /lightning/v1/latest.json`: `Content-Encoding: gzip`,
`Cache-Control: public, max-age=30, must-revalidate`.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-18T19:00:00Z",
  "windowSeconds": 900,
  "base": 1792349100,
  "sources": { "goes19": { "label": "GOES-East (GOES-19)", "latest": "2026-10-18T18:59:40Z", "files": 45 }, "goes18": { … } },
  "count": 1597,
  "flashes": { "lon": [-9750, …], "lat": [3525, …], "t": [10, …], "e": [20, …] },
  "read": { "goes19": ["GLM-L2-LCFA/…", …], "goes18": […] },
  "attribution": "…", "notice": "…", "source": { … }
}
```

- `flashes` are column arrays, oldest first: `lon`/`lat` in hundredths of a
  degree, `t` seconds after `base` (epoch seconds) of the flash's first light,
  `e` energy in femtojoules.
- `sources[sat].latest` is the end of that satellite's newest file read;
  `error` is set when its listing failed this run.
- `read` is the builder's own state (files already read, still in the window).

Measured on 2026-10-18 (a quiet October afternoon): ~1,600 flashes in 15
minutes, 12 KB gzipped. A busy summer afternoon can be 10–20× that, which is
still a few hundred KB.

## Freshness

| | |
|---|---|
| Builder cadence | 1 minute (EventBridge) |
| GLM latency | a file is listed ~20–40 s after its 20 s ends |
| CDN | max-age 30 |
| Browser | refetches every 60 s; dot colours tick every 10 s |
| Worst case | a flash shows up ~2.5 minutes after it happened |

The window is anchored to the clock, so if GLM stops publishing, flashes age
off the map rather than old lightning passing for current. Errors are never
cached: a failed run writes nothing new, and the previous file stays.

## Run it

```bash
cd cloud/lightning
uv run --python 3.13 --with-requirements requirements-dev.txt pytest       # offline tests
uv run --python 3.13 --with-requirements requirements.txt python local.py dev-lightning --loop --serve 8765
# then: VITE_LIGHTNING_URL=http://localhost:8765/lightning npm run dev
```

## Build and deploy

`infra/aws/lib/lightning-stack.mjs` (`SentinelLightning`, us-east-1). Opt-in:

```bash
cd infra/aws
npx cdk diff   SentinelLightning SentinelDataServices -c sentinel:lightning=enabled -c sentinel:alarmEmail=<ops mailbox>
npx cdk deploy SentinelLightning SentinelDataServices -c sentinel:lightning=enabled -c sentinel:alarmEmail=<ops mailbox>
```

In CI it's the `AWS_LIGHTNING` repo variable (`enabled`). The
`LightningBaseUrl` output is the value for the `VITE_LIGHTNING_URL` secret
(`.github/workflows/deploy.yml`). Without it, the toggle still shows, saying
the service isn't set up for this build, and nothing is fetched.

Alarms (SNS, `sentinel:alarmEmail`): builder errors, a run near its 50 s
timeout, GLM files failing to list or decode, and the newest file older than
10 minutes.
