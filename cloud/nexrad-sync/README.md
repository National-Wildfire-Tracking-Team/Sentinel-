# NEXRAD radar sync — Google Cloud Run deploy

This directory is a self-contained deploy unit for the NEXRAD Level II
ingestion job (`sync.mjs`, moved from `scripts/nexrad-radar-sync.mjs`). It
runs as a **Cloud Run Job**, triggered every 2 minutes by **Cloud Scheduler**
— replacing `.github/workflows/nexrad-radar-sync.yml`, which has been
removed.

Everything downstream is unchanged: the job still talks to Supabase Storage
(`nexrad-scans` bucket) and Postgres (`nexrad_scan_meta`,
`nexrad_scan_history`, `nexrad_active_sites`) exactly as before, using the
same `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` values that were previously
GitHub Actions repo secrets.

All commands below use the `gcloud` CLI. Run `gcloud auth login` and
`gcloud config set project <PROJECT_ID>` first. Replace `<PROJECT_ID>` and
`<REGION>` (e.g. `us-central1`) throughout.

## 1. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

## 2. Store the Supabase credentials in Secret Manager

Use the same values that were previously set as GitHub Actions secrets
(`Settings → Secrets and variables → Actions` in the repo).

```bash
printf '%s' 'https://<your-project-ref>.supabase.co' | \
  gcloud secrets create nexrad-supabase-url --data-file=-

printf '%s' '<your-service-role-key>' | \
  gcloud secrets create nexrad-supabase-service-role-key --data-file=-
```

## 3. Build and push the container image

```bash
gcloud artifacts repositories create nexrad-sync \
  --repository-format=docker \
  --location=<REGION>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-sync/nexrad-sync:latest \
  cloud/nexrad-sync
```

(Run this from the repo root so the build context is `cloud/nexrad-sync`.)

## 4. Service accounts

**Runtime service account** for the Job — only needs to read the two
secrets, nothing else (the job only makes outbound HTTPS calls to public
endpoints and Supabase):

```bash
gcloud iam service-accounts create nexrad-sync-runtime \
  --display-name "NEXRAD sync Cloud Run Job runtime"

gcloud secrets add-iam-policy-binding nexrad-supabase-url \
  --member "serviceAccount:nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor

gcloud secrets add-iam-policy-binding nexrad-supabase-service-role-key \
  --member "serviceAccount:nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor
```

**Invoker service account** for Cloud Scheduler — only needs permission to
start executions of this one Job:

```bash
gcloud iam service-accounts create nexrad-sync-invoker \
  --display-name "NEXRAD sync Cloud Scheduler invoker"
```

(The `roles/run.invoker` binding on the Job itself is granted in step 5,
once the Job exists.)

## 5. Deploy the Cloud Run Job

```bash
gcloud run jobs deploy nexrad-radar-sync \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-sync/nexrad-sync:latest \
  --region <REGION> \
  --service-account nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-secrets SUPABASE_URL=nexrad-supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=nexrad-supabase-service-role-key:latest \
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
2-minute Scheduler tick, same as a failed GitHub Actions run would have).
`--task-timeout 600s` (10 minutes) gives comfortable headroom under the
previous 15-minute GitHub Actions `timeout-minutes`, since a normal run
finishes in well under a minute per active site — but the job now syncs
every known NEXRAD site each run (reflectivity, for Composite Radar), not
just actively-viewed ones, so run duration is meaningfully longer than it
used to be. Watch actual run times after deploying and raise
`--task-timeout` / `CONCURRENCY` in `sync.mjs` if runs are getting close to
600s.

If you need more memory than the Cloud Run Job default, add e.g.
`--memory 1Gi` — full-volume NEXRAD decode is the reason this moved off
Edge Functions, so give this some room if you see OOM kills in logs.

## 6. Cloud Scheduler — trigger every 2 minutes

```bash
gcloud scheduler jobs create http nexrad-radar-sync \
  --location <REGION> \
  --schedule "*/2 * * * *" \
  --uri "https://<REGION>-run.googleapis.com/v2/projects/<PROJECT_ID>/locations/<REGION>/jobs/nexrad-radar-sync:run" \
  --http-method POST \
  --oauth-service-account-email nexrad-sync-invoker@<PROJECT_ID>.iam.gserviceaccount.com
```

## 7. Verify

Run it once manually and watch the logs:

```bash
gcloud run jobs execute nexrad-radar-sync --region <REGION>

gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="nexrad-radar-sync"' \
  --limit 50 --format "value(textPayload)"
```

Then confirm data is actually landing:
- `nexrad_scan_meta` / `nexrad_scan_history` rows are updating in Supabase
  Postgres.
- New objects appear under `nexrad-scans/<site>/<product>/latest.bin` in
  Supabase Storage.
- A radar site opened in the app shows fresh data within a couple of
  minutes.

Once the Scheduler job is confirmed running reliably, decommission is
already done on the code side (`.github/workflows/nexrad-radar-sync.yml` and
`scripts/nexrad-radar-sync.mjs` have been removed from the repo) — nothing
further to disable on GitHub's side.
