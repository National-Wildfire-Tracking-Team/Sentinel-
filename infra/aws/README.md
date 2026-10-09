# Sentinel on AWS — data services

AWS CDK app (JavaScript) that runs Sentinel's public-data HTTP services on
AWS Lambda behind one CloudFront distribution. It replaces the Cloud Run
services in `cloud/`. The service code is unchanged: the same `index.mjs` runs
on both clouds during the parallel phase.

Radar is **not** here. It's being rebuilt from scratch, and the old
NEXRAD/Firestore/Firebase code has been removed from the repo. See [MIGRATION.md](MIGRATION.md) for the full
audit, the decisions behind this design, and the GCP decommission checklist.

```
browser ─▶ CloudFront (d….cloudfront.net) ─OAC/SigV4─▶ Lambda Function URL ─▶ Lambda Web Adapter ─▶ node index.mjs
           /calfire-frap-proxy/*                          (AuthType AWS_IAM,      (strips the prefix)   (cloud/<service>)
           /california-land-ownership-proxy/*              RESPONSE_STREAM)
           /fema-nfhl-proxy/*
           /fire-perimeters-merge/*
           /nws-alerts/*
           anything else → 404 at the edge
```

| Stack | Region | What it holds |
|---|---|---|
| `SentinelDataServices` | us-east-1 | 5 Lambda functions (arm64, Node 24), 5 Function URLs, 1 CloudFront distribution, cache policy, CloudWatch log groups (14 days), 16 alarms, SNS alarm topic, dashboard, monthly budget |
| `SentinelGithubDeploy` | us-east-1 | GitHub OIDC provider + `sentinel-github-deploy` role (may only assume the CDK bootstrap roles in us-east-1 and us-west-2) |
| `SentinelWeatherModels` *(opt-in)* | **us-west-2** | `sentinel-weather-models` point API (Python 3.13 arm64, IAM-only Function URL, logs-only role) + `sentinel-weather-models-field-builder` (every 15 min) + private fields bucket (3-day expiry), 7 alarms + SNS topic. Served at `/weather-models/*` and `/weather-models/fields/*` on the distribution above. See [Weather Models](#weather-models) |

## Settings

Defaults are in `bin/sentinel.mjs`. Override any of them with `-c sentinel:<key>=<value>`.

| Key | Default | Notes |
|---|---|---|
| `allowedOrigins` | `https://app.nationalwildfiretrackingteam.org` | nws-alerts `ALLOWED_ORIGINS`, same as live Cloud Run |
| `nwsUserAgent` | `SentinelWildfireTracker/1.0 (+https://app…)` | **Set to the same contact the Cloud Run service uses**, because api.weather.gov asks for one. In CI it's the `NWS_USER_AGENT` repo variable. |
| `alarmEmail` | *(none)* | Alarm and budget emails go here. In CI it's the `AWS_ALARM_EMAIL` repo variable. You must confirm the SNS subscription email. |
| `monthlyBudgetUsd` | `50` | Budget alert at 80% actual and 100% forecast. `0` disables it. |
| `githubRepo` | `National-Wildfire-Tracking-Team/Sentinel-` | Trusted by the deploy role |
| `existingOidcProviderArn` | *(none)* | Set this if the account already has a GitHub OIDC provider |
| `weatherModels` | `disabled` | `enabled` adds `SentinelWeatherModels` and the `/weather-models/*` route. In CI it's the `AWS_WEATHER_MODELS` repo variable. |
| `distributionId` | *(none)* | After the first deploy, set it to the `DistributionId` output to narrow the weather-models invoke permission from "CloudFront in this account" to this one distribution. In CI it's `AWS_DISTRIBUTION_ID`. |
| `mrms` | `disabled` | `enabled` adds `SentinelMrms` (us-east-1) and the `/mrms/*` route. In CI it's the `AWS_MRMS` repo variable. With `distributionId` set, the frames bucket is readable only by that distribution. |
| `hafs` | `disabled` | `enabled` adds `SentinelHafs` (us-east-1) and the `/hafs/*` route. In CI it's the `AWS_HAFS` repo variable. With `distributionId` set, only that distribution may invoke it. |
| `hafsReservedConcurrency` | `0` (no cap) | Caps concurrent HAFS frame renders. Same unreserved-concurrency rule as below. |
| `weatherModelsReservedConcurrency` | `0` (no cap) | Caps concurrent weather-models executions. Needs spare account concurrency (at least 10 must stay unreserved). |

Nothing here is a secret. The services call only public APIs, so there's
nothing to put in Secrets Manager.

## Develop and verify offline

No AWS account is needed for any of this.

```bash
cd infra/aws
npm ci
npm test            # synthesizes both stacks and asserts the IAM, networking, caching and cost guards
npx cdk synth       # CloudFormation lands in cdk.out/
```

## First deploy (one-time, from a laptop)

You need AWS credentials for an admin-capable identity in the target account
(`aws login` or `aws configure sso`) and Node 24. Docker is not needed:
functions ship as zip assets.

```bash
cd infra/aws && npm ci
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# 1. Check the Lambda concurrency quota. New accounts can start at 10, which
#    would throttle five services at once. Request 1000 if it's low.
aws service-quotas get-service-quota --service-code lambda --quota-code L-B99A9384 --region us-east-1

# 2. Bootstrap CDK (creates the cdk-hnb659fds-* roles and asset bucket).
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-east-1

# 3. Deploy the services. Outputs print one base URL per service.
npx cdk deploy SentinelDataServices \
  -c sentinel:alarmEmail=<ops mailbox> \
  -c "sentinel:nwsUserAgent=SentinelWildfireTracker/1.0 (<ops contact>)"

# 4. Optional: the CI deploy role, so later deploys don't need a laptop.
npx cdk deploy SentinelGithubDeploy
```

After step 4:
1. Put the `DeployRoleArn` output in the repo secret `AWS_DEPLOY_ROLE_ARN`.
2. Create the GitHub environment `aws-production`. Add required reviewers.
3. Set the repo variables `AWS_ALARM_EMAIL` and `NWS_USER_AGENT`.

From then on, use **Actions → Deploy AWS data services** and choose `diff`
or `deploy`.

Also activate the `project` and `service` cost-allocation tags in the
Billing console. They're applied to every resource, and Cost Explorer can
then split spend per service.

## Weather Models

HRRR/GFS model forecasts (`cloud/weather-models`, contract in its
[README](../../cloud/weather-models/README.md)). Unlike the five migrated
services it's new, it's Python, and it runs in **us-west-2**, next to
dynamical.org's public HRRR/GFS buckets. Same-region reads are free and fast.
It is still served through the one existing distribution, at `/weather-models/*`.

It's opt-in. Without `-c sentinel:weatherModels=enabled` the app synthesizes as
before (the only differences are a new `DistributionId` output and the deploy
role being allowed into us-west-2).

The Models tab's map fields come from a second function in the same stack:
the field builder. EventBridge runs it every 15 minutes; it writes PNG frames
to a private bucket (`sentinel-weather-model-fields-<account>`, us-west-2,
3-day expiry), which CloudFront serves at `/weather-models/fields/*` through
OAC. The bucket policy (in the us-west-2 stack) allows only CloudFront
distributions in this account to read `weather-models/fields/*`, or only this
one distribution once `sentinel:distributionId` is set. The builder can read
and write that prefix and nothing else. It never deletes; the lifecycle rule
does that.

How the two regions connect:

- `SentinelWeatherModels` (us-west-2) owns the function, its IAM-only Function
  URL and CloudFront's invoke permission. The permission has to sit with the
  function, because CloudFormation can't create a Lambda permission in another
  region.
- `SentinelDataServices` (us-east-1) adds the behavior and a Function URL OAC.
  It reads the URL through a CDK cross-region reference (`crossRegionReferences`:
  CDK writes it to SSM in us-east-1 using a small custom resource). CDK deploys
  the us-west-2 stack first.

Deploy (laptop, admin credentials, after the data services are up):

```bash
cd infra/aws && npm ci
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# 1. One-time: bootstrap us-west-2 too.
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-west-2

# 2. Review, then deploy. Deploying SentinelDataServices deploys
#    SentinelWeatherModels first, as a dependency. Needs `uv` (preferred) or Docker
#    to build the arm64 Python zip.
npx cdk diff   SentinelWeatherModels SentinelDataServices -c sentinel:weatherModels=enabled -c sentinel:alarmEmail=<ops mailbox>
npx cdk deploy SentinelDataServices -c sentinel:weatherModels=enabled -c sentinel:alarmEmail=<ops mailbox>

# 3. Narrow the invoke permission to this distribution.
npx cdk deploy SentinelWeatherModels -c sentinel:weatherModels=enabled \
  -c sentinel:distributionId=<DistributionId output> -c sentinel:alarmEmail=<ops mailbox>

# 4. Smoke test through CloudFront. The first field build runs within 15
#    minutes (or invoke sentinel-weather-models-field-builder once by hand).
curl "https://<distribution>/weather-models/health"
curl "https://<distribution>/weather-models/v1/forecast?lat=34.05&lon=-118.25&model=hrrr&hours=6"
curl -I "https://<distribution>/weather-models/fields/v1/manifest.json"
```

Then set the `VITE_WEATHER_MODEL_SERVICE_URL` GitHub secret (and the Netlify env
var for previews) to the `WeatherModelsBaseUrl` output. For CI deploys, set the
repo variables `AWS_WEATHER_MODELS=enabled` and `AWS_DISTRIBUTION_ID`, and
redeploy `SentinelGithubDeploy` once so its role can use the us-west-2
bootstrap roles. You must also confirm the new SNS email subscription.

**Rollback.** Unset `VITE_WEATHER_MODEL_SERVICE_URL`: the page then says model
forecasts aren't configured, and nothing else in the app changes. To remove
the infrastructure, deploy with `weatherModels` unset, then
`npx cdk destroy SentinelWeatherModels -c sentinel:weatherModels=enabled`.

**Cost.** A few dollars a month at current scale: Lambda only on CloudFront
misses, no S3 charges to Sentinel (AWS Open Data, same-region), and no
storage. The breakdown is in the service README.

## MRMS radar

NOAA MRMS radar for the Weather tab (`cloud/mrms`, details in its
[README](../../cloud/mrms/README.md)). It has no API function:
- a builder Lambda runs every 2 minutes (EventBridge);
- it reads only new files from `s3://noaa-mrms-pds`, anonymously and in the same region;
- it writes 8-bit PNG frames and a manifest to a private bucket (`sentinel-mrms-frames-<account>`, 1-day expiry);
- CloudFront serves that bucket at `/mrms/*` through OAC.

It's in **us-east-1**, the same region as both the NOAA bucket and the distribution's stack, so it needs no cross-region references or new bootstrap.

It's opt-in. Without `-c sentinel:mrms=enabled` nothing changes. With it, `SentinelDataServices` depends on `SentinelMrms`, so deploying the distribution deploys MRMS first. That includes CI, which deploys only `SentinelDataServices`.

Deploy (laptop, admin credentials, after the data services are up):

```bash
cd infra/aws && npm ci
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# 1. Review, then deploy (needs `uv` or Docker for the arm64 Python zip).
npx cdk diff   SentinelMrms SentinelDataServices -c sentinel:mrms=enabled -c sentinel:alarmEmail=<ops mailbox>
npx cdk deploy SentinelDataServices -c sentinel:mrms=enabled -c sentinel:alarmEmail=<ops mailbox>

# 2. Narrow the bucket's read grant to this distribution (if not already passing it).
npx cdk deploy SentinelDataServices -c sentinel:mrms=enabled -c sentinel:distributionId=<DistributionId output> \
  -c sentinel:alarmEmail=<ops mailbox>

# 3. Smoke test. The first build runs within 2 minutes (or invoke sentinel-mrms-builder by hand);
#    the hour of history fills in over the next few runs.
curl -s "https://<distribution>/mrms/v1/manifest.json" | head -c 600
```

Then set the `VITE_MRMS_URL` GitHub secret (and the Netlify env var for
previews) to the `MrmsBaseUrl` output. For CI deploys, set the repo variable
`AWS_MRMS=enabled`. You must also confirm the new SNS email subscription.

**Rollback.** Unset `VITE_MRMS_URL`: the layer row disappears. To remove the
infrastructure, deploy with `mrms` unset, then
`npx cdk destroy SentinelMrms -c sentinel:mrms=enabled`. The bucket is
retained; its lifecycle rule empties it within a day.

**Cost.** About $2–7 a month (breakdown in the service README).

## HAFS hurricane model

HAFS fields for the Models tab (`cloud/hafs`, details in its
[README](../../cloud/hafs/README.md)). One Python function renders frames
on request:

- it reads `s3://noaa-nws-hafs-pds` anonymously, in the same region, with range requests for single fields;
- CloudFront serves it at `/hafs/*` through OAC, with Origin Shield in us-east-1 and its own cache policy (path-only key, up to a year for immutable frames);
- its role can write its own logs and nothing else.

It's opt-in. Without `-c sentinel:hafs=enabled` nothing changes. With it,
`SentinelDataServices` reads the function's URL from `SentinelHafs`, so
deploying the distribution deploys HAFS first. That includes CI, which
deploys only `SentinelDataServices`.

Deploy (laptop, admin credentials). Always pass the **full** live context:
a feature left out of `-c` is removed from the distribution.

```bash
cd infra/aws && npm ci
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
CTX=(-c sentinel:hafs=enabled -c sentinel:weatherModels=enabled -c sentinel:mrms=enabled
     -c sentinel:distributionId=<DistributionId> -c sentinel:alarmEmail=<ops mailbox>
     -c "sentinel:nwsUserAgent=<live user agent>")

# 1. Review: expect a new SentinelHafs stack and, on the distribution, only the
#    /hafs/* behavior, its origin, OAC, cache policy and the HafsBaseUrl output.
npx cdk diff SentinelHafs SentinelDataServices "${CTX[@]}"
npx cdk deploy SentinelDataServices "${CTX[@]}"

# 2. Smoke test through CloudFront.
curl -s "https://<distribution>/hafs/health"
curl -s "https://<distribution>/hafs/v1/catalog" | head -c 600
```

Then set the `VITE_HAFS_URL` GitHub secret (and the Netlify env var for
previews) to the `HafsBaseUrl` output, set the repo variable `AWS_HAFS=enabled`
for CI deploys, and confirm the new SNS email subscription.

**Rollback.** Unset `VITE_HAFS_URL`: the Models tab stops offering HAFS. To
remove the infrastructure, deploy with `hafs` unset, then
`npx cdk destroy SentinelHafs -c sentinel:hafs=enabled`.

**Cost.** A cold frame is ~1–3 GB-s of Lambda (~$0.00004), and each frame
is rendered once and then served from the edge. Even 20k distinct frames a
month is under $1 of Lambda; CloudFront transfer of 0.1–0.5 MB frames and
5 alarms ($0.50) make the rest. Expect about $1–5 a month in storm season,
near zero outside it (HAFS runs only while storms are active).

## Parallel run and validation

Keep Cloud Run running. Compare both clouds with the frontend's own requests:

```bash
G=6cg2fvgoga-ue.a.run.app   # Cloud Run URL suffix for project sentinel-508719
node scripts/compare-endpoints.mjs \
  --left-label gcp \
    --left calfire-frap-proxy=https://calfire-frap-proxy-$G \
    --left california-land-ownership-proxy=https://california-land-ownership-proxy-$G \
    --left fema-nfhl-proxy=https://fema-nfhl-proxy-$G \
    --left fire-perimeters-merge=https://fire-perimeters-merge-$G \
    --left nws-alerts=https://nws-alerts-$G \
  --right-label aws --right-cloudfront https://<DistributionDomain>
```

The script checks status, content type, CORS, cache directives, ETag, JSON
key shape, `schemaVersion` and feature counts. Counts may drift within 2%,
since both sides read live upstreams. It exits 1 on any mismatch. Run it a
few times across a day, including once while a cold Lambda starts.

One difference is expected. `calfire-frap-proxy` now gzips its response, so
it adds `Vary: Accept-Encoding` and `Content-Encoding: gzip`. The body
decompresses to the identical bytes. Redeploying Cloud Run from this branch
makes both sides the same.

## Cutover

The frontend already has the abstraction: each service is used only through
its `VITE_*_URL` build variable (see `lib/services.mjs`). There's no
frontend code change.

1. Set one GitHub secret at a time to the matching `…BaseUrl` stack output.
   A suggested order, least to most critical:
   1. `VITE_CALFIRE_FRAP_PROXY_URL`
   2. `VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL`
   3. `VITE_FEMA_NFHL_PROXY_URL`
   4. `VITE_FIRE_MERGE_SERVICE_URL`
   5. `VITE_NWS_ALERTS_SERVICE_URL`
   6. `VITE_HURRICANE_MODELS_URL`: new on AWS, with no Cloud Run
      counterpart. Unsetting it falls back to the browser path; see
      `cloud/hurricane-models/README.md`.
2. Re-run the **Deploy** workflow (Netlify). Also update the same variables
   in Netlify's environment for deploy previews and branch builds.
3. Watch the `sentinel-data-services` CloudWatch dashboard and the alarms
   for 48 hours before moving the next service.

## Rollback

- **Traffic:** set the `VITE_*_URL` secret back to its `*.run.app` value and
  redeploy Netlify. Cloud Run keeps running until the decommission checklist
  in MIGRATION.md is signed off, so rollback is always available until then.
  Leaving a secret empty makes the frontend use its original direct/Netlify
  path, except FEMA NFHL, which has no fallback by design.
- **Infrastructure:** `git revert` the change and run the deploy again.
  CloudFormation rolls back a failed deploy on its own.
- **Full removal:** `npx cdk destroy SentinelDataServices`. The stack holds
  no data; log groups are destroyed with it.

## Cost (estimate, us-east-1, before free tier)

- **Lambda:** arm64 at ~$0.0000133/GB-s. Each service scales to zero when idle.
- **CloudFront:** $0.085/GB to US viewers, $0.0075 per 10k HTTPS requests.
  This is the dominant line, and it is the same traffic that today leaves
  Cloud Run as egress at a similar $/GB. Edge caching only shifts which bill
  carries it.
- **CloudWatch:** 16 alarms at ~$1.60/mo, one dashboard at $3/mo, logs at
  $0.50/GB ingested with 14-day retention.
- **Not used:** no NAT Gateway, no load balancer, no always-on compute, no
  VPC, no DynamoDB, no S3 data buckets.
