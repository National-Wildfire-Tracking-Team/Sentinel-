# NEXRAD radar sync — Google Cloud Run deploy

This directory is a self-contained deploy unit for the NEXRAD Level II
ingestion job (`sync.mjs`, moved from `scripts/nexrad-radar-sync.mjs`). It
runs as a **Cloud Run Job**, triggered every 2 minutes by **Cloud Scheduler**
— replacing `.github/workflows/nexrad-radar-sync.yml`, which has been
removed.

Data now lives entirely on Google Cloud, not Supabase: metadata
(`nexradScanMeta`, `nexradScanHistory`, `nexradActiveSites`) is in
**Firestore**, binary scan payloads are in **Google Cloud Storage**. This is
part of the project's move off Supabase — see `cloud/nexrad-heartbeat/`
(the on-demand priming service, replacing the old
`supabase/functions/nexrad-heartbeat` Edge Function) for the other half of
this pipeline, which shares the same Firestore/GCS backend.

All commands below use the `gcloud` CLI. Run `gcloud auth login` and
`gcloud config set project <PROJECT_ID>` first. Replace `<PROJECT_ID>`,
`<REGION>` (e.g. `us-central1`), and `<BUCKET_NAME>` throughout — GCS bucket
names are globally unique across all of GCS, so `<BUCKET_NAME>` will need to
be something like `<PROJECT_ID>-nexrad-scans`, not the literal
`nexrad-scans` Supabase used.

## 1. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com
```

## 2. Create the Firestore database (once per project)

Skip this if a Firestore database already exists for the project (e.g.
because `cloud/nexrad-heartbeat/` was already set up first — they share one
database).

```bash
gcloud firestore databases create --location=<REGION>
```

Deploy the security rules and composite indexes (see `firestore.rules` /
`firestore.indexes.json` / `firebase.json` at the repo root — shared config,
since both this job and `cloud/nexrad-heartbeat` write to the same
database) with the Firebase CLI:

```bash
npm install -g firebase-tools   # if not already installed
firebase deploy --only firestore:rules,firestore:indexes --project <PROJECT_ID>
```

`nexradScanMeta`/`nexradScanHistory` are public-read (matching the old RLS
policies); `nexradActiveSites` has no client access at all (matching the old
table's zero RLS policies — heartbeat writes only ever come from
`cloud/nexrad-heartbeat`'s Admin SDK, never the browser).

## 3. Create the Cloud Storage bucket

```bash
gcloud storage buckets create gs://<BUCKET_NAME> \
  --location=<REGION> \
  --uniform-bucket-level-access

# Public read, matching the old Supabase Storage bucket's `public: true`.
gcloud storage buckets add-iam-policy-binding gs://<BUCKET_NAME> \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

## 4. Build and push the container image

```bash
gcloud artifacts repositories create nexrad-sync \
  --repository-format=docker \
  --location=<REGION>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-sync/nexrad-sync:latest \
  cloud/nexrad-sync
```

(Run this from the repo root so the build context is `cloud/nexrad-sync`.)

## 5. Service accounts

**Runtime service account** for the Job — needs Firestore read/write and GCS
object read/write (no Secret Manager access needed anymore, now that
Supabase credentials are gone):

```bash
gcloud iam service-accounts create nexrad-sync-runtime \
  --display-name "NEXRAD sync Cloud Run Job runtime"

gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member "serviceAccount:nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/datastore.user

gcloud storage buckets add-iam-policy-binding gs://<BUCKET_NAME> \
  --member "serviceAccount:nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/storage.objectAdmin
```

No key file, no `GOOGLE_APPLICATION_CREDENTIALS` — `sync.mjs` constructs
`new Firestore()` / `new Storage()` with no explicit credentials, so it
picks up this service account's Application Default Credentials
automatically from the Cloud Run runtime.

**Invoker service account** for Cloud Scheduler — only needs permission to
start executions of this one Job:

```bash
gcloud iam service-accounts create nexrad-sync-invoker \
  --display-name "NEXRAD sync Cloud Scheduler invoker"
```

(The `roles/run.invoker` binding on the Job itself is granted in step 6,
once the Job exists.)

## 6. Deploy the Cloud Run Job

```bash
gcloud run jobs deploy nexrad-radar-sync \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-sync/nexrad-sync:latest \
  --region <REGION> \
  --service-account nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-env-vars NEXRAD_SCANS_BUCKET=<BUCKET_NAME> \
  --tasks 1 \
  --max-retries 0 \
  --task-timeout 600s

gcloud run jobs add-iam-policy-binding nexrad-radar-sync \
  --region <REGION> \
  --member "serviceAccount:nexrad-sync-invoker@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/run.invoker
```

`--tasks 1 --max-retries 0` matches the original job: one run per
invocation, no automatic retry (a failed run just waits for the next
2-minute Scheduler tick). `--task-timeout 600s` (10 minutes) gives
comfortable headroom, since a normal run finishes in well under a minute per
active site — but the job syncs every known NEXRAD site each run
(reflectivity, for Composite Radar), not just actively-viewed ones, so run
duration is meaningfully longer than a per-site-only sync would be. Watch
actual run times after deploying and raise `--task-timeout` / `CONCURRENCY`
in `sync.mjs` if runs are getting close to 600s.

If you need more memory than the Cloud Run Job default, add e.g.
`--memory 1Gi` — full-volume NEXRAD decode is the reason this moved off
Edge Functions, so give this some room if you see OOM kills in logs.

## 7. Cloud Scheduler — trigger every 2 minutes

```bash
gcloud scheduler jobs create http nexrad-radar-sync \
  --location <REGION> \
  --schedule "*/2 * * * *" \
  --uri "https://<REGION>-run.googleapis.com/v2/projects/<PROJECT_ID>/locations/<REGION>/jobs/nexrad-radar-sync:run" \
  --http-method POST \
  --oauth-service-account-email nexrad-sync-invoker@<PROJECT_ID>.iam.gserviceaccount.com
```

## 8. Verify

Run it once manually and watch the logs:

```bash
gcloud run jobs execute nexrad-radar-sync --region <REGION>

gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="nexrad-radar-sync"' \
  --limit 50 --format "value(textPayload)"
```

Then confirm data is actually landing:
- `nexradScanMeta` / `nexradScanHistory` documents are updating in the
  Firestore console.
- New objects appear under `<site>/<product>/latest.bin` in the
  `<BUCKET_NAME>` bucket.
- A radar site opened in the app shows fresh data within a couple of
  minutes (once the client has also been switched over — see the root
  repo's migration plan for rollout ordering: deploy this job and
  `cloud/nexrad-heartbeat` *before* shipping the client change that starts
  reading from Firestore/GCS, so there's no window where the client reads
  empty collections).

Once the Scheduler job is confirmed running reliably, decommission is
already done on the code side (`.github/workflows/nexrad-radar-sync.yml` and
`scripts/nexrad-radar-sync.mjs` have been removed from the repo) — nothing
further to disable on GitHub's side. The old Supabase tables
(`nexrad_scan_meta`, `nexrad_scan_history`, `nexrad_active_sites`) and the
`nexrad-scans` storage bucket can be dropped once this is confirmed live —
see the migration plan's follow-up step.
