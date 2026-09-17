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
because `cloud/nexrad-heartbeat/` was already set up first, or Firebase
auto-provisioned one when the project was created — they share one
database).

This pipeline uses a **named** database, `nexrad-composite` — not Firestore's
"(default)" database. Every Firestore client in this pipeline
(`sync.mjs`, `cloud/nexrad-heartbeat/index.mjs`, the browser's
`src/shared/api/firebaseClient.js`) passes this exact database ID
explicitly, so whatever you create/already have must be named this too
(check with `gcloud firestore databases list --project <PROJECT_ID>` —
look at the `name` field, e.g. `projects/<PROJECT_ID>/databases/nexrad-composite`,
and confirm `type: FIRESTORE_NATIVE`, not `DATASTORE_MODE`):

```bash
gcloud firestore databases create --database=nexrad-composite --location=<REGION> \
  --type=firestore-native --edition=standard
```

**Be explicit about `--edition=standard`.** A database created as `--edition=enterprise` without also passing `--enable-firestore-data-access` disables the Firestore Native API entirely (`firestoreDataAccessMode: DATA_ACCESS_MODE_DISABLED`) in favor of MongoDB-compatible-only access — and that setting is baked in at creation time, permanently (confirmed live: `sync.mjs` failed with `FAILED_PRECONDITION: Access to this database via the Firestore in Native mode API is disabled` and there was no way to fix it short of creating an entirely new database). `gcloud firestore databases create` defaults to `--edition=standard` if you omit the flag, which is fine — pass it explicitly anyway so this can't happen by accident via the Firebase console's own "Create database" flow, which does let you pick Enterprise.

Deploy the security rules and composite indexes (see `firestore.rules` /
`firestore.indexes.json` / `firebase.json` at the repo root — shared config,
since both this job and `cloud/nexrad-heartbeat` write to the same
database; `firebase.json` already targets the `nexrad-composite` database
specifically) with the Firebase CLI:

```bash
npm install -g firebase-tools   # if not already installed
firebase login
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
```

**Deliberately not public**, unlike the old Supabase Storage bucket. Most GCP
organizations run an `iam.allowedPolicyMemberDomains` org policy that blocks
granting any role to `allUsers`/`allAuthenticatedUsers` outright (confirmed
live: `add-iam-policy-binding --member=allUsers` failed with `HTTPError 412:
One or more users named in the policy do not belong to a permitted
customer`) — and even where it's allowed, a public bucket is a bigger
exposure than this needs. Instead, `cloud/nexrad-heartbeat`'s `GET
/scan/<path>` route proxies reads using its own service account's
credentials (see that service's module doc comment and README) — the
browser never talks to this bucket directly, so it never needs to be
public. `nexrad-sync-runtime`'s `roles/storage.objectAdmin` grant (step 5
below) is what lets both this job and the heartbeat service read/write it.

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
  --set-env-vars NEXRAD_SCANS_BUCKET=<BUCKET_NAME>,NODE_OPTIONS=--max-old-space-size=3072 \
  --memory 4Gi \
  --cpu 2 \
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
Scheduler tick).

**`--memory 4Gi --cpu 2` and `NODE_OPTIONS=--max-old-space-size=3072` are
required, not optional headroom** — confirmed live: the Cloud Run default
(512Mi) OOM'd immediately (`FATAL ERROR: Reached heap limit... JavaScript
heap out of memory`) decoding real volumes at `CONCURRENCY=6` (already
lowered once from an initial 16 for the same reason), and even bumping to
`--memory 2Gi` alone still OOM'd at ~1GB — Node doesn't automatically size
its heap to match the container's memory limit, so `NODE_OPTIONS` has to
say so explicitly. `--task-timeout 600s` (10 minutes) is real headroom
above the actual observed run time (~9-10 minutes syncing every known
site at `CONCURRENCY=6`), not a generous guess — raise `--task-timeout` /
`CONCURRENCY` further only after watching real run times, and lower
`CONCURRENCY` again (not just raise memory) if OOM recurs — this workload
is memory-per-concurrent-decode bound, not just memory-bound.

## 7. Cloud Scheduler

```bash
gcloud scheduler jobs create http nexrad-radar-sync \
  --location <REGION> \
  --schedule "*/10 * * * *" \
  --uri "https://<REGION>-run.googleapis.com/v2/projects/<PROJECT_ID>/locations/<REGION>/jobs/nexrad-radar-sync:run" \
  --http-method POST \
  --oauth-service-account-email nexrad-sync-invoker@<PROJECT_ID>.iam.gserviceaccount.com
```

**Every 10 minutes, not every 2** — Cloud Run Jobs don't skip a scheduled
trigger just because the previous run is still going (unlike the old
GitHub Actions `concurrency: group` setup, which serialized runs
automatically). Confirmed live: leaving this at the originally-planned
`*/2 * * * *` while a real run takes ~9-10 minutes piled up 4 overlapping
executions before anyone noticed. 10 minutes gives real (if thin) margin
over the observed run time — tighten it only after `--task-timeout`/
`CONCURRENCY` are tuned down further, and prefer raising this interval
over shrinking it if you're ever unsure.

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
