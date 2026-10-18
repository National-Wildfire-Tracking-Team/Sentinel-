/**
 * lightning-stack.mjs
 * Sentinel lightning: the cloud/lightning builder (Python) on Lambda in
 * us-east-1, with its rolling flashes file served through the existing
 * SentinelDataServices CloudFront distribution at /lightning/*.
 *
 *   EventBridge (rate 1 min) ─▶ lightning builder ─▶ s3://sentinel-lightning-<account>/lightning/v1/latest.json
 *          ▲ new GLM files only, unsigned HTTPS (same region)
 *   s3://noaa-goes19, s3://noaa-goes18 (NOAA Open Data, public)
 *   browser ─▶ CloudFront /lightning/* ─OAC─▶ that bucket (read-only)
 *
 * Why us-east-1: NOAA's GOES buckets are there, so reads are in-region, and
 * so is the distribution's stack, so no cross-region references are needed.
 *
 * There is no API function: browsers fetch only latest.json from the CDN,
 * and the builder is the only reader of the NOAA buckets. Its role can write
 * its own logs and the lightning/ prefix, nothing else. The NOAA buckets are
 * read without credentials.
 */

import { CfnOutput, Duration, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { execFileSync } from 'node:child_process';
import { cpSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../cloud/lightning');

export const LIGHTNING = {
  dir: 'lightning',
  pathPrefix: '/lightning', // S3 keys start with lightning/ so CloudFront passes paths through unchanged
  keyPrefix: 'lightning/',
  frontendEnvVar: 'VITE_LIGHTNING_URL',
  region: 'us-east-1', // where s3://noaa-goes19 and s3://noaa-goes18 are
  metricsNamespace: 'Sentinel/Lightning',
  retentionDays: 1, // one object, rewritten every minute; the rule only tidies anything stray
  builderMemoryMb: 1024, // a minute is ~6 files (~2 MB) to decode; 1 GB for CPU, not memory
  builderTimeoutSeconds: 50, // under the 1-minute schedule, so runs don't overlap
  builderScheduleMinutes: 1, // GLM files arrive every 20 s; a minute is the finest EventBridge rate
};

/** Deterministic, so the distribution's stack can name it without a cross-stack reference. */
export function lightningBucketName(account) {
  return `sentinel-lightning-${account}`;
}

// Source files that go into the zip (tests, caches and docs stay out).
const SOURCE_ENTRIES = ['builder.py', 'glm.py', 'lambda_handler.py', 'metrics.py', 'source.py', 'store.py'];

export class LightningStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & { alarmEmail?: string, distributionId?: string }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { alarmEmail, distributionId } = props;
    const cfg = LIGHTNING;

    Tags.of(this).add('project', 'sentinel');
    Tags.of(this).add('component', 'lightning');

    const bucket = new s3.Bucket(this, 'OutputBucket', {
      bucketName: lightningBucketName(this.account),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ id: 'expire-old-objects', expiration: Duration.days(cfg.retentionDays) }],
      // Everything in it is regenerated every minute; keep it on stack
      // deletion only so a delete never fails on a non-empty bucket.
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.bucket = bucket;

    // CloudFront (OAC) may read the flashes file; nothing else is public. With
    // `distributionId` the grant names that one distribution; without it
    // (first deploy) it is any CloudFront distribution in this account.
    const sourceArn = `arn:${this.partition}:cloudfront::${this.account}:distribution/${distributionId || '*'}`;
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'CloudFrontReadsLightning',
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects(`${cfg.keyPrefix}*`)],
      conditions: { StringLike: { 'AWS:SourceArn': sourceArn } },
    }));

    const logGroup = new logs.LogGroup(this, 'BuilderLogs', {
      logGroupName: '/sentinel/lightning-builder',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new iam.Role(this, 'BuilderRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Lightning builder: own logs; read/write under lightning/ (the NOAA GOES buckets are read anonymously)',
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:log-stream:*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [bucket.arnForObjects(`${cfg.keyPrefix}*`)],
    }));
    // So a missing latest.json (first run) is a 404, not a 403.
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': [`${cfg.keyPrefix}*`] } },
    }));

    const builder = new lambda.Function(this, 'Builder', {
      functionName: 'sentinel-lightning-builder',
      description: 'Keeps the last 15 minutes of GOES GLM lightning for the Weather and All Hazards tabs (cloud/lightning)',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      handler: 'lambda_handler.handler',
      code: this.#code(),
      memorySize: cfg.builderMemoryMb,
      timeout: Duration.seconds(cfg.builderTimeoutSeconds),
      role,
      logGroup,
      environment: {
        OUTPUT_BUCKET: bucket.bucketName,
        LIGHTNING_WINDOW_SECONDS: '900',
        // Catch-up cap: a cold 60-file read measured ~10 s off-region; in us-east-1 it's well inside the timeout.
        LIGHTNING_MAX_FILES: '30',
        LIGHTNING_WORKERS: '8',
        PYTHONUNBUFFERED: '1',
      },
    });
    Tags.of(builder).add('service', 'lightning-builder');
    this.builder = builder;

    // A missed tick is harmless (the next one catches up), so no retries and
    // no stale queued invocations piling onto a slow run.
    new events.Rule(this, 'BuilderSchedule', {
      description: `Update the lightning flashes file every ${cfg.builderScheduleMinutes} minute (new GLM files only)`,
      schedule: events.Schedule.rate(Duration.minutes(cfg.builderScheduleMinutes)),
      targets: [new targets.LambdaFunction(builder, { retryAttempts: 0, maxEventAge: Duration.minutes(1) })],
    });

    this.#alarms(builder, alarmEmail);
    new CfnOutput(this, 'LightningBucketName', { value: bucket.bucketName });
  }

  #alarms(builder, alarmEmail) {
    const topic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Sentinel lightning alarms' });
    if (alarmEmail) topic.addSubscription(new subs.EmailSubscription(alarmEmail));
    const action = new cwActions.SnsAction(topic);
    const period = Duration.minutes(10);
    const emf = (metricName, statistic) => new cloudwatch.Metric({
      namespace: LIGHTNING.metricsNamespace,
      metricName,
      dimensionsMap: { Service: LIGHTNING.dir },
      statistic,
      period,
    });
    const alarms = [
      ['BuilderErrors', 'builder failing (lightning will go stale)', builder.metricErrors({ period, statistic: 'Sum' }), 3],
      ['BuilderSlow', `builder near its ${LIGHTNING.builderTimeoutSeconds}s timeout`,
        builder.metricDuration({ period, statistic: 'Maximum' }), LIGHTNING.builderTimeoutSeconds * 1000 * 0.8],
      // A satellite's listing or files failing, run after run (NOAA outage or a format change).
      ['SourceErrors', 'GLM files failing to list or decode', emf('lightning_source_errors', 'Sum'), 20],
      // The staler satellite's newest file: GLM normally lags well under a minute.
      ['DataStale', 'newest GLM file older than 10 minutes', emf('lightning_latest_age_seconds', 'Maximum'), 10 * 60],
    ];
    for (const [name, description, metric, threshold] of alarms) {
      new cloudwatch.Alarm(this, name, {
        alarmDescription: `lightning: ${description}`,
        metric,
        threshold,
        evaluationPeriods: 3,
        datapointsToAlarm: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(action);
    }
  }

  // Same build as weather-models-stack.mjs: uv resolves the arm64 Linux
  // wheels locally (no Docker); the Lambda Python image is the fallback.
  #code() {
    const requirements = path.join(SERVICE_DIR, 'requirements.txt');
    return lambda.Code.fromAsset(SERVICE_DIR, {
      exclude: ['tests', '__pycache__', '.pytest_cache', '.venv', 'README.md', 'requirements-dev.txt', 'pytest.ini', 'local.py'],
      bundling: {
        image: lambda.Runtime.PYTHON_3_13.bundlingImage,
        platform: 'linux/arm64',
        command: ['bash', '-c', `pip install --no-cache-dir -r requirements.txt -t /asset-output && cp ${SOURCE_ENTRIES.join(' ')} /asset-output/`],
        local: {
          tryBundle(outputDir) {
            try {
              execFileSync('uv', ['--version'], { stdio: 'ignore' });
            } catch {
              return false;
            }
            execFileSync('uv', [
              'pip', 'install', '--quiet', '--target', outputDir,
              '--python-platform', 'aarch64-manylinux_2_28', '--python-version', '3.13',
              '--only-binary', ':all:', '-r', requirements,
            ], { stdio: 'inherit' });
            for (const entry of SOURCE_ENTRIES) cpSync(path.join(SERVICE_DIR, entry), path.join(outputDir, entry));
            if (!readdirSync(outputDir).includes('lambda_handler.py')) throw new Error('lightning bundle is missing lambda_handler.py');
            return true;
          },
        },
      },
    });
  }
}
