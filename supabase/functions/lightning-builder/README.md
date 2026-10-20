# lightning-builder

Live lightning for the live map's **Weather** and **All Hazards** tabs: the
last 15 minutes of flashes detected by the Geostationary Lightning Mapper
(GLM) on GOES-East and GOES-West. This Edge Function reads NOAA's GLM files
every minute and keeps one small gzipped file in public Supabase Storage.
Browsers fetch only that file from the Storage CDN. They never touch NOAA's
buckets. It replaced the AWS `SentinelLightning` stack (Lambda + S3 +
CloudFront); the output format is unchanged.

```
s3://noaa-goes19, s3://noaa-goes18  (NOAA Open Data, us-east-1, public)
        │  every minute: list the window's GLM-L2-LCFA files; download each new one once
        ▼
lightning-builder  (Supabase Edge Function, pg_cron every minute)   source.mjs → glm.mjs → builder.mjs
        │  v1/latest.json.gz: last 15 min of flashes, gzipped, max-age 30
        ▼
Storage bucket "lightning" (public; written only by the service role)
        │  Supabase Storage CDN
        ▼
Sentinel web app: Weather → Radar & satellite → Lightning; All Hazards → Monitoring & imagery → Lightning
```

The browser side lives in:
- `src/app/api/lightning.js` (reads `<VITE_SUPABASE_URL>/storage/v1/object/public/lightning/v1/latest.json.gz` and gunzips it)
- `src/app/hooks/useLightning.js`
- `src/app/components/Map/layers/LightningLayer.jsx`
- the `lightning` rows in `LayerControl.jsx` and a section in `Legend.jsx`

## Why GLM

GLM is free, public NOAA data with no licensing limits. Ground networks
(Vaisala NLDN, Earth Networks) are commercial, and Blitzortung is for
non-commercial use only. GLM sees in-cloud and cloud-to-ground lightning
across the Americas, locates flashes to about 8 km, and doesn't detect every
flash. It doesn't tell cloud-to-ground from in-cloud.

## Data

```
s3://noaa-goes19/GLM-L2-LCFA/{YYYY}/{DDD}/{HH}/OR_GLM-L2-LCFA_G19_s{YYYYDDDHHMMSSs}_e…_c….nc   GOES-East
s3://noaa-goes18/GLM-L2-LCFA/{YYYY}/{DDD}/{HH}/OR_GLM-L2-LCFA_G18_s…                          GOES-West
```

- One NetCDF-4 (HDF5) file per satellite per 20 seconds, ~0.2–0.5 MB, read
  with [h5wasm](https://github.com/usnistgov/h5wasm) (the HDF5 C library in
  WebAssembly, ~2 ms a file).
- Only **flashes** are used (not events or groups): `flash_lat`, `flash_lon`,
  `flash_time_offset_of_first_event`, `flash_energy`, and only
  `flash_quality_flag == 0`. Packed variables are int16 read as unsigned, then
  `scale_factor`/`add_offset` (glm.mjs).
- **Area:** 10–80°N, west of 50°W, plus 170–180°E for the western Aleutians.
- **Overlap:** each flash is kept only from the satellite whose sub-satellite
  longitude is nearest (GOES-East 75.2°W, GOES-West 137.2°W), so it's drawn once.

## latest.json.gz (schemaVersion 1)

`GET <SUPABASE_URL>/storage/v1/object/public/lightning/v1/latest.json.gz`:
`Content-Type: application/gzip`, `Cache-Control: max-age=30`. Storage can't
set `Content-Encoding`, so the file is stored gzipped and the browser
gunzips it (`DecompressionStream`).

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

A quiet afternoon is ~1,600 flashes in 15 minutes, ~12 KB gzipped; a busy
summer afternoon can be 10–20× that.

## Freshness

| | |
|---|---|
| Builder cadence | 1 minute (pg_cron) |
| GLM latency | a file is listed ~20–40 s after its 20 s ends |
| CDN | max-age 30 |
| Browser | refetches every 60 s; dot colours tick every 10 s |
| Worst case | a flash shows up ~2.5 minutes after it happened |

The window is anchored to the clock, so if GLM stops publishing, flashes age
off the map rather than old lightning passing for current. A failed run
writes nothing, and the previous file stays.

## Running it

- **Schedule:** the `lightning-builder` pg_cron job
  (migration `20261020124634_lightning_on_supabase.sql`) POSTs here every
  minute with the service-role key from Vault (`project_url`,
  `service_role_key`, as the other scheduled functions use).
- **Who can call it:** JWT verification stays on, and the function also
  requires the token's role to be `service_role`. Anyone else gets a 403.
- **Overlap:** each run claims `lightning-builder` in `public.sync_job_locks`
  (`try_claim_sync_job`, stale after 120 s), so a slow run is never doubled.
- **Secrets:** none of its own. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  are injected; NOAA is read anonymously.
- **Optional env:** `LIGHTNING_WINDOW_SECONDS` (900), `LIGHTNING_MAX_FILES`
  (30 per satellite per run; a cold start reads the newest first),
  `LIGHTNING_WORKERS` (8 concurrent downloads).

Deploy, then apply the migration:

    npx supabase functions deploy lightning-builder
    npx supabase db push        # or run the migration in the SQL editor

## Monitoring

Each run logs one JSON line (`message: "lightning_run"`) with
`lightning_files_read`, `lightning_flashes`, `lightning_source_errors`,
`lightning_latest_age_seconds` and so on; failures log `lightning_failed`.
Health at a glance:

```sql
select last_success_at, last_error, last_error_at from public.sync_job_locks where job_name = 'lightning-builder';
select status, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'lightning-builder') order by start_time desc limit 5;
```

The AWS version also e-mailed CloudWatch alarms; there is no equivalent here yet.

## Tests

`npx vitest run Tests/Vitest/lightning` runs offline: synthetic GLM files
(`Tests/Vitest/fixtures/glm/makeGlm.js`), a fake NOAA listing, and an
in-memory store.
