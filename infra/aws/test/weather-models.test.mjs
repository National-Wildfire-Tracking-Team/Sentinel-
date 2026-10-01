/**
 * SentinelWeatherModels (us-west-2) and its /weather-models/* route on the
 * data-services distribution. Offline: bundling is skipped, so no uv,
 * Docker or AWS credentials are needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { GithubDeployStack } from '../lib/github-deploy-stack.mjs';
import { WeatherModelsStack, WEATHER_MODELS } from '../lib/weather-models-stack.mjs';

const account = '123456789012';
const context = { 'aws:cdk:bundling-stacks': [], '@aws-cdk/core:defaultCrossStackReferences': 'strong' };

function synth({ distributionId } = {}) {
  const app = new App({ context });
  const wm = new WeatherModelsStack(app, 'WM', {
    env: { account, region: 'us-west-2' },
    crossRegionReferences: true,
    alarmEmail: 'ops@example.org',
    distributionId,
  });
  const data = new DataServicesStack(app, 'Data', {
    env: { account, region: 'us-east-1' },
    crossRegionReferences: true,
    allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
    nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
    monthlyBudgetUsd: 50,
    weatherModelsFunctionUrl: wm.functionUrl.url,
  });
  return { wm: Template.fromStack(wm), data: Template.fromStack(data) };
}

const { wm, data } = synth();

test('runs in us-west-2, next to the HRRR/GFS buckets', () => {
  assert.equal(WEATHER_MODELS.region, 'us-west-2');
});

test('Python 3.13 arm64 behind the Web Adapter, prefix stripped', () => {
  wm.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'sentinel-weather-models',
    Runtime: 'python3.13',
    Architectures: ['arm64'],
    Handler: 'run.sh',
    Timeout: 30,
    MemorySize: 1769,
    Layers: [Match.stringLikeRegexp('LambdaAdapterLayerArm64:\\d+')],
    Environment: {
      Variables: Match.objectLike({
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_REMOVE_BASE_PATH: '/weather-models',
        AWS_LWA_READINESS_CHECK_PATH: '/health',
      }),
    },
  });
});

test('Function URL is IAM-only; only CloudFront in this account may invoke it', () => {
  wm.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM', InvokeMode: 'BUFFERED' });
  const perms = Object.values(wm.findResources('AWS::Lambda::Permission')).map((p) => p.Properties)
    .filter((p) => p.Principal === 'cloudfront.amazonaws.com');
  assert.deepEqual(perms.map((p) => p.Action).sort(), ['lambda:InvokeFunction', 'lambda:InvokeFunctionUrl']);
  for (const p of perms) {
    assert.equal(p.Principal, 'cloudfront.amazonaws.com');
    assert.equal(p.SourceAccount, account);
    assert.match(JSON.stringify(p.SourceArn), /:cloudfront::123456789012:distribution\/\*/);
  }
});

test('with distributionId, invoke and field reads are scoped to that one distribution', () => {
  const scoped = synth({ distributionId: 'E2EXAMPLE123' }).wm;
  const [policy] = Object.values(scoped.findResources('AWS::S3::BucketPolicy'));
  assert.match(JSON.stringify(policy.Properties.PolicyDocument), /distribution\/E2EXAMPLE123"/);
  for (const p of Object.values(scoped.findResources('AWS::Lambda::Permission')).filter((r) => r.Properties.Principal === 'cloudfront.amazonaws.com')) {
    assert.match(JSON.stringify(p.Properties.SourceArn), /distribution\/E2EXAMPLE123"/);
  }
});

test('runtime role: own log group only, and no S3 permissions (the buckets are read anonymously)', () => {
  const policies = Object.values(wm.findResources('AWS::IAM::Policy'));
  const api = policies.find((p) => !JSON.stringify(p).includes('s3:'));
  assert.ok(api, 'the forecast API role has no S3 statements');
  for (const stmt of api.Properties.PolicyDocument.Statement) {
    assert.deepEqual([stmt.Action].flat().sort(), ['logs:CreateLogStream', 'logs:PutLogEvents']);
  }
  const apiRole = Object.values(wm.findResources('AWS::Lambda::Function'))
    .find((f) => f.Properties.FunctionName === 'sentinel-weather-models').Properties.Role;
  assert.ok(!JSON.stringify(api.Properties.Roles).includes('FieldBuilder'), 'API role is not the builder role');
  assert.ok(apiRole);
  for (const r of Object.values(wm.findResources('AWS::IAM::Role'))) {
    assert.ok(!JSON.stringify(r.Properties.ManagedPolicyArns ?? []).includes('AdministratorAccess'));
  }
});

test('map fields: private bucket, 3-day expiry, CloudFront-only reads', () => {
  wm.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'sentinel-weather-model-fields-123456789012',
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 3, Status: 'Enabled' })] },
  });
  const [policy] = Object.values(wm.findResources('AWS::S3::BucketPolicy'));
  const statements = policy.Properties.PolicyDocument.Statement;
  const read = statements.find((st) => st.Sid === 'CloudFrontReadsModelFields');
  assert.deepEqual(read.Principal, { Service: 'cloudfront.amazonaws.com' });
  assert.equal(read.Action, 's3:GetObject');
  assert.match(JSON.stringify(read.Resource), /\/weather-models\/fields\/\*/);
  assert.ok(statements.some((st) => st.Effect === 'Deny' && JSON.stringify(st.Condition).includes('SecureTransport')), 'TLS only');
  assert.ok(!statements.some((st) => st.Effect === 'Allow' && JSON.stringify(st.Principal).includes('"*"')), 'never public');
});

test('field builder: every 15 minutes, writes only its prefix, never deletes', () => {
  wm.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'sentinel-weather-models-field-builder',
    Handler: 'fields.lambda_handler.handler',
    Runtime: 'python3.13',
    Architectures: ['arm64'],
    MemorySize: 4096,
    Timeout: 900,
  });
  wm.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(15 minutes)' });
  const policies = Object.values(wm.findResources('AWS::IAM::Policy'));
  const builder = policies.find((p) => JSON.stringify(p).includes('s3:PutObject'));
  const actions = builder.Properties.PolicyDocument.Statement.flatMap((st) => [st.Action].flat());
  assert.deepEqual(actions.sort(), ['logs:CreateLogStream', 'logs:PutLogEvents', 's3:GetObject', 's3:ListBucket', 's3:PutObject']);
  for (const st of builder.Properties.PolicyDocument.Statement) {
    if ([st.Action].flat().some((a) => a.startsWith('s3:'))) {
      assert.match(JSON.stringify(st), /weather-models\/fields\//, 'scoped to the fields prefix');
    }
  }
});

test('the distribution serves /weather-models/fields/* from S3 before the API path', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const cfg = dist.Properties.DistributionConfig;
  const patterns = cfg.CacheBehaviors.map((b) => b.PathPattern);
  assert.ok(patterns.indexOf('/weather-models/fields/*') < patterns.indexOf('/weather-models/*'), 'more specific path first');
  const fields = cfg.CacheBehaviors.find((b) => b.PathPattern === '/weather-models/fields/*');
  const origin = cfg.Origins.find((o) => o.Id === fields.TargetOriginId);
  assert.equal(origin.DomainName, 'sentinel-weather-model-fields-123456789012.s3.us-west-2.amazonaws.com');
  assert.ok(origin.OriginAccessControlId, 'OAC-signed');
  assert.ok(fields.ResponseHeadersPolicyId, 'CORS headers for Mapbox image loads');
  assert.equal(Object.keys(data.findResources('AWS::S3::BucketPolicy')).length, 0, 'no cross-region bucket policy');
});

test('no VPC, 14-day logs, alarms that notify', () => {
  for (const fn of Object.values(wm.findResources('AWS::Lambda::Function'))) assert.equal(fn.Properties.VpcConfig, undefined);
  wm.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: '/sentinel/weather-models', RetentionInDays: 14 });
  const alarms = Object.values(wm.findResources('AWS::CloudWatch::Alarm'));
  assert.equal(alarms.length, 7); // 5 API + 2 field builder
  for (const a of alarms) assert.equal(a.Properties.AlarmActions.length, 1);
  const emf = alarms.filter((a) => a.Properties.Namespace === 'Sentinel/WeatherModels').map((a) => a.Properties.MetricName);
  assert.deepEqual(emf.sort(), ['dataset_errors', 'stale_data_events']);
  wm.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.org' });
});

test('the existing distribution routes /weather-models/* through OAC with errors uncached', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const cfg = dist.Properties.DistributionConfig;
  const behavior = cfg.CacheBehaviors.find((b) => b.PathPattern === '/weather-models/*');
  assert.ok(behavior, 'behavior exists');
  assert.equal(behavior.ViewerProtocolPolicy, 'redirect-to-https');
  const origin = cfg.Origins.find((o) => o.Id === behavior.TargetOriginId);
  assert.ok(origin.OriginAccessControlId, 'signed by OAC');
  assert.equal(origin.CustomOriginConfig.OriginProtocolPolicy, 'https-only');
  assert.equal(origin.CustomOriginConfig.OriginReadTimeout, 30);
  data.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ Name: 'sentinel-weather-models', OriginAccessControlOriginType: 'lambda', SigningBehavior: 'always', SigningProtocol: 'sigv4' }),
  });
  assert.equal(cfg.CustomErrorResponses.find((r) => r.ErrorCode === 503)?.ErrorCachingMinTTL, 0);
  assert.equal(Object.values(data.findResources('AWS::CloudFront::Distribution')).length, 1, 'no second distribution');
  data.hasOutput('WeatherModelsBaseUrl', { Description: 'Value for VITE_WEATHER_MODEL_SERVICE_URL' });
});

test('deploy role can bootstrap-deploy to us-west-2 as well', () => {
  const deploy = Template.fromStack(new GithubDeployStack(new App(), 'Deploy', {
    env: { account, region: 'us-east-1' },
    githubRepo: 'National-Wildfire-Tracking-Team/Sentinel-',
    regions: ['us-east-1', 'us-west-2'],
  }));
  const [policy] = Object.values(deploy.findResources('AWS::IAM::Policy'));
  const resources = JSON.stringify(policy.Properties.PolicyDocument.Statement[0].Resource);
  assert.match(resources, /cdk-hnb659fds-\*-123456789012-us-east-1/);
  assert.match(resources, /cdk-hnb659fds-\*-123456789012-us-west-2/);
  assert.ok(!/role\/\*"/.test(resources), 'still only the CDK bootstrap roles');
});
