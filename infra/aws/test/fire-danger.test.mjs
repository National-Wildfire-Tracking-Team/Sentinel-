/**
 * SentinelFireDanger (us-east-1) and its /fire-danger/* route on the
 * data-services distribution. Offline: no bundling, no AWS credentials.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { FireDangerStack, FIRE_DANGER, fireDangerBucketName } from '../lib/fire-danger-stack.mjs';

const account = '123456789012';
const context = { 'aws:cdk:bundling-stacks': [] };
const env = { account, region: 'us-east-1' };

function synth({ distributionId, fireDanger = true } = {}) {
  const app = new App({ context });
  const stack = new FireDangerStack(app, 'FireDanger', { env, alarmEmail: 'ops@example.org', distributionId });
  const data = new DataServicesStack(app, 'Data', {
    env,
    allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
    nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
    monthlyBudgetUsd: 50,
    fireDanger,
  });
  return { fd: Template.fromStack(stack), data: Template.fromStack(data) };
}

const { fd, data } = synth();

test('builder: Python 3.13 arm64, every 3 hours, timeout well under the interval', () => {
  fd.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'sentinel-fire-danger-builder',
    Runtime: 'python3.13',
    Architectures: ['arm64'],
    Handler: 'lambda_handler.handler',
    MemorySize: FIRE_DANGER.builderMemoryMb,
    Timeout: FIRE_DANGER.builderTimeoutSeconds,
    Environment: { Variables: Match.objectLike({ FRAMES_BUCKET: { Ref: Match.stringLikeRegexp('OutputBucket') } }) },
  });
  assert.ok(FIRE_DANGER.builderTimeoutSeconds * 10 < FIRE_DANGER.builderScheduleHours * 3600);
  fd.hasResourceProperties('AWS::Events::Rule', { ScheduleExpression: 'rate(3 hours)' });
});

test('bucket: private, TLS-only, run directories expire', () => {
  fd.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: fireDangerBucketName(account),
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: FIRE_DANGER.retentionDays, Prefix: 'fire-danger/v1/runs/', Status: 'Enabled' })] },
  });
});

test('builder role: own logs and the fire-danger prefix only', () => {
  const policies = JSON.stringify(fd.findResources('AWS::IAM::Policy'));
  assert.doesNotMatch(policies, /"s3:\*"|"\*"/);
  assert.match(policies, /s3:PutObject/);
  assert.match(policies, /fire-danger\/\*/);
});

test('only CloudFront reads outputs; scoped to one distribution when its id is known', () => {
  const [policy] = Object.values(synth({ distributionId: 'E2EXAMPLE123' }).fd.findResources('AWS::S3::BucketPolicy'));
  const doc = JSON.stringify(policy.Properties.PolicyDocument);
  assert.match(doc, /cloudfront\.amazonaws\.com/);
  assert.match(doc, /distribution\/E2EXAMPLE123"/);
});

test('alarms: builder errors, FEMS errors and stale observations', () => {
  const names = Object.values(fd.findResources('AWS::CloudWatch::Alarm')).map((a) => a.Properties.AlarmDescription);
  assert.ok(names.some((n) => /builder failing/.test(n)));
  assert.ok(names.some((n) => /FEMS failing/.test(n)));
  assert.ok(names.some((n) => /more than 2 days old/.test(n)));
});

test('/fire-danger/* is served from the bucket through OAC with CORS and compression', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const behavior = dist.Properties.DistributionConfig.CacheBehaviors.find((b) => b.PathPattern === '/fire-danger/*');
  assert.ok(behavior, 'no /fire-danger/* behavior');
  assert.equal(behavior.Compress, true);
  assert.equal(behavior.FunctionAssociations[0].EventType, 'viewer-response');
  data.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ Name: 'sentinel-fire-danger', OriginAccessControlOriginType: 's3' }),
  });
  data.hasOutput('FireDangerBaseUrl', {});
});

test('opt-in: without fireDanger the distribution has no /fire-danger/* route', () => {
  const [dist] = Object.values(synth({ fireDanger: false }).data.findResources('AWS::CloudFront::Distribution'));
  assert.ok(!(dist.Properties.DistributionConfig.CacheBehaviors || []).some((b) => b.PathPattern === '/fire-danger/*'));
});
