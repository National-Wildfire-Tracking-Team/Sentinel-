/**
 * SentinelMrms (us-east-1) and its /mrms/* route on the data-services
 * distribution. Offline: bundling is skipped, so no uv, Docker or AWS
 * credentials are needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { MrmsStack, MRMS, mrmsBucketName } from '../lib/mrms-stack.mjs';

const account = '123456789012';
const context = { 'aws:cdk:bundling-stacks': [] };
const env = { account, region: 'us-east-1' };

function synth({ distributionId, mrms = true } = {}) {
  const app = new App({ context });
  const stack = new MrmsStack(app, 'Mrms', { env, alarmEmail: 'ops@example.org', distributionId });
  const data = new DataServicesStack(app, 'Data', {
    env,
    allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
    nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
    monthlyBudgetUsd: 50,
    mrms,
  });
  return { mrms: Template.fromStack(stack), data: Template.fromStack(data) };
}

const { mrms, data } = synth();

test('builder: Python 3.13 arm64, every 2 minutes, under its schedule interval', () => {
  mrms.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'sentinel-mrms-builder',
    Runtime: 'python3.13',
    Architectures: ['arm64'],
    Handler: 'lambda_handler.handler',
    MemorySize: MRMS.builderMemoryMb,
    Timeout: MRMS.builderTimeoutSeconds,
    Environment: { Variables: Match.objectLike({ FRAMES_BUCKET: { Ref: Match.stringLikeRegexp('FramesBucket') } }) },
  });
  assert.ok(MRMS.builderTimeoutSeconds < MRMS.builderScheduleMinutes * 60);
  mrms.hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(2 minutes)',
    Targets: [Match.objectLike({ RetryPolicy: { MaximumRetryAttempts: 0, MaximumEventAgeInSeconds: 120 } })],
  });
});

test('frames bucket: private, TLS-only, expires frames after a day', () => {
  mrms.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: mrmsBucketName(account),
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 1, Status: 'Enabled' })] },
  });
});

test('builder role: own logs and the frames prefix only; nothing on the NOAA bucket', () => {
  const policies = JSON.stringify(mrms.findResources('AWS::IAM::Policy'));
  assert.doesNotMatch(policies, /noaa-mrms-pds/);
  assert.doesNotMatch(policies, /"s3:\*"|"\*"/);
  assert.match(policies, /s3:PutObject/);
});

test('only CloudFront reads frames; scoped to one distribution when its id is known', () => {
  const [policy] = Object.values(synth({ distributionId: 'E2EXAMPLE123' }).mrms.findResources('AWS::S3::BucketPolicy'));
  const doc = JSON.stringify(policy.Properties.PolicyDocument);
  assert.match(doc, /cloudfront\.amazonaws\.com/);
  assert.match(doc, /distribution\/E2EXAMPLE123"/);
  assert.match(doc, /\/mrms\/\*/);
});

test('/mrms/* is served from the frames bucket through OAC with CORS', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const behavior = dist.Properties.DistributionConfig.CacheBehaviors.find((b) => b.PathPattern === '/mrms/*');
  assert.ok(behavior, 'no /mrms/* behavior');
  assert.equal(behavior.ViewerProtocolPolicy, 'redirect-to-https');
  assert.equal(behavior.FunctionAssociations[0].EventType, 'viewer-response');
  data.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ Name: 'sentinel-mrms-frames', OriginAccessControlOriginType: 's3' }),
  });
  data.hasOutput('MrmsBaseUrl', {});
});

test('opt-in: without mrms the distribution has no /mrms/* route', () => {
  const [dist] = Object.values(synth({ mrms: false }).data.findResources('AWS::CloudFront::Distribution'));
  assert.ok(!(dist.Properties.DistributionConfig.CacheBehaviors || []).some((b) => b.PathPattern === '/mrms/*'));
});
