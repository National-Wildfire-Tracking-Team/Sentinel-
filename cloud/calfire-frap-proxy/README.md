# CAL FIRE FRAP proxy — Google Cloud Run deploy

This directory is a self-contained deploy unit for `index.mjs`, a small
Cloud Run **service** that fronts the CAL FIRE FRAP historical fire
perimeter dataset published on data.ca.gov (CKAN). It exists only for the
third-tier fallback path in `src/app/api/calFirePerimeters.js` — the
primary egis.fire.ca.gov and ArcGIS Online sources already filter by
`YEAR_`/`GIS_ACRES` server-side via ArcGIS `where` clauses, but the CKAN
mirror is a single static GeoJSON file (every recorded CA fire back to the
1800s) with no query parameters, so the browser was downloading the whole
thing and filtering client-side. This service does that fetch + filter
once, server-side, so the browser only receives the rows it asked for.

No Firestore, no GCS, no auth — just an in-memory cache of the raw CKAN
payload (refreshed at most every 12h, matching the client's own cache TTL)
and a per-request year/acreage filter.

Replace `<PROJECT_ID>` and `<REGION>` throughout.

## 1. Enable required APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

## 2. Build and push the container image

```bash
gcloud artifacts repositories create calfire-frap-proxy \
  --repository-format=docker \
  --location=<REGION>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/calfire-frap-proxy/calfire-frap-proxy:latest \
  cloud/calfire-frap-proxy
```

(Run this from the repo root so the build context is `cloud/calfire-frap-proxy`.)

## 3. Deploy the Cloud Run service

```bash
gcloud run deploy calfire-frap-proxy \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/calfire-frap-proxy/calfire-frap-proxy:latest \
  --region <REGION> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --concurrency 40 \
  --memory 2Gi \
  --timeout 120s
```

`2Gi` / `120s` are needed: the whole statewide CKAN GeoJSON is parsed in
memory (it OOMs at 512Mi — ~640MiB used), and a cold start's first request
downloads it before answering (~17s).

`--allow-unauthenticated` is intentional: this serves the same public,
non-sensitive government dataset the client would otherwise fetch directly
from data.ca.gov — there's nothing to gate.

Note the deployed URL (`gcloud run services describe calfire-frap-proxy
--region <REGION> --format 'value(status.url)'`) — the client needs it (see
the root repo's `.env.example` for `VITE_CALFIRE_FRAP_PROXY_URL`).

## 4. Verify

```bash
curl "https://<service-url>/perimeters?minYear=2015&minAcres=1000"
```

Expect a GeoJSON `FeatureCollection` containing only fires from 2015 onward
at or above 1000 acres — a small fraction of the full dataset's size.

## 5. Wire up the client

Set `VITE_CALFIRE_FRAP_PROXY_URL` to the deployed URL in Netlify's
environment variables (and `.env` for local testing) and redeploy the
frontend. Until that env var is set, `src/app/api/calFirePerimeters.js`
keeps its original behavior (direct CKAN fetch + client-side filter) as a
fallback — so this is safe to deploy and verify independently of the
frontend rollout.
