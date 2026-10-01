/**
 * Synthesizes both stacks offline (no AWS credentials needed) and pins the
 * properties the migration depends on: the public contract each service
 * keeps, least-privilege IAM, and the cost guards. Run with `npm test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { GithubDeployStack } from '../lib/github-deploy-stack.mjs';
import { SERVICES } from '../lib/services.mjs';

const env = { account: '123456789012', region: 'us-east-1' };
const data = Template.fromStack(new DataServicesStack(new App(), 'Data', {
  env,
  allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
  nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
  alarmEmail: 'ops@example.org',
  monthlyBudgetUsd: 50,
}));
const deploy = Template.fromStack(new GithubDeployStack(new App(), 'Deploy', {
  env,
  githubRepo: 'National-Wildfire-Tracking-Team/Sentinel-',
}));

const byName = (name) => {
  const fns = data.findResources('AWS::Lambda::Function', { Properties: { FunctionName: name } });
  const [fn] = Object.values(fns);
  assert.ok(fn, `missing function ${name}`);
  return fn.Properties;
};

test('one Lambda per migrated service, and no radar', () => {
  data.resourceCountIs('AWS::Lambda::Function', SERVICES.length);
  const names = Object.values(data.findResources('AWS::Lambda::Function')).map((r) => r.Properties.FunctionName);
  assert.ok(!names.some((n) => /nexrad|radar/.test(n)), 'radar is being rebuilt, not migrated');
});

test('each service runs its unchanged server through the Web Adapter, prefix stripped', () => {
  for (const svc of SERVICES) {
    const fn = byName(`sentinel-${svc.dir}`);
    assert.equal(fn.Handler, 'run.sh');
    assert.equal(fn.Runtime, 'nodejs24.x');
    assert.deepEqual(fn.Architectures, ['arm64']);
    assert.equal(fn.Timeout, svc.timeoutSeconds);
    const vars = fn.Environment.Variables;
    assert.equal(vars.AWS_LAMBDA_EXEC_WRAPPER, '/opt/bootstrap');
    assert.equal(vars.AWS_LWA_INVOKE_MODE, 'response_stream');
    assert.equal(vars.AWS_LWA_REMOVE_BASE_PATH, svc.pathPrefix);
    assert.equal(vars.AWS_LWA_READINESS_CHECK_PATH, '/health');
    assert.match(JSON.stringify(fn.Layers), /LambdaAdapterLayerArm64:\d+/);
  }
});

test('Cloud Run env vars carry over', () => {
  const nws = byName('sentinel-nws-alerts').Environment.Variables;
  assert.equal(nws.ALLOWED_ORIGINS, 'https://app.nationalwildfiretrackingteam.org');
  assert.match(nws.NWS_USER_AGENT, /^SentinelWildfireTracker\/1\.0/);
  // Live Cloud Run fema-nfhl-proxy has no ALLOWED_ORIGINS (answers `*`).
  assert.equal(byName('sentinel-fema-nfhl-proxy').Environment.Variables.ALLOWED_ORIGINS, undefined);
});

test('Function URLs are IAM-only (reachable through CloudFront OAC, not directly) and stream', () => {
  const urls = Object.values(data.findResources('AWS::Lambda::Url'));
  assert.equal(urls.length, SERVICES.length);
  for (const u of urls) {
    assert.equal(u.Properties.AuthType, 'AWS_IAM');
    assert.equal(u.Properties.InvokeMode, 'RESPONSE_STREAM');
  }
  const perms = Object.values(data.findResources('AWS::Lambda::Permission')).map((p) => p.Properties);
  for (const action of ['lambda:InvokeFunctionUrl', 'lambda:InvokeFunction']) {
    const matching = perms.filter((p) => p.Action === action && p.Principal === 'cloudfront.amazonaws.com');
    assert.equal(matching.length, SERVICES.length, `${action} grant per function`);
    for (const p of matching) assert.ok(p.SourceArn, `${action} must be scoped to the distribution`);
  }
  data.resourceCountIs('AWS::CloudFront::OriginAccessControl', SERVICES.length);
});

test('every service prefix has a CloudFront behavior; errors are never cached', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const cfg = dist.Properties.DistributionConfig;
  const patterns = cfg.CacheBehaviors.map((b) => b.PathPattern).sort();
  assert.deepEqual(patterns, SERVICES.map((s) => `${s.pathPrefix}/*`).sort());
  for (const b of cfg.CacheBehaviors) {
    assert.equal(b.ViewerProtocolPolicy, 'redirect-to-https');
    assert.equal(b.Compress, true);
  }
  for (const status of [500, 502, 503, 504]) {
    const e = cfg.CustomErrorResponses.find((r) => r.ErrorCode === status);
    assert.equal(e?.ErrorCachingMinTTL, 0, `${status} must not be cached`);
  }
  assert.equal(cfg.PriceClass, 'PriceClass_100');
});

test('edge cache obeys origin Cache-Control and never invents a TTL', () => {
  data.hasResourceProperties('AWS::CloudFront::CachePolicy', {
    CachePolicyConfig: Match.objectLike({
      DefaultTTL: 0,
      MinTTL: 0,
      ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
        QueryStringsConfig: { QueryStringBehavior: 'all' },
        HeadersConfig: { HeaderBehavior: 'whitelist', Headers: ['Origin'] },
        EnableAcceptEncodingGzip: true,
      }),
    }),
  });
});

test('runtime roles can only write their own log group', () => {
  const policies = Object.values(data.findResources('AWS::IAM::Policy'));
  assert.equal(policies.length, SERVICES.length);
  for (const p of policies) {
    for (const stmt of p.Properties.PolicyDocument.Statement) {
      assert.deepEqual([stmt.Action].flat().sort(), ['logs:CreateLogStream', 'logs:PutLogEvents']);
      assert.ok(!JSON.stringify(stmt.Resource).includes('"*"'), 'no wildcard resources');
    }
  }
  const roles = Object.values(data.findResources('AWS::IAM::Role'));
  for (const r of roles) assert.equal(r.Properties.ManagedPolicyArns, undefined, 'no managed policies (e.g. AdministratorAccess)');
});

test('no VPC, NAT gateway or always-on compute', () => {
  for (const type of ['AWS::EC2::VPC', 'AWS::EC2::NatGateway', 'AWS::ECS::Service', 'AWS::ElasticLoadBalancingV2::LoadBalancer']) {
    data.resourceCountIs(type, 0);
  }
  for (const fn of Object.values(data.findResources('AWS::Lambda::Function'))) {
    assert.equal(fn.Properties.VpcConfig, undefined);
  }
});

test('logs expire after 14 days; alarms exist and notify', () => {
  for (const lg of Object.values(data.findResources('AWS::Logs::LogGroup'))) {
    assert.equal(lg.Properties.RetentionInDays, 14);
  }
  const alarms = Object.values(data.findResources('AWS::CloudWatch::Alarm'));
  assert.equal(alarms.length, SERVICES.length * 3 + 1);
  for (const a of alarms) assert.equal(a.Properties.AlarmActions.length, 1);
  data.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.org' });
  data.hasResourceProperties('AWS::Budgets::Budget', { Budget: Match.objectLike({ BudgetLimit: { Amount: 50, Unit: 'USD' } }) });
});

test('deploy role: GitHub OIDC, aws-production environment only, may only assume CDK bootstrap roles', () => {
  deploy.hasResourceProperties('AWS::IAM::Role', {
    RoleName: 'sentinel-github-deploy',
    AssumeRolePolicyDocument: Match.objectLike({
      Statement: [Match.objectLike({
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': 'repo:National-Wildfire-Tracking-Team/Sentinel-:environment:aws-production',
          },
        },
      })],
    }),
  });
  const [policy] = Object.values(deploy.findResources('AWS::IAM::Policy'));
  const [stmt] = policy.Properties.PolicyDocument.Statement;
  assert.equal(stmt.Action, 'sts:AssumeRole');
  assert.match(JSON.stringify(stmt.Resource), /role\/cdk-hnb659fds-\*-/);
});
