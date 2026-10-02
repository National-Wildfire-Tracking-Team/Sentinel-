/**
 * mrms-stack.mjs
 * Sentinel MRMS: the cloud/mrms frame builder (Python) on Lambda in
 * us-east-1, with its frames served through the existing SentinelDataServices
 * CloudFront distribution at /mrms/*.
 *
 *   EventBridge (rate 2 min) ─▶ MRMS builder ─▶ s3://sentinel-mrms-frames-<account>/mrms/v1/…
 *          ▲ new files only, unsigned HTTPS (same region)
 *   s3://noaa-mrms-pds (NOAA Open Data, public)
 *   browser ─▶ CloudFront /mrms/* ─OAC─▶ that bucket (read-only)
 *
 * Why us-east-1: NOAA's MRMS bucket is there, so reads are in-region, and
 * so is the distribution's stack, so no cross-region references are needed.
 *
 * There is no API function: browsers fetch only static frames and the
 * manifest from the CDN, and the builder is the only reader of the NOAA
 * bucket. Its role can write its own logs and the frames prefix, nothing else.
 * The NOAA bucket is read without credentials.
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

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../cloud/mrms');

export const MRMS = {
  dir: 'mrms',
  pathPrefix: '/mrms', // S3 keys start with mrms/ so CloudFront passes paths through unchanged
  keyPrefix: 'mrms/',
  frontendEnvVar: 'VITE_MRMS_URL',
  region: 'us-east-1', // where s3://noaa-mrms-pds is
  metricsNamespace: 'Sentinel/MRMS',
  retentionDays: 1, // the manifest lists the last hour; a day covers CDN-cached manifests and debugging
  builderMemoryMb: 2048, // measured peak ~1.1 GB with 3 workers; ~1.2 vCPU
  builderTimeoutSeconds: 100, // under the 2-minute schedule, so runs don't overlap
  builderScheduleMinutes: 2, // MRMS's own update cadence
};

/** Deterministic, so the distribution's stack can name it without a cross-stack reference. */
export function mrmsBucketName(account) {
  return `sentinel-mrms-frames-${account}`;
}

// Source files that go into the zip (tests, caches and docs stay out).
const SOURCE_ENTRIES = ['builder.py', 'grib2.py', 'grids.py', 'lambda_handler.py', 'metrics.py', 'png.py', 'products.py', 'source.py', 'store.py'];

export class MrmsStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & { alarmEmail?: string, distributionId?: string }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { alarmEmail, distributionId } = props;
    const cfg = MRMS;

    Tags.of(this).add('project', 'sentinel');
    Tags.of(this).add('component', 'mrms');

    const bucket = new s3.Bucket(this, 'FramesBucket', {
      bucketName: mrmsBucketName(this.account),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ id: 'expire-old-frames', expiration: Duration.days(cfg.retentionDays) }],
      // Everything in it is regenerated within the hour; keep it on stack
      // deletion only so a delete never fails on a non-empty bucket.
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.bucket = bucket;

    // CloudFront (OAC) may read frames; nothing else is public. With
    // `distributionId` the grant names that one distribution; without it
    // (first deploy) it is any CloudFront distribution in this account.
    const sourceArn = `arn:${this.partition}:cloudfront::${this.account}:distribution/${distributionId || '*'}`;
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'CloudFrontReadsMrmsFrames',
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects(`${cfg.keyPrefix}*`)],
      conditions: { StringLike: { 'AWS:SourceArn': sourceArn } },
    }));

    const logGroup = new logs.LogGroup(this, 'BuilderLogs', {
      logGroupName: '/sentinel/mrms-builder',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new iam.Role(this, 'BuilderRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'MRMS builder: own logs; read/write frames under mrms/ (the NOAA bucket is read anonymously)',
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:log-stream:*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [bucket.arnForObjects(`${cfg.keyPrefix}*`)],
    }));
    // So a missing manifest (first run) is a 404, not a 403.
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': [`${cfg.keyPrefix}*`] } },
    }));

    const builder = new lambda.Function(this, 'Builder', {
      functionName: 'sentinel-mrms-builder',
      description: 'Builds MRMS radar map frames for the Weather tab every 2 minutes (cloud/mrms)',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      handler: 'lambda_handler.handler',
      code: this.#code(),
      memorySize: cfg.builderMemoryMb,
      timeout: Duration.seconds(cfg.builderTimeoutSeconds),
      role,
      logGroup,
      environment: {
        FRAMES_BUCKET: bucket.bucketName,
        MRMS_WINDOW_MINUTES: '60',
        // Catch-up cap: measured ~1.85 s per frame (lo + hi) at 2 GB, so 4 per product (24 frames) ≈ 45 s, well inside the timeout.
        MRMS_MAX_NEW_FRAMES: '4',
        MRMS_WORKERS: '3',
        PYTHONUNBUFFERED: '1',
      },
    });
    Tags.of(builder).add('service', 'mrms-builder');
    this.builder = builder;

    // A missed tick is harmless (the next one catches up), so no retries and
    // no stale queued invocations piling onto a slow run.
    new events.Rule(this, 'BuilderSchedule', {
      description: `Build MRMS map frames every ${cfg.builderScheduleMinutes} minutes (new files only)`,
      schedule: events.Schedule.rate(Duration.minutes(cfg.builderScheduleMinutes)),
      targets: [new targets.LambdaFunction(builder, { retryAttempts: 0, maxEventAge: Duration.minutes(2) })],
    });

    this.#alarms(builder, alarmEmail);
    new CfnOutput(this, 'FramesBucketName', { value: bucket.bucketName });
  }

  #alarms(builder, alarmEmail) {
    const topic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Sentinel MRMS alarms' });
    if (alarmEmail) topic.addSubscription(new subs.EmailSubscription(alarmEmail));
    const action = new cwActions.SnsAction(topic);
    const period = Duration.minutes(10);
    const emf = (metricName, statistic) => new cloudwatch.Metric({
      namespace: MRMS.metricsNamespace,
      metricName,
      dimensionsMap: { Service: MRMS.dir },
      statistic,
      period,
    });
    const alarms = [
      ['BuilderErrors', 'builder failing (radar frames will go stale)', builder.metricErrors({ period, statistic: 'Sum' }), 2],
      ['BuilderSlow', `builder near its ${MRMS.builderTimeoutSeconds}s timeout`,
        builder.metricDuration({ period, statistic: 'Maximum' }), MRMS.builderTimeoutSeconds * 1000 * 0.8],
      // Some product failing to list or decode, run after run (NOAA outage or a format change).
      ['ProductErrors', 'MRMS products failing to list or decode', emf('mrms_product_errors', 'Sum'), 10],
      // The oldest product's newest frame: MRMS normally lags ~4 minutes.
      ['DataStale', 'newest MRMS frame older than 20 minutes', emf('mrms_latest_age_seconds', 'Maximum'), 20 * 60],
    ];
    for (const [name, description, metric, threshold] of alarms) {
      new cloudwatch.Alarm(this, name, {
        alarmDescription: `mrms: ${description}`,
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
            if (!readdirSync(outputDir).includes('lambda_handler.py')) throw new Error('mrms bundle is missing lambda_handler.py');
            return true;
          },
        },
      },
    });
  }
}
