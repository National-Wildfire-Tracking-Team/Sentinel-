# Fire perimeters merge — Google Cloud Run deploy

This directory is a self-contained deploy unit for `index.mjs`, a Cloud Run
**service** that fetches NIFC WFIGS perimeters, NIFC FIRIS (CA) perimeters,
IRWIN incident locations, and CAL FIRE incidents, then runs the same
multi-pass name/ID/geometry matching pipeline as
`src/app/hooks/useMergedFireData.js` — once, server-side, on a shared
3-minute cache — instead of every browser tab re-fetching all four sources
and re-running the merge independently every 5 minutes.

**This is the most safety-relevant data layer in the app** (it drives the
active-fire perimeter view people may use for evacuation awareness), so the
client-side rollout is opt-in: `src/app/hooks/useMergedFireData.js` only
calls this service when `VITE_FIRE_MERGE_SERVICE_URL` is set, and falls
back to its original independent-fetch-and-merge behavior otherwise. Treat
this as a "deploy and verify the service on its own first" rollout, not a
same-PR swap — see step 4 below.

Replace `<PROJECT_ID>` and `<REGION>` throughout.

## 1. Enable required APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

## 2. Build and push the container image

```bash
gcloud artifacts repositories create fire-perimeters-merge \
  --repository-format=docker \
  --location=<REGION>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/fire-perimeters-merge/fire-perimeters-merge:latest \
  cloud/fire-perimeters-merge
```

(Run this from the repo root so the build context is `cloud/fire-perimeters-merge`.)

## 3. Deploy the Cloud Run service

```bash
gcloud run deploy fire-perimeters-merge \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/fire-perimeters-merge/fire-perimeters-merge:latest \
  --region <REGION> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 40 \
  --memory 1Gi \
  --timeout 30s
```

`1Gi` is needed: at `512Mi` the first request after a cold start OOMs
("JavaScript heap out of memory") while holding all four raw source
payloads plus the merge, and Cloud Run returns 503.

`--allow-unauthenticated` is intentional: same public, non-sensitive
government incident data the client would otherwise fetch directly.

Note the deployed URL (`gcloud run services describe fire-perimeters-merge
--region <REGION> --format 'value(status.url)'`).

## 4. Verify independently before wiring up the client

```bash
curl "https://<service-url>/merged?minAcres=100&includeInactive=false" | head -c 2000
```

Expect `{ "perimeters": { "type": "FeatureCollection", ... }, "dots": { ... } }`.
Compare feature counts against the live app (which is still doing its own
client-side merge until step 5) for a few real active fires — same
`IncidentName`/`GISAcres`/`PercentContained` values, no fires present on one
side and missing on the other. This service re-implements
`mergeFireData`/`tagHistoricalMappings`/`mergePerimeterSources` verbatim
(see `index.mjs`'s module doc comment), but it's still a second
implementation of a safety-relevant matching pipeline, so this
side-by-side check is worth doing carefully, not skipping.

## 5. Wire up the client

Set `VITE_FIRE_MERGE_SERVICE_URL` to the deployed URL in Netlify's
environment variables (and `.env` for local testing) and redeploy the
frontend. Watch for any change in perimeter/dot counts or matching after
rollout — if anything looks off, unset the env var to fall back to the
original per-client fetch+merge immediately, no code change needed.
