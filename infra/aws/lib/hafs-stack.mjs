/**
 * hafs-stack.mjs
 * Sentinel HAFS: cloud/hafs (Python) on Lambda in us-east-1, served through
 * the existing SentinelDataServices CloudFront distribution at /hafs/*.
 *
 *   browser ─▶ CloudFront /hafs/* (Origin Shield) ─OAC/SigV4─▶ Function URL ─▶ lambda_handler.handler
 *                                                                                  │ unsigned HTTPS, range reads
 *                                            s3://noaa-nws-hafs-pds (NOAA Open Data) ◀┘ (NOMADS as fallback)
 *
 * Why us-east-1: NOAA's HAFS bucket is there, so the range reads behind a
 * frame stay in-region, and so is the distribution's stack.
 *
 * Why an API rather than a builder (like MRMS): one storm-run is ~1,300
 * possible frames, most never viewed, so frames are rendered on request and
 * cached at the edge as immutable. Origin Shield makes the first render the
 * only one: every other edge fills from the shield.
 *
 * No Web Adapter: the handler speaks the Function URL event format itself
 * and returns PNGs base64-encoded (BUFFERED mode; frames are well under the
 * 6 MB response limit). The role can write its own logs and nothing else;
 * NOAA is read without credentials.
 */

import { CfnOutput, Duration, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { execFileSync } from 'node:child_process';
import { cpSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../cloud/hafs');

export const HAFS = {
  dir: 'hafs',
  pathPrefix: '/hafs', // the handler strips it, so CloudFront passes paths through unchanged
  frontendEnvVar: 'VITE_HAFS_URL',
  region: 'us-east-1', // where s3://noaa-nws-hafs-pds is
  metricsNamespace: 'Sentinel/HAFS',
  // 1 vCPU: a frame is a GRIB2 decode plus a reprojection in numpy (~0.5-2 s
  // cold for the parent domain); the run-detail listing is I/O on 16 threads.
  memoryMb: 1769,
  timeoutSeconds: 30,
};

// Runtime files only (tests, local.py, caches and docs stay out).
const SOURCE_ENTRIES = ['fields.py', 'grib2.py', 'idx.py', 'lambda_handler.py', 'metrics.py', 'models.py', 'png.py',
  'render.py', 'service.py', 'source.py'];

export class HafsStack extends Stack {
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
    const cfg = HAFS;

    Tags.of(this).add('project', 'sentinel');
    Tags.of(this).add('component', 'hafs');

    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `/sentinel/${cfg.dir}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Runtime role for hafs (logs only; NOAA HAFS is read anonymously)',
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:log-stream:*`],
    }));

    const fn = new lambda.Function(this, 'Function', {
      functionName: `sentinel-${cfg.dir}`,
      description: 'Sentinel HAFS: hurricane-model map frames rendered on demand from NOAA HAFS (cloud/hafs)',
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      handler: 'lambda_handler.handler',
      code: this.#code(),
      memorySize: cfg.memoryMb,
      timeout: Duration.seconds(cfg.timeoutSeconds),
      reservedConcurrentExecutions: reservedConcurrency > 0 ? reservedConcurrency : undefined,
      role,
      logGroup,
      environment: {
        // No ALLOWED_ORIGINS: the data is public, so every response says
        // Access-Control-Allow-Origin: *, and the edge cache needn't key on Origin.
        HAFS_RATE_LIMIT_PER_MINUTE: '600',
        HAFS_WORKERS: '16',
        PYTHONUNBUFFERED: '1',
      },
    });
    Tags.of(fn).add('service', cfg.dir);
    this.function = fn;

    this.functionUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // CloudFront OAC needs both actions. Granted here (as WeatherModelsStack
    // does) so the distribution's stack needs no permission on this function.
    // Without `distributionId` it covers this account's distributions; set
    // sentinel:distributionId to name the one.
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

    this.#alarms(fn, alarmEmail);
    new CfnOutput(this, 'FunctionUrl', { value: this.functionUrl.url, description: 'Reachable only through CloudFront (AWS_IAM)' });
  }

  #code() {
    const requirements = path.join(SERVICE_DIR, 'requirements.txt');
    return lambda.Code.fromAsset(SERVICE_DIR, {
      exclude: ['tests', '__pycache__', '.pytest_cache', '.venv', 'README.md', 'requirements-dev.txt', 'pytest.ini', 'local.py'],
      bundling: {
        image: lambda.Runtime.PYTHON_3_13.bundlingImage,
        platform: 'linux/arm64',
        command: ['bash', '-c', `pip install --no-cache-dir -r requirements.txt -t /asset-output && cp ${SOURCE_ENTRIES.join(' ')} /asset-output/`],
        local: {
          // Preferred: uv fetches the arm64 Linux numpy wheel from any OS, no Docker.
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
            for (const entry of SOURCE_ENTRIES) cpSync(path.join(SERVICE_DIR, entry), path.join(outputDir, entry));
            if (!readdirSync(outputDir).includes('lambda_handler.py')) throw new Error('hafs bundle is missing lambda_handler.py');
            return true;
          },
        },
      },
    });
  }

  #alarms(fn, alarmEmail) {
    const topic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Sentinel HAFS alarms' });
    if (alarmEmail) topic.addSubscription(new subs.EmailSubscription(alarmEmail));
    const action = new cwActions.SnsAction(topic);
    const common = { evaluationPeriods: 3, datapointsToAlarm: 2, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING };
    const period = Duration.minutes(5);
    const emf = (metricName) => new cloudwatch.Metric({
      namespace: HAFS.metricsNamespace,
      metricName,
      dimensionsMap: { Service: HAFS.dir },
      statistic: 'Sum',
      period,
    });
    const alarms = [
      ['Errors', 'Lambda invocation errors (crash or timeout)', fn.metricErrors({ period, statistic: 'Sum' }), 3],
      ['Throttles', 'Lambda throttled', fn.metricThrottles({ period, statistic: 'Sum' }), 1],
      ['SlowP95', `p95 duration above 80% of the ${HAFS.timeoutSeconds}s timeout`,
        fn.metricDuration({ period, statistic: 'p95' }), HAFS.timeoutSeconds * 1000 * 0.8],
      // Handled failures answer 500/502, which aren't Lambda errors.
      ['ServerErrors', 'internal errors (500) answered by the handler', emf('hafs_server_errors'), 5],
      ['UpstreamErrors', 'NOAA HAFS reads failing (502)', emf('hafs_upstream_errors'), 10],
    ];
    for (const [name, description, metric, threshold] of alarms) {
      new cloudwatch.Alarm(this, name, { alarmDescription: `hafs: ${description}`, metric, threshold, ...common })
        .addAlarmAction(action);
    }
  }
}
