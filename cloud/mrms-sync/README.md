# MRMS composite radar sync — Google Cloud Run deploy

This directory is a self-contained deploy unit for the MRMS composite
reflectivity ingestion job (`sync.mjs`, moved from
`scripts/mrms-radar-sync.mjs`). Like NEXRAD (`cloud/nexrad-sync/`), it runs
as a **Cloud Run Job** triggered every 2 minutes by **Cloud Scheduler** —
replacing `.github/workflows/mrms-radar-sync.yml`, which has been removed.

The one thing that made this workload GitHub-Actions-only before was the
native `wgrib2` binary it needs for GRIB2 decoding — Supabase Edge Functions
(Deno) can't run native binaries at all. Cloud Run has no such restriction:
the Dockerfile here builds `wgrib2` (pinned to the exact same conda-forge
version+build the old workflow used, `3.8.0=h021f410_7`, so decoding
behavior can't silently drift) into the image via a multi-stage build.

Everything downstream is unchanged: Supabase Storage (`mrms-scans` bucket)
and Postgres (`mrms_frame_meta`, `mrms_radar_archive`), same
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` values already used by NEXRAD's
Cloud Run Job (the two secrets in Secret Manager can be reused as-is — no
need to create new ones).

Run all commands below from the repo root, with `gcloud config set project
<PROJECT_ID>` already set (see `cloud/nexrad-sync/README.md` if you haven't
set up `gcloud`/a project yet — this reuses the same project).

## 1. Build and push the image

Reuses the same Artifact Registry repo created for NEXRAD (`nexrad-sync`) —
one Docker repo can hold images for multiple services, so there's no need
for a second one. If you skipped that setup, create a repo first:
`gcloud artifacts repositories create nexrad-sync --repository-format=docker --location=<REGION>`.

```bash
gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-sync/mrms-sync:latest \
  cloud/mrms-sync
```

This build takes noticeably longer than NEXRAD's — installing `wgrib2` from
conda-forge pulls a real package solve/install, not just two small npm
packages.

## 2. Service accounts

Reuses the same **invoker** service account created for NEXRAD
(`nexrad-sync-invoker`) — it just needs an additional `roles/run.invoker`
binding on this new Job (step 4). For the **runtime** identity, reuse
`nexrad-sync-runtime` too, since it already has access to the same two
Supabase secrets this job needs — no new service account required:

```bash
# (skip if nexrad-sync-runtime already exists from the NEXRAD deploy)
gcloud iam service-accounts create nexrad-sync-runtime \
  --display-name "Radar sync Cloud Run Job runtime"

gcloud secrets add-iam-policy-binding nexrad-supabase-url \
  --member "serviceAccount:nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor

gcloud secrets add-iam-policy-binding nexrad-supabase-service-role-key \
  --member "serviceAccount:nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor
```

## 3. Deploy the Cloud Run Job

```bash
gcloud run jobs deploy mrms-radar-sync \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-sync/mrms-sync:latest \
  --region <REGION> \
  --service-account nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-secrets SUPABASE_URL=nexrad-supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=nexrad-supabase-service-role-key:latest \
  --memory 2Gi \
  --tasks 1 \
  --max-retries 0 \
  --task-timeout 600s
```

`--memory 2Gi` (vs. NEXRAD's default): this job decodes a 7000x3500
(~24.5M-cell) grid twice over (native decode + a second Mercator remap
pass), several float32/uint8 arrays of that size alive at once. Bump this if
you see OOM kills in logs; the wgrib2 invocation itself is fast (seconds).

## 4. Grant the invoker service account

```bash
gcloud run jobs add-iam-policy-binding mrms-radar-sync \
  --region <REGION> \
  --member "serviceAccount:nexrad-sync-invoker@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/run.invoker
```

## 5. Cloud Scheduler — trigger every 2 minutes

```bash
gcloud scheduler jobs create http mrms-radar-sync \
  --location <REGION> \
  --schedule "*/2 * * * *" \
  --uri "https://<REGION>-run.googleapis.com/v2/projects/<PROJECT_ID>/locations/<REGION>/jobs/mrms-radar-sync:run" \
  --http-method POST \
  --oauth-service-account-email nexrad-sync-invoker@<PROJECT_ID>.iam.gserviceaccount.com
```

## 6. Verify

```bash
gcloud run jobs execute mrms-radar-sync --region <REGION> --wait

gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="mrms-radar-sync"' \
  --limit 50 --format "value(textPayload)"
```

Look for `[mrms-sync] grid stats: ... real cells (...%)` in the logs — that
confirms `wgrib2` actually ran and decoded real data (not just "no files
listed yet"). Then confirm:
- `mrms_frame_meta` has a fresh `status: ok` row for
  `MergedReflectivityQCComposite`.
- New objects appear under `mrms-scans/MergedReflectivityQCComposite/` in
  Supabase Storage.
- The Composite Radar layer in the app shows fresh data.

Once confirmed, this is fully decommissioned on the GitHub Actions side —
`.github/workflows/mrms-radar-sync.yml` and `scripts/mrms-radar-sync.mjs`
have already been removed from the repo.
