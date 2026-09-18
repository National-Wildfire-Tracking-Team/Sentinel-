# California Land Ownership proxy — Google Cloud Run deploy

This directory is a self-contained deploy unit for `index.mjs`, a small
Cloud Run **service** that fronts CAL FIRE FRAP's "California Land
Ownership (public)" dataset (CNRA-hosted ArcGIS FeatureServer) for the
Pro-only Land Ownership map layer (`src/app/api/californiaLandOwnership.js`,
`src/app/hooks/useCaliforniaLandOwnership.js`).

The ArcGIS FeatureServer already supports direct bbox queries with open
CORS, so the client *can* hit it directly — and does, as the fallback (see
step 5). This service exists to cut payload size and request volume: an
unsimplified query for a single close-in viewport (this layer only loads
within ~4 miles of visible radius) still runs ~300KB because ownership
polygon boundaries (park/refuge/reservation edges) are dense, and repeated
pans/zooms within the same few-mile area would otherwise each re-query
ArcGIS from the browser. This service applies geometry simplification
server-side (~300KB → ~25KB, no visible difference at this zoom) and caches
each response against a snapped ("quantized") version of the requested
bbox, so nearby requests reuse one upstream fetch.

No Firestore, no GCS, no auth — an in-memory cache keyed by quantized bbox
(TTL 30 min, capped at 500 entries; the dataset itself only updates roughly
annually per its own metadata) and in-flight coalescing for concurrent
requests against the same cell.

Replace `<PROJECT_ID>` and `<REGION>` throughout.

## 1. Enable required APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

## 2. Build and push the container image

```bash
gcloud artifacts repositories create california-land-ownership-proxy \
  --repository-format=docker \
  --location=<REGION>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/california-land-ownership-proxy/california-land-ownership-proxy:latest \
  cloud/california-land-ownership-proxy
```

(Run this from the repo root so the build context is
`cloud/california-land-ownership-proxy`.)

## 3. Deploy the Cloud Run service

```bash
gcloud run deploy california-land-ownership-proxy \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/california-land-ownership-proxy/california-land-ownership-proxy:latest \
  --region <REGION> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --concurrency 40 \
  --memory 512Mi \
  --timeout 30s
```

`--allow-unauthenticated` is intentional: this serves the same public,
non-sensitive government dataset (CAL FIRE FRAP land ownership) the client
would otherwise fetch directly from CNRA's ArcGIS service — there's nothing
to gate at the transport level. Access to the *layer* itself is gated in the
app by Pro/Team plan (or field-reporter status) — see `usePlan.js`'s
`hasProInfrastructureAccess`.

Note the deployed URL (`gcloud run services describe
california-land-ownership-proxy --region <REGION> --format
'value(status.url)'`) — the client needs it (see step 5).

## 4. Verify

```bash
curl "https://<service-url>/land-ownership?bbox=-118.35,35.40,-118.25,35.50"
```

Expect a GeoJSON `FeatureCollection` of ownership polygons (properties
`Own_Level`, `Own_Agency`, `Own_Group`) intersecting that bbox, simplified
and noticeably smaller than an unsimplified ArcGIS query for the same area.

## 5. Wire up the client

Set `VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL` to the deployed URL in
Netlify's environment variables (and `.env` for local testing) and redeploy
the frontend. Until that env var is set,
`src/app/api/californiaLandOwnership.js` queries the ArcGIS FeatureServer
directly from the browser (still bbox-filtered and simplified, just without
the shared cache) — so this is safe to deploy and verify independently of
the frontend rollout, and the layer works even before this service exists.
