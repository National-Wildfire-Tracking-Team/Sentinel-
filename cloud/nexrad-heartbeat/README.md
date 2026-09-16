# NEXRAD heartbeat/priming — Google Cloud Run deploy

This directory is a self-contained deploy unit for the NEXRAD radar
heartbeat/priming service (`index.mjs`), replacing the Supabase Edge
Function `supabase/functions/nexrad-heartbeat/`. Unlike
`cloud/nexrad-sync/` (a **Cloud Run Job** on a schedule), this is a
**Cloud Run service** — it answers on-demand HTTP requests from the browser
every time someone opens a radar site's detail view.

It shares the same Firestore database (the named database `nexradcomp` —
see `cloud/nexrad-sync/README.md` §2 for why it's not "(default)") and
Cloud Storage bucket as `cloud/nexrad-sync/` — deploy that job's Firestore
rules/indexes and bucket first (see its README) before this service, since
both write to the same `nexradScanMeta` collection and bucket.

Replace `<PROJECT_ID>`, `<REGION>`, and `<BUCKET_NAME>` throughout (same
values used for `cloud/nexrad-sync/`).

## 1. Enable required APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

(`firestore.googleapis.com` / `storage.googleapis.com` should already be
enabled from `cloud/nexrad-sync/`'s setup.)

## 2. Enable Firebase Authentication (Anonymous provider)

This is the one new piece of Google-managed infrastructure this service
needs that `cloud/nexrad-sync` doesn't: a way to verify the browser is a
real (if anonymous) client, so an expensive on-demand NOAA decode can't be
trivially spammed. In the Firebase console (console.firebase.google.com,
same GCP project) → **Authentication → Sign-in method → Anonymous → Enable**.
No further config needed — the client SDK handles the actual sign-in (see
the root repo's `src/shared/api/firebaseClient.js`).

## 3. Build and push the container image

```bash
gcloud artifacts repositories create nexrad-heartbeat \
  --repository-format=docker \
  --location=<REGION>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-heartbeat/nexrad-heartbeat:latest \
  cloud/nexrad-heartbeat
```

(Run this from the repo root so the build context is `cloud/nexrad-heartbeat`.)

## 4. Service account

Needs Firestore read/write and GCS object read/write — the same roles as
`cloud/nexrad-sync`'s runtime account, so it's simplest to reuse that same
service account rather than create a second one:

```bash
# If you haven't already granted these to nexrad-sync-runtime, do so now —
# see cloud/nexrad-sync/README.md step 5. Otherwise nothing further needed
# here; this service will reuse that same account.
```

`firebase-admin`'s `verifyIdToken` also needs no extra IAM role — it
verifies tokens against Google's public signing keys directly, not via a
Google Cloud API call.

## 5. Deploy the Cloud Run service

```bash
gcloud run deploy nexrad-heartbeat \
  --image <REGION>-docker.pkg.dev/<PROJECT_ID>/nexrad-heartbeat/nexrad-heartbeat:latest \
  --region <REGION> \
  --service-account nexrad-sync-runtime@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-env-vars NEXRAD_SCANS_BUCKET=<BUCKET_NAME> \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 20 \
  --timeout 30s
```

`--allow-unauthenticated` is intentional and safe: this service is called
directly from the browser with a Firebase ID token in the `Authorization`
header, which Cloud Run's own IAM-based invoker check doesn't understand
(that mechanism is for Google-signed service-to-service tokens, not
app-level Firebase tokens) — the real auth/abuse gate is
`verifyAndRateLimit()` inside `index.mjs` itself, the direct equivalent of
the old Edge Function's Supabase-JWT + Postgres-RPC guard.

Note the deployed URL (`gcloud run services describe nexrad-heartbeat
--region <REGION> --format 'value(status.url)'`) — the client needs it (see
the root repo's `.env.example` for the `VITE_NEXRAD_HEARTBEAT_URL` var).

## 6. Firestore TTL policy for rate-limit cleanup

The old Postgres rate limiter deleted stale rows inline on every call (see
`consume_edge_rate_limit` in `supabase/migrations/20260911000000_enforce_limits_and_rate_limits.sql`).
Firestore has a native TTL feature for exactly this — set it once per
project instead of writing manual cleanup code:

```bash
gcloud firestore fields ttls update expires_at \
  --collection-group=edgeRateLimits \
  --database=nexradcomp \
  --enable-ttl
```

## 7. Verify

```bash
curl -i -X OPTIONS https://<service-url>   # should return 204 with CORS headers

# From the browser console on the deployed app (after signing in
# anonymously via the Firebase client SDK):
#   const token = await auth.currentUser.getIdToken();
#   fetch('<service-url>', {
#     method: 'POST',
#     headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
#     body: JSON.stringify({ site_id: 'KTLX' }),
#   }).then(r => r.json()).then(console.log);
```

Then confirm in the Firestore console: `nexradActiveSites/KTLX` has a fresh
`last_seen_at`, and (if the site had no recent scan) `nexradScanMeta`
gained/updated docs for that site with a very recent `updated_at`.

Once confirmed, decommission the old Supabase Edge Function
(`supabase/functions/nexrad-heartbeat/`) — it can be deleted from the repo
and undeployed from Supabase once the client is confirmed calling this
service instead (see the root repo's migration plan for rollout ordering).
