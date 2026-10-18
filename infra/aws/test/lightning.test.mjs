/**
 * SentinelLightning (us-east-1) and its /lightning/* route on the
 * data-services distribution. Offline: bundling is skipped, so no uv, Docker
 * or AWS credentials are needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { LightningStack, LIGHTNING, lightningBucketName } from '../lib/lightning-stack.mjs';

const account = '123456789012';
const context = { 'aws:cdk:bundling-stacks': [] };
const env = { account, region: 'us-east-1' };

function synth({ distributionId, lightning = true } = {}) {
  const app = new App({ context });
  const stack = new LightningStack(app, 'Lightning', { env, alarmEmail: 'ops@example.org', distributionId });
  const data = new DataServicesStack(app, 'Data', {
    env,
    allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
    nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
    monthlyBudgetUsd: 50,
    lightning,
  });
  return { lightning: Template.fromStack(stack), data: Template.fromStack(data) };
}

const { lightning, data } = synth();

test('builder: Python 3.13 arm64, every minute, under its schedule interval', () => {
  lightning.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'sentinel-lightning-builder',
    Runtime: 'python3.13',
    Architectures: ['arm64'],
    Handler: 'lambda_handler.handler',
    MemorySize: LIGHTNING.builderMemoryMb,
    Timeout: LIGHTNING.builderTimeoutSeconds,
    Environment: { Variables: Match.objectLike({ OUTPUT_BUCKET: { Ref: Match.stringLikeRegexp('OutputBucket') } }) },
  });
  assert.ok(LIGHTNING.builderTimeoutSeconds < LIGHTNING.builderScheduleMinutes * 60);
  lightning.hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 minute)',
    Targets: [Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 0, MaximumEventAgeInSeconds: 60 } })],
  });
});

test('bucket: private, TLS-only, expires objects after a day', () => {
  lightning.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: lightningBucketName(account),
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 1, Status: 'Enabled' })] },
  });
});

test('builder role: own logs and the lightning prefix only; nothing on the NOAA buckets', () => {
  const policies = JSON.stringify(lightning.findResources('AWS::IAM::Policy'));
  assert.doesNotMatch(policies, /noaa-goes/);
  assert.doesNotMatch(policies, /"s3:\*"|"\*"/);
  assert.match(policies, /s3:PutObject/);
});

test('only CloudFront reads it; scoped to one distribution when its id is known', () => {
  const [policy] = Object.values(synth({ distributionId: 'E2EXAMPLE123' }).lightning.findResources('AWS::S3::BucketPolicy'));
  const doc = JSON.stringify(policy.Properties.PolicyDocument);
  assert.match(doc, /cloudfront\.amazonaws\.com/);
  assert.match(doc, /distribution\/E2EXAMPLE123"/);
  assert.match(doc, /\/lightning\/\*/);
});

test('/lightning/* is served from the bucket through OAC with CORS', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const behavior = dist.Properties.DistributionConfig.CacheBehaviors.find((b) => b.PathPattern === '/lightning/*');
  assert.ok(behavior, 'no /lightning/* behavior');
  assert.equal(behavior.ViewerProtocolPolicy, 'redirect-to-https');
  assert.equal(behavior.FunctionAssociations[0].EventType, 'viewer-response');
  data.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ Name: 'sentinel-lightning', OriginAccessControlOriginType: 's3' }),
  });
  data.hasOutput('LightningBaseUrl', {});
});

test('opt-in: without lightning the distribution has no /lightning/* route', () => {
  const [dist] = Object.values(synth({ lightning: false }).data.findResources('AWS::CloudFront::Distribution'));
  assert.ok(!(dist.Properties.DistributionConfig.CacheBehaviors || []).some((b) => b.PathPattern === '/lightning/*'));
});
