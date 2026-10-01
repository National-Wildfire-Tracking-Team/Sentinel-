/**
 * data-services-stack.mjs
 * Sentinel's public-data HTTP services on AWS: the five cloud/* Node servers
 * that ran on Cloud Run, now on Lambda behind one CloudFront distribution.
 *
 *   browser ──HTTPS──▶ CloudFront ──OAC (SigV4)──▶ Lambda Function URL ──▶ Lambda Web Adapter ──▶ node index.mjs
 *
 * Why this shape (see README.md for the long version):
 * - The services are unchanged. Each is a plain `http.createServer` app; the
 *   Lambda Web Adapter layer runs it inside Lambda and translates the
 *   invoke into an HTTP request on :8080. The same code keeps running on
 *   Cloud Run during the parallel phase, so a comparison is apples to apples.
 * - Lambda, not ECS: all five are short request/response services that
 *   scale to zero on Cloud Run today. Fargate would mean paying for
 *   always-on tasks plus a load balancer (~$16/mo each) for traffic that
 *   is idle most of the day.
 * - Function URLs + CloudFront, not API Gateway: fire-perimeters-merge
 *   returns ~16 MB gzipped (80 MB raw). API Gateway caps responses at
 *   10 MB and integrations at 29 s. Function URLs in RESPONSE_STREAM mode
 *   allow up to 200 MB. CloudFront adds the shared edge cache the services'
 *   Cache-Control headers were always written for, and OAC means the
 *   Function URLs can't be called directly (AuthType AWS_IAM).
 * - No VPC: nothing here talks to a private resource, and every upstream is
 *   a public internet API. A VPC would only add a NAT Gateway (~$33/mo +
 *   $0.045/GB) to reach those same upstreams.
 */

import { Annotations, Duration, Fn, RemovalPolicy, Stack, Tags, CfnOutput } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SERVICES, LWA_LAYER_ACCOUNT, LWA_LAYER_NAME, LWA_LAYER_VERSION } from './services.mjs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { WEATHER_MODELS, fieldsBucketName } from './weather-models-stack.mjs';

const CLOUD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../cloud');
const LOG_RETENTION = logs.RetentionDays.TWO_WEEKS;

/**
 * A Lambda Function URL in another region, signed by CloudFront OAC.
 * origins.FunctionUrlOrigin can't be used across regions: it adds the
 * invoke permission to the distribution's stack, and CloudFormation can't
 * create a permission on a function in a different region. Here the
 * permission lives with the function (WeatherModelsStack) and this origin
 * only wires the domain and the OAC.
 */
class CrossRegionFunctionUrlOrigin extends origins.HttpOrigin {
  constructor(functionUrl, originAccessControl, props) {
    super(Fn.select(2, Fn.split('/', functionUrl)), {
      ...props,
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    });
    this.originAccessControl = originAccessControl;
  }

  bind(scope, options) {
    const config = super.bind(scope, options);
    return {
      ...config,
      originProperty: { ...config.originProperty, originAccessControlId: this.originAccessControl.originAccessControlId },
    };
  }
}

export class DataServicesStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & {
   *   allowedOrigins: string, nwsUserAgent: string, alarmEmail?: string, monthlyBudgetUsd?: number,
   *   weatherModelsFunctionUrl?: string,
   * }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { allowedOrigins, nwsUserAgent, alarmEmail, monthlyBudgetUsd, weatherModelsFunctionUrl } = props;

    Tags.of(this).add('project', 'sentinel');
    Tags.of(this).add('component', 'data-services');

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Sentinel data-services alarms' });
    if (alarmEmail) alarmTopic.addSubscription(new subs.EmailSubscription(alarmEmail));
    const alarmAction = new cwActions.SnsAction(alarmTopic);

    const adapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'WebAdapterLayer',
      `arn:aws:lambda:${this.region}:${LWA_LAYER_ACCOUNT}:layer:${LWA_LAYER_NAME}:${LWA_LAYER_VERSION}`,
    );

    // Shared edge caching rules. Origin is part of the key because
    // nws-alerts and fema-nfhl-proxy echo it back in
    // Access-Control-Allow-Origin when ALLOWED_ORIGINS is set. TTLs come
    // from each response's own Cache-Control (defaultTtl 0 means "no
    // header, no caching"), so every freshness bound in the service READMEs
    // still holds — including nws-alerts' 45 s life-safety window.
    const cachePolicy = new cloudfront.CachePolicy(this, 'OriginDrivenCachePolicy', {
      comment: 'Sentinel data services: honour origin Cache-Control, key on query + Origin',
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(1),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Origin'),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Anything outside a known service prefix is answered at the edge and
    // never reaches a function.
    const notFound = new cloudfront.Function(this, 'NotFoundFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Default behavior: 404 for paths outside every service prefix',
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { return { statusCode: 404, statusDescription: 'Not Found', " +
        "headers: { 'content-type': { value: 'application/json' }, 'access-control-allow-origin': { value: '*' } }, " +
        "body: { encoding: 'text', data: '{\"error\":\"Not found\"}' } }; }",
      ),
    });

    const behaviors = {};
    this.functions = {};
    let firstOrigin = null;

    for (const svc of SERVICES) {
      const fn = this.#serviceFunction(svc, { adapterLayer, allowedOrigins, nwsUserAgent });
      this.functions[svc.dir] = fn;

      const url = fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.AWS_IAM,
        invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      });
      const origin = origins.FunctionUrlOrigin.withOriginAccessControl(url, {
        // CloudFront's ceiling without a quota increase; see services.mjs.
        readTimeout: Duration.seconds(Math.min(60, svc.timeoutSeconds)),
      });
      firstOrigin ??= origin;

      behaviors[`${svc.pathPrefix}/*`] = {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy,
        // Everything the viewer sent except Host, which would break the
        // OAC SigV4 signature for the Function URL.
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        compress: true,
      };

      this.#alarms(svc, fn, alarmAction);
    }

    // Sentinel Weather Models (WeatherModelsStack, us-west-2). Same cache
    // policy: its responses carry their own s-maxage, and errors no-store.
    if (weatherModelsFunctionUrl) {
      // Map fields first: CloudFront matches behaviors in order, and
      // /weather-models/fields/* is more specific than /weather-models/*.
      // The bucket (in us-west-2) grants this distribution read access in
      // its own policy; CDK can't edit an imported bucket's policy from here.
      const fieldsBucket = s3.Bucket.fromBucketAttributes(this, 'WeatherModelFieldsBucket', {
        bucketName: fieldsBucketName(this.account),
        region: WEATHER_MODELS.region,
      });
      behaviors[`${WEATHER_MODELS.fieldsPathPrefix}/*`] = {
        origin: origins.S3BucketOrigin.withOriginAccessControl(fieldsBucket, {
          originAccessControl: new cloudfront.S3OriginAccessControl(this, 'WeatherModelFieldsOac', {
            originAccessControlName: 'sentinel-weather-model-fields',
          }),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        // Frames are immutable (max-age 1 y); the manifest says max-age 60.
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Mapbox and the app load these with fetch(), so every response needs
        // Access-Control-Allow-Origin. Not the managed SimpleCORS policy: it
        // omits the header when the request carries `Priority: u=1, i`, which
        // current Chrome and Safari send on fetch(). A viewer-response
        // function sets it unconditionally (the data is public).
        functionAssociations: [{
          function: new cloudfront.Function(this, 'WeatherModelFieldsCors', {
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            comment: 'Weather model fields: always Access-Control-Allow-Origin: * (public data)',
            code: cloudfront.FunctionCode.fromInline(
              "function handler(event) { var r = event.response; r.headers['access-control-allow-origin'] = { value: '*' }; return r; }",
            ),
          }),
          eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
        }],
        compress: true,
      };

      // Expected: the read grant lives in WeatherModelsStack's bucket policy.
      Annotations.of(this).acknowledgeWarning('@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac');

      const oac = new cloudfront.FunctionUrlOriginAccessControl(this, 'WeatherModelsOac', {
        originAccessControlName: 'sentinel-weather-models',
      });
      behaviors[`${WEATHER_MODELS.pathPrefix}/*`] = {
        origin: new CrossRegionFunctionUrlOrigin(weatherModelsFunctionUrl, oac, {
          readTimeout: Duration.seconds(WEATHER_MODELS.timeoutSeconds),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        compress: true,
      };
    }

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Sentinel data services (replaces the *.run.app endpoints)',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US/Canada/Europe edges — Sentinel's audience is US
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: firstOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: [{ function: notFound, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: behaviors,
      // The services never want an error cached (each README says so, and
      // the 5xx bodies carry no Cache-Control). CloudFront's default would
      // hold them for 10 s.
      errorResponses: [400, 404, 500, 502, 503, 504].map((httpStatus) => ({ httpStatus, ttl: Duration.seconds(0) })),
    });
    this.distribution = distribution;

    // Function URLs created since late 2025 need lambda:InvokeFunction as
    // well as lambda:InvokeFunctionUrl for CloudFront OAC. CDK adds only the
    // latter, so grant the former here, scoped to this distribution.
    for (const svc of SERVICES) {
      new lambda.CfnPermission(this, `${svc.id}InvokeFromCloudFront`, {
        action: 'lambda:InvokeFunction',
        principal: 'cloudfront.amazonaws.com',
        functionName: this.functions[svc.dir].functionArn,
        sourceArn: `arn:${this.partition}:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
      });
    }

    new cloudwatch.Alarm(this, 'CloudFront5xxRate', {
      alarmDescription: 'More than 5% of Sentinel data-service responses are 5xx (all services, at the edge).',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '5xxErrorRate',
        dimensionsMap: { DistributionId: distribution.distributionId, Region: 'Global' },
        statistic: 'Average',
        period: Duration.minutes(5),
        region: 'us-east-1', // CloudFront metrics only exist in us-east-1
      }),
      threshold: 5,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    this.#dashboard(distribution, Boolean(weatherModelsFunctionUrl));

    if (monthlyBudgetUsd > 0) {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: 'sentinel-monthly',
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: monthlyBudgetUsd, unit: 'USD' },
        },
        notificationsWithSubscribers: alarmEmail
          ? [
              { notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80, thresholdType: 'PERCENTAGE' },
                subscribers: [{ subscriptionType: 'EMAIL', address: alarmEmail }] },
              { notification: { notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE' },
                subscribers: [{ subscriptionType: 'EMAIL', address: alarmEmail }] },
            ]
          : [],
      });
    }

    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    for (const svc of SERVICES) {
      new CfnOutput(this, `${svc.id}BaseUrl`, {
        description: `Value for ${svc.frontendEnvVar}`,
        value: `https://${distribution.distributionDomainName}${svc.pathPrefix}`,
      });
    }
    if (weatherModelsFunctionUrl) {
      new CfnOutput(this, 'WeatherModelsBaseUrl', {
        description: `Value for ${WEATHER_MODELS.frontendEnvVar}`,
        value: `https://${distribution.distributionDomainName}${WEATHER_MODELS.pathPrefix}`,
      });
    }
    new CfnOutput(this, 'DistributionId', {
      description: 'Pass as sentinel:distributionId to scope the weather-models invoke permission to this distribution',
      value: distribution.distributionId,
    });
  }

  #serviceFunction(svc, { adapterLayer, allowedOrigins, nwsUserAgent }) {
    const logGroup = new logs.LogGroup(this, `${svc.id}Logs`, {
      logGroupName: `/sentinel/${svc.dir}`,
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // One role per function, allowed only to write its own log group. None
    // of these services reads AWS resources; their upstreams are all public.
    const role = new iam.Role(this, `${svc.id}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Runtime role for ${svc.dir} (logs only)`,
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:log-stream:*`],
    }));

    const serviceEnv = typeof svc.env === 'function' ? svc.env({ allowedOrigins, nwsUserAgent }) : svc.env;

    const fn = new lambda.Function(this, `${svc.id}Function`, {
      functionName: `sentinel-${svc.dir}`,
      description: `${svc.dir} (cloud/${svc.dir}, unchanged, via Lambda Web Adapter)`,
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64, // no native deps; Graviton is ~20% cheaper per GB-s
      handler: 'run.sh',
      code: lambda.Code.fromAsset(path.join(CLOUD_DIR, svc.dir), {
        exclude: ['Dockerfile', '.dockerignore', 'README.md', 'node_modules', '*.test.*'],
      }),
      layers: [adapterLayer],
      memorySize: svc.memoryMb,
      timeout: Duration.seconds(svc.timeoutSeconds),
      role,
      logGroup,
      environment: {
        ...serviceEnv,
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_INVOKE_MODE: 'response_stream',
        AWS_LWA_PORT: '8080',
        AWS_LWA_READINESS_CHECK_PATH: svc.healthPath,
        AWS_LWA_REMOVE_BASE_PATH: svc.pathPrefix,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });
    Tags.of(fn).add('service', svc.dir);
    return fn;
  }

  #alarms(svc, fn, alarmAction) {
    const common = { evaluationPeriods: 3, datapointsToAlarm: 2, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING };
    const period = Duration.minutes(5);

    // Crashes and timeouts. Upstream failures the service handles (it
    // answers 502) don't count here; the CloudFront 5xx alarm covers those.
    new cloudwatch.Alarm(this, `${svc.id}Errors`, {
      alarmDescription: `${svc.dir}: Lambda invocation errors (crash or timeout)`,
      metric: fn.metricErrors({ period, statistic: 'Sum' }),
      threshold: 3,
      ...common,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, `${svc.id}Throttles`, {
      alarmDescription: `${svc.dir}: Lambda throttled (account/regional concurrency exhausted)`,
      metric: fn.metricThrottles({ period, statistic: 'Sum' }),
      threshold: 1,
      ...common,
    }).addAlarmAction(alarmAction);

    new cloudwatch.Alarm(this, `${svc.id}SlowP95`, {
      alarmDescription: `${svc.dir}: p95 duration above 80% of its ${svc.timeoutSeconds}s timeout`,
      metric: fn.metricDuration({ period, statistic: 'p95' }),
      threshold: svc.timeoutSeconds * 1000 * 0.8,
      ...common,
    }).addAlarmAction(alarmAction);
  }

  #dashboard(distribution, weatherModels) {
    const dash = new cloudwatch.Dashboard(this, 'Dashboard', { dashboardName: 'sentinel-data-services' });
    const fns = Object.values(this.functions);
    dash.addWidgets(
      new cloudwatch.GraphWidget({ title: 'Invocations', left: fns.map((f) => f.metricInvocations({ period: Duration.minutes(5) })), width: 12 }),
      new cloudwatch.GraphWidget({ title: 'Errors', left: fns.map((f) => f.metricErrors({ period: Duration.minutes(5) })), width: 12 }),
      new cloudwatch.GraphWidget({ title: 'Duration p95 (ms)', left: fns.map((f) => f.metricDuration({ period: Duration.minutes(5), statistic: 'p95' })), width: 12 }),
      new cloudwatch.GraphWidget({
        title: 'CloudFront requests / 5xx rate',
        left: [new cloudwatch.Metric({ namespace: 'AWS/CloudFront', metricName: 'Requests', dimensionsMap: { DistributionId: distribution.distributionId, Region: 'Global' }, statistic: 'Sum', region: 'us-east-1' })],
        right: [new cloudwatch.Metric({ namespace: 'AWS/CloudFront', metricName: '5xxErrorRate', dimensionsMap: { DistributionId: distribution.distributionId, Region: 'Global' }, statistic: 'Average', region: 'us-east-1' })],
        width: 12,
      }),
    );
    if (!weatherModels) return;
    // Weather Models runs in us-west-2; dashboards can graph any region.
    const wm = (metricName, statistic = 'Sum') => new cloudwatch.Metric({
      namespace: WEATHER_MODELS.metricsNamespace,
      metricName,
      dimensionsMap: { Service: WEATHER_MODELS.dir },
      statistic,
      period: Duration.minutes(5),
      region: WEATHER_MODELS.region,
    });
    dash.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Weather Models: requests by model (uncached at the edge)',
        left: ['weather_requests', 'hrrr_requests', 'gfs_requests'].map((m) => wm(m)),
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Weather Models: point cache / dataset latency (ms, p95)',
        left: ['cache_hits', 'cache_misses'].map((m) => wm(m)),
        right: [wm('model_data_latency', 'p95')],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Weather Models: dataset errors / stale data',
        left: ['dataset_errors', 'stale_data_events'].map((m) => wm(m)),
        width: 8,
      }),
    );
  }
}
