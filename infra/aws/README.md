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
| `SentinelGithubDeploy` | us-east-1 | GitHub OIDC provider + `sentinel-github-deploy` role (may only assume the CDK bootstrap roles) |

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
