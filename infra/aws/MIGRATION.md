# Sentinel: Google Cloud → AWS migration record

Status as of 2026-09-30. The AWS infrastructure is written and tested offline
and is ready to deploy. **Nothing has been deployed to AWS, and nothing on
GCP has been changed or deleted.** The live GCP inventory below was read with
`gcloud` against project `sentinel-508719`. It isn't copied from READMEs,
which in several places no longer match what's deployed.

**Scope change during the work:** radar is being rebuilt from the ground up,
so the existing NEXRAD system is **not** migrated. Its code has instead been
**deleted from the repo**:
- `cloud/nexrad-sync`, `cloud/nexrad-heartbeat`
- the Firebase client and the `firebase` npm package
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`
- every radar layer, hook, panel, legend entry and test in `src/`, plus the dBZ probe
- the `VITE_FIREBASE_*`/`VITE_NEXRAD_HEARTBEAT_URL` build variables

The untracked rebuild (`cloud/radar/`, `src/app/radar/`) is untouched. The
**live** GCP radar resources still exist and are listed in sections 9–10;
the current production site keeps using them until the next Netlify deploy
from this branch.

---

## 1. GCP inventory (live)

### Cloud Run services (all in us-east1, public `--allow-unauthenticated`, ingress `all`, min instances 0)

| Service | CPU / RAM | Timeout | Concurrency | Max inst. | Env | Runtime SA |
|---|---|---|---|---|---|---|
| calfire-frap-proxy | 1 / 2Gi | 120s | 40 | 5 | – | default compute |
| california-land-ownership-proxy | 1 / 512Mi | 30s | 40 | 5 | – | default compute |
| fema-nfhl-proxy | 1 / 1Gi | 60s | 40 | 5 | **none** (the README says `ALLOWED_ORIGINS`) | default compute |
| fire-perimeters-merge | 1 / 1Gi | 30s | 40 | 10 | – | default compute |
| nws-alerts | 1 / 512Mi | 60s | 80 | 3 | `ALLOWED_ORIGINS`, `NWS_USER_AGENT` | default compute |
| nexrad-heartbeat *(radar)* | 1 / 512Mi | 30s | 20 | 10 | `NEXRAD_SCANS_BUCKET` | nexrad-sync-runtime |

### Cloud Run job

`nexrad-radar-sync` *(radar)* is 4 CPU / 8Gi with a 900s task timeout and 0 retries. **Every recent execution failed on the timeout.** Each run takes ~15.5 min, while one starts every 10 min.

### Cloud Scheduler

`nexrad-radar-sync` *(radar)* runs in us-east1 on `*/10 * * * *` (UTC). It is an OIDC POST to the Run Jobs API as `nexrad-sync-invoker`, with a 180s attempt deadline and no retry duration. It is the **only** scheduler job; the non-radar services have none.

### Cloud Storage

| Bucket | Contents | Notes |
|---|---|---|
| `stinkydoodoofart-nexrad-scans` *(radar)* | **67 GB** of scan payloads | No lifecycle rule; the job's prune step never runs because the job times out first. 7-day soft delete. Private (UBLA). |
| `project-idnexrad-scans` | empty | Leftover from a placeholder-name mistake. |
| `sentinel-508719_cloudbuild` | 2 MB of build sources | `gcloud builds submit` staging. |

### Firestore

| Database | Mode | Collections (docs) | Used by |
|---|---|---|---|
| `nexrad-composite` *(radar)* | Native, nam5 | `nexradScanMeta` (207), `nexradScanHistory` (**272,837**, back to 2026-09-22), `nexradActiveSites` (2), `edgeRateLimits` (3) | nexrad-sync, nexrad-heartbeat, browser (public-read rules) |
| `nexradcomp` | Enterprise edition, Native API access disabled | – | **nothing** (no code references it) |

The TTL policy on `edgeRateLimits.expires_at` described in the README was never applied; `ttls list` shows 0.

### Firebase

| Component | Status |
|---|---|
| Web app "Sentinel" | Active. The browser's `firebase` SDK was used **only** by radar (`src/shared/api/firebaseClient.js`, `src/app/api/nexradScans.js`, both now deleted). |
| Anonymous Auth | Enabled. Used only to mint a token for the nexrad-heartbeat POST. |
| Hosting | Default site `sentinel-508719.web.app` exists, **no releases** (404). Unused; the app is on Netlify. |
| Analytics / Remote Config / Storage / FCM | Not used. The GA4/GTM in `index.html` is plain Google Analytics, not Firebase. |
| **User authentication** | **Not Firebase.** Real accounts are Supabase Auth, and this migration doesn't touch them. |

### Other GCP resources

- **Artifact Registry:** one Docker repo per service (8 repos, including a duplicated `nexrad-sync`).
- **Secret Manager:** `nexrad-supabase-url` and `nexrad-supabase-service-role-key`, leftovers that no current code reads.
- **Service accounts:**
  - default compute
  - `nexrad-sync-runtime` (`datastore.user`, `storage.objectAdmin` on the scans bucket)
  - `nexrad-sync-invoker` (`run.invoker`)
  - `firebase-adminsdk-fbsvc`
- **API key:** "Browser key (auto created by Firebase)" has **no referrer restriction**.
- **Enabled APIs:** ~90, including a large Google Maps Platform set. No Sentinel code uses Google Maps (maps are Mapbox).

### Frontend and CI touchpoints

- **Build variables:** the frontend reaches every service through a `VITE_*_URL` build variable, baked in by `.github/workflows/deploy.yml` from repo secrets.
- **No CI step talks to GCP.** Every GCP service was deployed by hand.
- **Not GCP infrastructure:** Google Fonts, AdSense, GTM/GA4 and Google Forms links are Google services the frontend uses, but they are out of scope.

---

## 2. Service-by-service analysis and mapping

For all five migrated services the answers match: no Firestore, no GCS, no
Firebase, no scheduler, no secrets, one public HTTP endpoint, called directly
by the browser and by no backend, and scale-to-zero. Each client uses the
service only when its `VITE_*_URL` is set.

| Service | What it does | Frontend consumer | If it goes offline | AWS |
|---|---|---|---|---|
| calfire-frap-proxy | Fetches data.ca.gov's statewide FRAP GeoJSON and filters by year/acres. Caches the raw file in memory for 12h. | `calFirePerimeters.js`, as the 3rd fallback after two ArcGIS sources | That fallback tier fails and the chain moves on to mock data | Lambda (2048 MB, 120s) |
| california-land-ownership-proxy | Bbox-snapped, simplified query against CNRA ArcGIS. 30 min cache per 0.05° cell. | `californiaLandOwnership.js` (Pro layer) | The layer shows an error; there's no runtime fallback | Lambda (1769 MB, 30s) |
| fema-nfhl-proxy | Tile-cached FEMA NFHL flood zones, panels and availability. 24h tiles, 7-day stale fallback, rate limit 120/min. | `femaFloodHazards.js` | The flood layer is unavailable (no fallback by design) | Lambda (1769 MB, 60s) |
| fire-perimeters-merge | Fetches NIFC WFIGS, FIRIS, IRWIN and CAL FIRE and merges them. 3 min raw cache, gzipped ~16 MB response. | `useMergedFireData.js`, polled every 5 min | The layer keeps its last data and shows an error; client-side merge only runs when the URL is unset | Lambda (3008 MB, 60s) |
| nws-alerts | One normalized snapshot of api.weather.gov plus WWA MapServer. 45s TTL, ETag/304, max 5 min stale. | `nwsAlertsService.js` → `useWeatherAlerts.js` | Falls back automatically to the Netlify path | Lambda (1769 MB, 60s) |
| nexrad-sync / nexrad-heartbeat | Radar | – | – | **Not migrated (being rebuilt)** |

**Additional services found in the audit:**
- The Netlify edge functions (`netlify/edge-functions/*`), the Supabase Edge Functions and `server/ipaws-server.js` do not use GCP. They stay where they are.
- There are no Google Cloud Functions.
- `cloud/mrms-sync/`, which some Supabase migration comments reference, does not exist.

---

## 3. AWS architecture and rationale

- **Compute: Lambda for all five.** They are short request/response services that scale to zero today. ECS/Fargate would add always-on tasks and an ALB (~$16/mo each) for mostly idle traffic. No service here needs a long-running process; the one that did (nexrad-sync) is radar.
- **No code changes to run them.** The unchanged Node servers run in Lambda through the **AWS Lambda Web Adapter** layer. The only additions are a 4-line `run.sh` per service, which Cloud Run ignores, and gzip in calfire-frap-proxy (below).
- **HTTP: Function URLs + CloudFront, not API Gateway.** API Gateway caps responses at 10 MB and integrations at 29s. fire-perimeters-merge returns ~17.6 MB gzipped (88 MB raw) and FRAP ~36 MB gzipped. Function URLs in `RESPONSE_STREAM` mode allow 200 MB.
- **CloudFront** provides the shared edge cache the services' `Cache-Control` headers already assume. OAC with SigV4 means the Function URLs (`AuthType AWS_IAM`) can't be called around it. One distribution, one path prefix per service, stripped by the adapter.
- **No VPC or NAT.** Every upstream is a public internet API and nothing is private.
- **No DynamoDB, S3 data buckets, EventBridge Scheduler or Secrets Manager.** The migrated services need none of them: no persistent data, no schedule, no secrets. They were radar requirements.
- **Region: us-east-1**, closest to us-east1 and where CloudFront metrics live.
- **IaC: AWS CDK in JavaScript.** It matches the repo's language, needs no extra toolchain, and `cdk synth` plus assertions run offline in `npm test`. CDK is the only IaC in the repo.

### Two issues found by the parallel comparison

1. **The FRAP payload (107 MB) would have regressed.** Lambda streams responses past 6 MB at 2 MB/s, which would take ~50s instead of Cloud Run's ~20s. CloudFront also only compresses objects up to 10 MB. The fix is gzip in `cloud/calfire-frap-proxy/index.mjs`, with the same pattern `fire-perimeters-merge` already uses and gated on `Accept-Encoding`. It cuts the payload to 36 MB (~15s), and the decompressed bytes were verified identical by MD5. `cloud/README.md` had already listed the missing gzip as a known issue.
2. **The README didn't match the live config.** fema-nfhl-proxy's README sets `ALLOWED_ORIGINS`, but the live service doesn't, and Netlify deploy previews depend on the resulting `*`. AWS matches the live behavior.

### Behavior differences that remain (documented, accepted)

- **In-memory caches are per Lambda environment.** Cloud Run shares one per instance across 40 concurrent requests. CloudFront absorbs repeat traffic in front, and each service already coalesces in-flight requests.
- **CloudFront's origin read timeout is capped at 60s** (a quota increase allows up to 180s). calfire-frap-proxy's 120s cold path can therefore show a 504 on the very first request while the function keeps filling its cache. That was measured at 16–20s cold, so it's unlikely.
- **Rate limiters key on the first `X-Forwarded-For` entry,** exactly as on Cloud Run.

---

## 4. Database, storage, scheduler and data migration

- **Firestore → DynamoDB: nothing to migrate.** The only Native Firestore database holds radar data. `nexradcomp` is empty and unused.
- **GCS → S3: nothing to migrate.**
  - The 67 GB scans bucket is radar, and its contents are rolling 2-hour-window payloads that regenerate from NOAA's archive anyway. Nearly all of it is history left behind by the failed prune.
  - The build bucket is disposable.
- **Cloud Scheduler → EventBridge: nothing to migrate.** The only job is the radar sync.
- **Service caches:** all in-memory and rebuilt on first request. No cache data needs copying.

---

## 5. Secrets and IAM

- **Secrets:** none are required. Both Secret Manager entries are unused Supabase leftovers, and the Firebase web config is public by design. No AWS or GCP keys are committed. CI deploys use GitHub OIDC with no stored keys.
- **IAM:**
  - One runtime role per function, allowed only `logs:CreateLogStream`/`PutLogEvents` on its own log group. No managed policies, no wildcards.
  - `sentinel-github-deploy` is trusted only for the `aws-production` GitHub environment of this repo, and may only `sts:AssumeRole` into the CDK bootstrap roles.
  - CloudFront invoke permissions are scoped to the one distribution ARN.
  - No `AdministratorAccess` anywhere. The one-time bootstrap is done by a human admin.

## 6. Observability and cost

- **Logs:** CloudWatch log groups `/sentinel/<service>`, 14-day retention. The services' existing one-JSON-line-per-request logs work unchanged; `severity` becomes a queryable field in Logs Insights.
- **Alarms (16, all to one SNS topic → email):**
  - Per function: invocation errors, throttles, and p95 duration above 80% of timeout.
  - For the distribution: CloudFront 5xx rate above 5%.
  - DynamoDB, S3 and scheduled-task alarms are not applicable, because none of those resources exist.
- **Dashboard:** `sentinel-data-services`.
- **Budget:** a monthly AWS Budget (default $50) plus cost-allocation tags (`project`, `component`, `service`).
- **Cost:** see README.md. The dominant line is CloudFront egress, the same bytes that already leave Cloud Run.

## 7. Tests

| Check | Result |
|---|---|
| `infra/aws` `npm test` (10 assertions: contract, OAC, IAM, no VPC/NAT, log retention, alarms, budget, deploy-role trust) | **10/10 pass** |
| `cdk synth` of both stacks | clean, no warnings |
| Parity: live Cloud Run vs. the same code run locally (`scripts/compare-endpoints.mjs`, 20 checks across all five services, including 400/404 paths) | **20/20 match** |
| FRAP gzip: decompressed body vs. uncompressed body | identical (MD5) |
| Root Vitest suite | 750/751 pass. The one failure (`calFirePerimeters.test.js`, CKAN fallback) **also fails on a clean tree with these changes stashed**. It is pre-existing and likely caused by the local `.env` setting `VITE_CALFIRE_FRAP_PROXY_URL`. |
| ESLint on changed/new files | clean |
| Parity vs. **deployed AWS**, auth/CORS/caching through CloudFront, mobile/desktop app checks | **Not run.** Nothing is deployed yet. Run `compare-endpoints.mjs --right-cloudfront …` after the first deploy (README → Parallel run). |

---

## 8. Cutover and rollback

See README.md. In short: services are switched **one at a time** by changing
the `VITE_*_URL` build secret to the CloudFront URL and redeploying Netlify,
with 48 hours of monitoring between each. Rollback is putting the `*.run.app`
value back. Cloud Run stays up throughout.

## 9. GCP decommission checklist

**Do not delete anything until every "Validation completed?" below is yes.**
The order is:
1. Move traffic.
2. Leave Cloud Run running 2 weeks with no traffic.
3. Scale to zero or delete.

| Resource | Purpose | AWS replacement | Migration status | Safe to delete? | Validation completed? |
|---|---|---|---|---|---|
| Cloud Run `calfire-frap-proxy` | FRAP fallback filter | Lambda `sentinel-calfire-frap-proxy` | IaC ready, not deployed | NO | NO |
| Cloud Run `california-land-ownership-proxy` | Land ownership layer | Lambda `sentinel-california-land-ownership-proxy` | IaC ready, not deployed | NO | NO |
| Cloud Run `fema-nfhl-proxy` | Flood hazard layer | Lambda `sentinel-fema-nfhl-proxy` | IaC ready, not deployed | NO | NO |
| Cloud Run `fire-perimeters-merge` | Active fire perimeters | Lambda `sentinel-fire-perimeters-merge` | IaC ready, not deployed | NO | NO |
| Cloud Run `nws-alerts` | NWS alerts snapshot | Lambda `sentinel-nws-alerts` | IaC ready, not deployed | NO | NO |
| Artifact Registry repos (×5, for the above) | Images | Lambda zip assets (CDK bootstrap bucket) | – | After the rows above | NO |
| Cloud Run `nexrad-heartbeat` | Radar (code deleted) | Radar rebuild | Retired | After a Netlify deploy without radar | Check its request count is 0 |
| Cloud Run Job `nexrad-radar-sync` + Scheduler job | Radar ingest (failing every run; code deleted) | Radar rebuild | Retired | After a Netlify deploy without radar. **Pause the Scheduler job first.** | – |
| GCS `stinkydoodoofart-nexrad-scans` (67 GB) | Radar payloads (regenerable) | Radar rebuild | Retired | After the heartbeat is gone | – |
| Firestore `nexrad-composite` | Radar metadata (regenerable) | Radar rebuild | Retired | After a Netlify deploy without radar | – |
| Firebase web app + Anonymous Auth + browser API key, and the `VITE_FIREBASE_*`/`VITE_NEXRAD_HEARTBEAT_URL` GitHub secrets | Radar reads / heartbeat token | – (radar no longer uses Firebase) | Retired | After a Netlify deploy without radar | – |
| Firestore `nexradcomp` | nothing | – | – | YES (unused) | yes, no references in code |
| GCS `project-idnexrad-scans` | nothing (empty) | – | – | YES | yes, 0 bytes |
| Firebase Hosting default site | nothing (no releases) | – | – | YES | yes, 404, no releases |
| Secret Manager `nexrad-supabase-*` (×2) | nothing (leftover) | – | – | YES | yes, no references in code |
| GCS `sentinel-508719_cloudbuild` | build staging | – | – | After the last Cloud Run deploy | – |
| SAs `nexrad-sync-runtime`, `nexrad-sync-invoker`, `firebase-adminsdk-fbsvc` | radar | – | – | With radar | – |
| Default compute SA | used by the 5 migrated services | – | – | With the project | – |

Cost relief: once a Netlify build from this branch is live, nothing calls
the radar resources. Pause the `nexrad-radar-sync` Scheduler job right away,
since it runs a failing 4 vCPU/8 GiB job every 10 minutes. The bucket,
Firestore database and heartbeat service can go after a quiet week.

---

## 10. Is Sentinel completely independent of GCP?

**NO, not yet.** The repository no longer contains any GCP or Firebase
code: radar was deleted, and `cloud/radar/` is untracked work in progress.
What remains is operational:

1. **The five data services still serve production from Cloud Run** until
   they are deployed to AWS and cut over (`VITE_*_URL` secrets still point at
   `*.run.app`). Their code runs unchanged on either cloud.
2. **The deployed Netlify site still uses the GCP radar stack:** Cloud Run
   `nexrad-heartbeat`, Job `nexrad-radar-sync` plus Scheduler, Firestore
   `nexrad-composite`, GCS `stinkydoodoofart-nexrad-scans`, and Firebase
   Anonymous Auth. This stays true until a build from this branch is deployed.
3. **Live GCP resources not yet deleted:** all of the above, plus Artifact
   Registry, the unused `nexradcomp` database, the empty bucket, the Firebase
   Hosting site, and two leftover secrets. See the checklist in section 9.
4. **`cloud/radar/` (the untracked rebuild)** imports `@google-cloud/storage`
   in `lib/gcsCache.mjs` and describes itself as a Cloud Run service. **The
   rebuild should target AWS (S3) instead**, or it will re-introduce GCP.

**Not GCP infrastructure, and not dependencies of this migration:** Google Fonts, AdSense, GTM/GA4 and Google Forms links.

## 11. Other findings

- `firebase-debug.log` was **tracked in git**, containing a team member's email and a failed CLI auth trace (no token or project ID). It is now deleted and gitignored, but it remains in git history.
- The auto-created Firebase browser API key has no HTTP-referrer restriction.
- Several docs reference files that don't exist: `.env.example`, `cloud/mrms-sync/`, `supabase/functions/nexrad-heartbeat/`, `.github/workflows/nexrad-radar-sync.yml`.
- `cloud/nexrad-sync/README.md` says "every 2 minutes"; the live schedule is every 10 minutes.
