# fire-danger

Backend for the live map's **Fire Danger & Fuels** layers (Wildfire and All Hazards tabs). A scheduled builder Lambda runs every 3 hours and publishes static files. Browsers read those files from Sentinel's CDN; they never call FEMS. Each run:
- pulls NFDRS station values from the USDA Forest Service **FEMS** (Fire Environment Mapping System);
- records the valid dates of the **USGS Wildland Fire Potential Index (WFPI)** forecast layers.

```
FEMS (fems.fs2c.usda.gov, public, no key)
   │  every 3 h: station list (GraphQL) + ~42 batched CSV requests (50 stations each)
   ▼
fire-danger builder  (Python 3.13 stdlib, Lambda arm64, us-east-1)   fems.py → builder.py → store.py
   │  runs/<run>/stations.json, runs/<run>/stations/<id>.json, manifest.json (written last)
   ▼
s3://sentinel-fire-danger-<account>/fire-danger/v1/…  (private; run directories expire after 3 days)
   │  OAC
   ▼
CloudFront /fire-danger/*  (the SentinelDataServices distribution)
   ▼
Sentinel web app: Fire Danger & Fuels → ERC / Burning Index / Spread Component / Dead / Live Fuel Moisture
```

Browser side:
- `src/app/api/fireDanger/stations.js`
- `src/app/context/FireDangerContext.jsx`
- `src/app/components/Map/layers/FireDangerStationsLayer.jsx`
- `src/app/components/Map/FireDangerPanel.jsx`
- `src/app/components/FireDetailPanel/FireDangerPointDetail.jsx`

The other Fire Danger & Fuels sources go through the `/api/arcgis` edge proxy (`netlify/edge-functions/arcgis-proxy.js`) and need no backend:

| Source | Route | Kind |
|---|---|---|
| NWCG 7-day Significant Fire Potential | `nwcg-sfp` | Official outlook, by area |
| USGS WFPI forecast tiles and point values | `usgs-wfpi-<day>-tiles`, `usgs-wfpi-<day>` | USGS model, ~1 km grid, CONUS |
| Live fuel moisture field samples (NWCC mirror of FEMS, labelled "testing") | `nwcc-fuel-moisture` | Measured; WA, OR, ID, MT, WY, SD, ND |
| LANDFIRE FBFM40 fuel models | `lf-*` | Static yearly map |

Both lfps.usgs.gov and dmsdata.cr.usgs.gov return a CORS-less 500 to some browser user agents, so they go through the proxy, which sends a fixed User-Agent and caches at the CDN.

**Alerts:** `supabase/functions/_shared/fireDangerAlerts.js` runs inside `notification-sync`:
- NWCG fire potential at or above a level the user picks, within a horizon of 1–7 days;
- 100-hour fuel moisture below the user's own threshold at the nearest current station. This check reads this service's output via the `FIRE_DANGER_URL` function secret.

## What is published

| Field | FEMS column | What it is |
|---|---|---|
| `erc`, `bi`, `sc`, `ic` | ERC, BI, SC, IC | NFDRS 2016 indices, fuel model **Y**, at the station |
| `fm1` … `fm1000` | 1HrFM … 1000HrFM | Dead fuel moisture (%) computed by NFDRS |
| `herbFM`, `woodyFM` | HerbFM, WoodyFM | Live fuel moisture **modelled** by NFDRS. It is not measured. |
| `kbdi`, `gsi` | KBDI, GSI | Keetch-Byram Drought Index, Growing Season Index |
| `qa` | NFDRQAFlag | FEMS's QA flag, passed through |
| `ercChange7d`, `fm100Change7d` | derived | Latest observed day minus the day 7 days earlier; null if either is missing |
| `forecast*` | NFDRType F | FEMS's 7-day forecast |

The rules for each value:
- Each value is FEMS's output for that station and day. Nothing is interpolated between stations.
- A blank FEMS cell stays `null`.
- A station with no observed day is published without values. The map draws it as a hollow ring.

Request 14 observed days plus the forecast week (`dataset=all`). The trend charts plot only those returned days.

## Schedule and failure handling

- **Every 3 hours** (EventBridge). FEMS's newest observed day has always been yesterday (UTC). Its forecast changes during the day.
- **Unchanged data:** the run writes only the manifest's retrieval time.
- **One batch fails:** it is retried once after 3 s. FEMS returns an occasional 502.
- **Fewer than 80% of batches succeed, or the station list fails:**
  - the previous run stays published;
  - the manifest marks FEMS as `error`, with `lastSuccessAt`;
  - the UI says so and shows the old run's dates.
- **Some batches fail (but at least 80% succeed):** published as `partial`. The missing stations show as having no current data.
- **Stale:**
  - `stale: true` when the newest observed day is more than 3 days old;
  - the client also greys out any single station that is 2 or more days behind the newest.
- **Alarms (SNS):**
  - the builder errors on two runs in a row;
  - FEMS fails on three runs in a row;
  - the newest observed day is more than 2 days old.

## Run locally

```
uv run --python 3.13 python local.py ./dev-fire-danger --serve 8766
VITE_FIRE_DANGER_URL=http://localhost:8766/fire-danger npm run dev
```

The first command makes about 42 real FEMS requests (~60 s). Tests run offline against recorded responses:

```
uv run --python 3.13 --with-requirements requirements-dev.txt pytest
```

## Deploy (not deployed yet)

1. Set the repo variable `AWS_FIRE_DANGER=enabled` and run the AWS deploy workflow. SentinelFireDanger deploys before the distribution.
2. Put the `FireDangerBaseUrl` output (`https://<distribution>/fire-danger`) in the `VITE_FIRE_DANGER_URL` secret.
3. Redeploy the site.

Until then, the station rows say "not set up for this build yet". The other layers work without it.

## Known limits and blockers

- **No gridded ERC, BI or fuel moisture.**
  - USFS WFAS publishes GeoTIFF grids at `wfas.net/data/ndfd/` and `/data/Current/`. As of 2026-10-20 they carry no current documentation:
    - the fuel model is unknown (a 2009 prototype paper says G; the map legends say "ERC(y)");
    - the percentile climatology and class breaks are undocumented, and the sources conflict (6 classes vs 5);
    - zero is used for no data;
    - no terms of use are published.
  - They are not integrated until RMRS/Missoula Fire Lab confirms their meaning.
  - The USGS WFPI forecast (WMS) is connected instead, labelled as a USGS model.
- **Measured live fuel moisture is regional only.**
  - The NWCC mirror (WA, OR, ID, MT, WY, SD, ND) is connected. Its owner labels it "Testing". Draft records are excluded, and values over 400% are flagged.
  - FEMS's national sample API returns no rows without a login.
  - The California mirrors stopped at 2026-06-24.
- **No official adjective fire danger ratings.** Local units set those per Fire Danger Rating Area with local fuel models and breakpoints. The map's colour ramps are display scales.
- **FEMS terms and limits:** FEMS publishes no rate limit or terms of use. The builder sends ~42 requests every 3 hours with a descriptive User-Agent. Confirm acceptable bulk use with the FEMS team.
- **Fuel model:** fuel model Y is used everywhere so values compare. A station's local fuel model may differ.
