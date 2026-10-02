/**
 * weather-models-stack.mjs
 * Sentinel Weather Models: cloud/weather-models (Python) on Lambda in
 * us-west-2, served through the existing SentinelDataServices CloudFront
 * distribution at /weather-models/*.
 *
 *   browser ─▶ CloudFront (us-east-1 stack) ─OAC/SigV4─▶ Function URL (us-west-2) ─▶ LWA ─▶ python app.py
 *                                                                                         │
 *                                       s3://dynamical-noaa-hrrr, s3://dynamical-noaa-gfs ◀┘ (anonymous, same region)
 *
 * Why us-west-2 when everything else is in us-east-1: the HRRR and GFS
 * Icechunk datasets live there. Same-region S3 → Lambda transfer is free and
 * fast; from us-east-1 every uncached point read (~20-25 MB of chunks)
 * would cost inter-region transfer and ~70 ms per S3 round trip.
 *
 * Why Python: Icechunk only has a Rust/Python reader. Dependencies are
 * pure manylinux wheels, so the zip is built locally with `uv` for arm64
 * (no Docker), with Docker as the fallback (see #code()).
 *
 * The function reads only public Open Data buckets, anonymously: its role
 * can write its own log group and nothing else.
 *
 * Map fields (the Models tab's spatial layers) come from a second function
 * built from the same code: the field builder. EventBridge runs it every 15
 * minutes; when a model has a new complete run it reads each variable once,
 * writes Web Mercator PNG frames for every forecast hour (plus HRRR − GFS
 * differences) to a private bucket, and publishes manifest.json last.
 * CloudFront serves the bucket at /weather-models/fields/* through OAC.
 *
 *   EventBridge (rate 15 min) ─▶ field builder ─▶ s3://sentinel-weather-model-fields-<account>/weather-models/fields/v1/…
 *   browser ─▶ CloudFront /weather-models/fields/* ─OAC─▶ that bucket (read-only)
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
import { LWA_LAYER_ACCOUNT, LWA_LAYER_NAME, LWA_LAYER_VERSION } from './services.mjs';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../cloud/weather-models');

export const WEATHER_MODELS = {
  dir: 'weather-models',
  pathPrefix: '/weather-models',
  frontendEnvVar: 'VITE_WEATHER_MODEL_SERVICE_URL',
  region: 'us-west-2', // where dynamical.org's HRRR and GFS buckets are
  memoryMb: 1769, // 1 vCPU: chunk decompression is CPU-bound; also holds the 256 MB chunk cache
  timeoutSeconds: 30,
  metricsNamespace: 'Sentinel/WeatherModels',
  fieldsPathPrefix: '/weather-models/fields', // S3 keys start with weather-models/fields/ so CloudFront passes paths through unchanged
  fieldsKeyPrefix: 'weather-models/fields/',
  fieldsRetentionDays: 3, // a run is replaced within 6 h; 3 days covers CDN-cached manifests and debugging
  builderMemoryMb: 4096, // measured peak ~2.6 GB for a full HRRR + GFS + difference build; ~2.3 vCPU
  builderTimeoutSeconds: 900,
  builderScheduleMinutes: 15,
  // Keeps one API instance initialised (imports, dataset sessions, run
  // indexes), so a user's first click skips the multi-second cold start.
  // About 290 short invocations a day, within Lambda's free tier.
  warmScheduleMinutes: 5,
};

/** Deterministic, so the us-east-1 distribution can name it without a cross-region lookup. */
export function fieldsBucketName(account) {
  return `sentinel-weather-model-fields-${account}`;
}

// Source files that go into the zip (tests, caches and docs stay out).
const SOURCE_ENTRIES = ['app.py', 'cache.py', 'metrics.py', 'normalize.py', 'service.py', 'providers', 'fields', 'run.sh'];

export class WeatherModelsStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & {
   *   alarmEmail?: string,
   *   distributionId?: string,
   *   reservedConcurrency?: number,
   * }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { alarmEmail, distributionId, reservedConcurrency } = props;
    const cfg = WEATHER_MODELS;

    Tags.of(this).add('project', 'sentinel');
    Tags.of(this).add('component', 'weather-models');

    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `/sentinel/${cfg.dir}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Logs only. The HRRR/GFS buckets are public AWS Open Data read with
    // unsigned requests, so the role needs no S3 permissions at all.
    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Runtime role for weather-models (logs only; datasets are read anonymously)',
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:log-stream:*`],
    }));

    const code = this.#code();
    const adapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'WebAdapterLayer',
      `arn:aws:lambda:${this.region}:${LWA_LAYER_ACCOUNT}:layer:${LWA_LAYER_NAME}:${LWA_LAYER_VERSION}`,
    );

    const fn = new lambda.Function(this, 'Function', {
      functionName: `sentinel-${cfg.dir}`,
      description: 'Sentinel Weather Models: HRRR/GFS point forecasts from dynamical.org Icechunk (cloud/weather-models)',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      handler: 'run.sh',
      code,
      layers: [adapterLayer],
      memorySize: cfg.memoryMb,
      timeout: Duration.seconds(cfg.timeoutSeconds),
      reservedConcurrentExecutions: reservedConcurrency > 0 ? reservedConcurrency : undefined,
      role,
      logGroup,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_PORT: '8080',
        AWS_LWA_READINESS_CHECK_PATH: '/health',
        AWS_LWA_REMOVE_BASE_PATH: cfg.pathPrefix,
        WEATHER_MODELS_CHUNK_CACHE_MB: '256',
        WEATHER_MODELS_SESSION_TTL_SECONDS: '60',
        WEATHER_MODELS_S_MAXAGE_SECONDS: '600',
        PYTHONUNBUFFERED: '1',
      },
    });
    Tags.of(fn).add('service', cfg.dir);
    this.function = fn;

    // IAM auth: only CloudFront (via OAC) can call it. Small JSON
    // responses, so buffered mode.
    this.functionUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // CloudFront OAC needs both actions. The distribution lives in another
    // region's stack, so the grant is made here. With `distributionId` set
    // it names that one distribution; without it (first deploy, before the
    // distribution exists) it is limited to CloudFront distributions in this
    // account. Set sentinel:distributionId after the first deploy to tighten.
    const sourceArn = `arn:${this.partition}:cloudfront::${this.account}:distribution/${distributionId || '*'}`;
    for (const [suffix, action] of [['Url', 'lambda:InvokeFunctionUrl'], ['', 'lambda:InvokeFunction']]) {
      new lambda.CfnPermission(this, `InvokeFromCloudFront${suffix}`, {
        action,
        principal: 'cloudfront.amazonaws.com',
        functionName: fn.functionArn,
        sourceArn,
        sourceAccount: this.account,
      });
    }

    // Keep-warm: the Lambda Web Adapter hands this non-HTTP event to the
    // app as POST /events (see app.py). A missed tick costs one cold start.
    new events.Rule(this, 'WarmSchedule', {
      description: `Keep one weather-models API instance warm (every ${cfg.warmScheduleMinutes} minutes)`,
      schedule: events.Schedule.rate(Duration.minutes(cfg.warmScheduleMinutes)),
      targets: [new targets.LambdaFunction(fn, { retryAttempts: 0, maxEventAge: Duration.minutes(2) })],
    });

    const alarmAction = this.#alarms(fn, alarmEmail);
    this.#fields(code, sourceArn, alarmAction);

    new CfnOutput(this, 'FunctionUrl', { value: this.functionUrl.url, description: 'Reachable only through CloudFront (AWS_IAM)' });
  }

  #fields(code, cloudFrontSourceArn, alarmAction) {
    const cfg = WEATHER_MODELS;
    const bucket = new s3.Bucket(this, 'FieldsBucket', {
      bucketName: fieldsBucketName(this.account),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ id: 'expire-old-runs', expiration: Duration.days(cfg.fieldsRetentionDays) }],
      // Everything in it is regenerated every run; keep it on stack deletion
      // only so a delete never fails on a non-empty bucket.
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.fieldsBucket = bucket;

    // CloudFront (OAC) may read field objects; nothing else is public.
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'CloudFrontReadsModelFields',
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects(`${cfg.fieldsKeyPrefix}*`)],
      conditions: { StringLike: { 'AWS:SourceArn': cloudFrontSourceArn } },
    }));

    const logGroup = new logs.LogGroup(this, 'FieldBuilderLogs', {
      logGroupName: '/sentinel/weather-models-field-builder',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new iam.Role(this, 'FieldBuilderRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Field builder: own logs; read/write field objects under weather-models/fields/ (datasets are read anonymously)',
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:log-stream:*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [bucket.arnForObjects(`${cfg.fieldsKeyPrefix}*`)],
    }));
    // So a missing manifest (first run) is a 404, not a 403.
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [bucket.bucketArn],
      conditions: { StringLike: { 's3:prefix': [`${cfg.fieldsKeyPrefix}*`] } },
    }));

    const builder = new lambda.Function(this, 'FieldBuilder', {
      functionName: 'sentinel-weather-models-field-builder',
      description: 'Builds HRRR/GFS map-field PNGs for the Models tab when a new model run completes (cloud/weather-models/fields)',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      handler: 'fields.lambda_handler.handler',
      code,
      memorySize: cfg.builderMemoryMb,
      timeout: Duration.seconds(cfg.builderTimeoutSeconds),
      role,
      logGroup,
      environment: { FIELDS_BUCKET: bucket.bucketName, FIELD_BUILDER_WORKERS: '4', PYTHONUNBUFFERED: '1' },
    });
    Tags.of(builder).add('service', 'weather-models-field-builder');
    this.fieldBuilder = builder;

    // A missed tick is harmless (the next one catches up), so no retries and
    // no stale queued invocations piling onto a slow build.
    new events.Rule(this, 'FieldBuilderSchedule', {
      description: `Build Models-tab map fields every ${cfg.builderScheduleMinutes} minutes (no-op unless a model run is new)`,
      schedule: events.Schedule.rate(Duration.minutes(cfg.builderScheduleMinutes)),
      targets: [new targets.LambdaFunction(builder, { retryAttempts: 0, maxEventAge: Duration.minutes(10) })],
    });

    const period = Duration.minutes(15);
    new cloudwatch.Alarm(this, 'FieldBuilderErrors', {
      alarmDescription: 'weather-models field builder failing (map fields will go stale)',
      metric: builder.metricErrors({ period, statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 4,
      datapointsToAlarm: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);
    new cloudwatch.Alarm(this, 'FieldBuilderSlow', {
      alarmDescription: 'weather-models field builder near its 15-minute timeout',
      metric: builder.metricDuration({ period, statistic: 'Maximum' }),
      threshold: cfg.builderTimeoutSeconds * 1000 * 0.8,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    new CfnOutput(this, 'FieldsBucketName', { value: bucket.bucketName });
  }

  #code() {
    const requirements = path.join(SERVICE_DIR, 'requirements.txt');
    const copySources = (outputDir) => {
      for (const entry of SOURCE_ENTRIES) {
        cpSync(path.join(SERVICE_DIR, entry), path.join(outputDir, entry), {
          recursive: true,
          filter: (src) => !src.includes('__pycache__'),
        });
      }
    };
    return lambda.Code.fromAsset(SERVICE_DIR, {
      exclude: ['tests', '__pycache__', '.pytest_cache', '.venv', 'README.md', 'requirements-dev.txt', 'pytest.ini'],
      bundling: {
        image: lambda.Runtime.PYTHON_3_13.bundlingImage,
        platform: 'linux/arm64',
        command: ['bash', '-c', `pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -r ${SOURCE_ENTRIES.join(' ')} /asset-output/`],
        local: {
          // Preferred: uv resolves the arm64 Linux wheels from any OS, so no
          // Docker is needed (matching the rest of infra/aws).
          tryBundle(outputDir) {
            try {
              execFileSync('uv', ['--version'], { stdio: 'ignore' });
            } catch {
              return false; // fall back to the Docker image above
            }
            execFileSync('uv', [
              'pip', 'install', '--quiet', '--target', outputDir,
              '--python-platform', 'aarch64-manylinux_2_28', '--python-version', '3.13',
              '--only-binary', ':all:', '-r', requirements,
            ], { stdio: 'inherit' });
            copySources(outputDir);
            if (!readdirSync(outputDir).includes('app.py')) throw new Error('weather-models bundle is missing app.py');
            return true;
          },
        },
      },
    });
  }

  #alarms(fn, alarmEmail) {
    // Alarms must live in the metrics' region, so this stack has its own
    // topic; it mails the same address as the data-services topic.
    const topic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Sentinel weather-models alarms' });
    if (alarmEmail) topic.addSubscription(new subs.EmailSubscription(alarmEmail));
    const action = new cwActions.SnsAction(topic);
    const common = { evaluationPeriods: 3, datapointsToAlarm: 2, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING };
    const period = Duration.minutes(5);
    const emf = (metricName) => new cloudwatch.Metric({
      namespace: WEATHER_MODELS.metricsNamespace,
      metricName,
      dimensionsMap: { Service: WEATHER_MODELS.dir },
      statistic: 'Sum',
      period,
    });

    const alarms = [
      ['Errors', 'Lambda invocation errors (crash or timeout)', fn.metricErrors({ period, statistic: 'Sum' }), 3],
      ['Throttles', 'Lambda throttled', fn.metricThrottles({ period, statistic: 'Sum' }), 1],
      ['SlowP95', `p95 duration above 80% of the ${WEATHER_MODELS.timeoutSeconds}s timeout`,
        fn.metricDuration({ period, statistic: 'p95' }), WEATHER_MODELS.timeoutSeconds * 1000 * 0.8],
      // The service answers 502 when S3/Icechunk reads fail; those aren't
      // Lambda errors, so they're watched through the EMF metric.
      ['DatasetErrors', 'HRRR/GFS dataset reads failing (S3 or Icechunk)', emf('dataset_errors'), 5],
      // Sustained stale data means dynamical.org's ingest has stopped.
      ['StaleData', 'Model runs older than their stale threshold are being served', emf('stale_data_events'), 10],
    ];
    for (const [name, description, metric, threshold] of alarms) {
      new cloudwatch.Alarm(this, name, {
        alarmDescription: `weather-models: ${description}`,
        metric,
        threshold,
        ...common,
      }).addAlarmAction(action);
    }
    return action;
  }
}
