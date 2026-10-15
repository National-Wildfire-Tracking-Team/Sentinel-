/**
 * SentinelHafs (us-east-1) and its /hafs/* route on the data-services
 * distribution. Offline: bundling is skipped, so no uv, Docker or AWS
 * credentials are needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { HafsStack, HAFS } from '../lib/hafs-stack.mjs';

const account = '123456789012';
const context = { 'aws:cdk:bundling-stacks': [] };
const env = { account, region: 'us-east-1' };

function synth({ distributionId, hafs = true } = {}) {
  const app = new App({ context });
  const stack = hafs ? new HafsStack(app, 'Hafs', { env, alarmEmail: 'ops@example.org', distributionId }) : null;
  const data = new DataServicesStack(app, 'Data', {
    env,
    allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
    nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
    monthlyBudgetUsd: 50,
    hafsFunctionUrl: stack?.functionUrl.url,
  });
  return { hafs: stack && Template.fromStack(stack), data: Template.fromStack(data) };
}

const { hafs, data } = synth();

test('function: Python 3.13 arm64, plain handler (no Web Adapter), IAM-only buffered URL', () => {
  hafs.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'sentinel-hafs',
    Runtime: 'python3.13',
    Architectures: ['arm64'],
    Handler: 'lambda_handler.handler',
    MemorySize: HAFS.memoryMb,
    Timeout: HAFS.timeoutSeconds,
    Layers: Match.absent(),
    Environment: { Variables: Match.objectLike({ HAFS_RATE_LIMIT_PER_MINUTE: '600' }) },
  });
  hafs.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM', InvokeMode: 'BUFFERED' });
});

test('public data: no CORS allowlist, so the edge cache never keys on Origin', () => {
  const [fn] = Object.values(hafs.findResources('AWS::Lambda::Function'));
  assert.ok(!('ALLOWED_ORIGINS' in fn.Properties.Environment.Variables));
});

test('role: own logs only; nothing on S3', () => {
  const policies = JSON.stringify(hafs.findResources('AWS::IAM::Policy'));
  assert.doesNotMatch(policies, /s3:|noaa-nws-hafs-pds|"\*"/);
  assert.match(policies, /logs:PutLogEvents/);
});

test('only CloudFront may invoke; scoped to one distribution when its id is known', () => {
  const perms = Object.values(synth({ distributionId: 'E2EXAMPLE123' }).hafs.findResources('AWS::Lambda::Permission'));
  assert.deepEqual(perms.map((p) => p.Properties.Action).sort(), ['lambda:InvokeFunction', 'lambda:InvokeFunctionUrl']);
  for (const p of perms) {
    assert.equal(p.Properties.Principal, 'cloudfront.amazonaws.com');
    assert.match(JSON.stringify(p.Properties.SourceArn), /distribution\/E2EXAMPLE123/);
  }
});

test('alarms cover crashes, throttles, slowness and handled 500/502s', () => {
  const names = Object.values(hafs.findResources('AWS::CloudWatch::Alarm')).map((a) => a.Properties.AlarmDescription);
  for (const want of ['invocation errors', 'throttled', 'p95', '(500)', '(502)']) {
    assert.ok(names.some((n) => n.includes(want)), `no alarm for ${want}`);
  }
});

test('/hafs/* goes to the function through OAC and Origin Shield, cached by path for up to a year', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const cfg = dist.Properties.DistributionConfig;
  const behavior = cfg.CacheBehaviors.find((b) => b.PathPattern === '/hafs/*');
  assert.ok(behavior, 'no /hafs/* behavior');
  assert.equal(behavior.ViewerProtocolPolicy, 'redirect-to-https');
  const origin = cfg.Origins.find((o) => o.Id === behavior.TargetOriginId);
  assert.deepEqual(origin.OriginShield, { Enabled: true, OriginShieldRegion: 'us-east-1' });
  assert.ok(origin.OriginAccessControlId);
  data.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ Name: 'sentinel-hafs', OriginAccessControlOriginType: 'lambda' }),
  });
  data.hasResourceProperties('AWS::CloudFront::CachePolicy', {
    CachePolicyConfig: Match.objectLike({
      MaxTTL: 365 * 24 * 3600,
      ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
        HeadersConfig: { HeaderBehavior: 'none' },
        QueryStringsConfig: { QueryStringBehavior: 'none' },
      }),
    }),
  });
  data.hasOutput('HafsBaseUrl', {});
});

test('opt-in: without HAFS the distribution has no /hafs/* route', () => {
  const [dist] = Object.values(synth({ hafs: false }).data.findResources('AWS::CloudFront::Distribution'));
  assert.ok(!(dist.Properties.DistributionConfig.CacheBehaviors || []).some((b) => b.PathPattern === '/hafs/*'));
});
