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
const data = Template.fromStack(new DataServicesStack(new App({ context: { 'aws:cdk:bundling-stacks': [] } }), 'Data', {
  env,
  allowedOrigins: 'https://app.nationalwildfiretrackingteam.org',
  nwsUserAgent: 'SentinelWildfireTracker/1.0 (ops@example.org)',
  alarmEmail: 'ops@example.org',
  monthlyBudgetUsd: 50,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-test-key',
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

test('runtime roles can only write their own log group (ors-routing may also read its one secret)', () => {
  const policies = Object.values(data.findResources('AWS::IAM::Policy'));
  assert.equal(policies.length, SERVICES.length);
  for (const p of policies) {
    for (const stmt of p.Properties.PolicyDocument.Statement) {
      const actions = [stmt.Action].flat().sort();
      const isLogs = JSON.stringify(actions) === JSON.stringify(['logs:CreateLogStream', 'logs:PutLogEvents']);
      const isSecret = JSON.stringify(actions) === JSON.stringify(['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue']);
      assert.ok(isLogs || isSecret, `unexpected actions ${actions}`);
      if (isSecret) assert.match(JSON.stringify(stmt.Resource), /secret:Routing-\?\?\?\?\?\?/);
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

test('ors-routing: uncached, all methods, reserved concurrency, secret + Supabase env', () => {
  const fn = byName('sentinel-ors-routing');
  assert.equal(fn.ReservedConcurrentExecutions, 10);
  assert.equal(fn.MemorySize, 1024);
  const vars = fn.Environment.Variables;
  assert.equal(vars.ORS_SECRET_ID, 'Routing');
  assert.equal(vars.SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(vars.SUPABASE_ANON_KEY, 'anon-test-key');
  assert.equal(vars.ALLOWED_ORIGINS, 'https://app.nationalwildfiretrackingteam.org');

  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  const b = dist.Properties.DistributionConfig.CacheBehaviors.find((x) => x.PathPattern === '/ors-routing/*');
  assert.ok(b, 'missing /ors-routing/* behavior');
  assert.equal(b.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'); // managed CachingDisabled
  assert.deepEqual([...b.AllowedMethods].sort(), ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
  const orp = Object.values(data.findResources('AWS::CloudFront::OriginRequestPolicy'))[0].Properties.OriginRequestPolicyConfig;
  assert.equal(orp.HeadersConfig.HeaderBehavior, 'whitelist');
  assert.deepEqual([...orp.HeadersConfig.Headers].sort(), [
    'Access-Control-Request-Headers', 'Access-Control-Request-Method', 'CloudFront-Viewer-Address',
    'Content-Type', 'Origin', 'x-sentinel-auth',
  ].sort());
  // CloudFront rejects these in a policy: Host/Authorization belong to OAC, and
  // OAC itself carries x-amz-content-sha256 into the signed origin request.
  assert.ok(!orp.HeadersConfig.Headers.some((h) => /^(host|authorization|x-amz-content-sha256)$/i.test(h)));
});

test('WAF rate-limits /ors-routing/* per IP and is attached to the distribution', () => {
  const [acl] = Object.values(data.findResources('AWS::WAFv2::WebACL'));
  assert.ok(acl, 'missing WebACL');
  assert.equal(acl.Properties.Scope, 'CLOUDFRONT');
  assert.deepEqual(acl.Properties.DefaultAction, { Allow: {} });
  const rule = acl.Properties.Rules.find((r) => r.Name === 'ors-routing-rate-limit');
  const rb = rule.Statement.RateBasedStatement;
  assert.equal(rb.Limit, 100);
  assert.equal(rb.EvaluationWindowSec, 300);
  assert.equal(rb.AggregateKeyType, 'IP');
  assert.equal(rb.ScopeDownStatement.ByteMatchStatement.SearchString, '/ors-routing/');
  assert.equal(rb.ScopeDownStatement.ByteMatchStatement.PositionalConstraint, 'STARTS_WITH');
  assert.deepEqual(rb.ScopeDownStatement.ByteMatchStatement.TextTransformations, [
    { Priority: 0, Type: 'URL_DECODE' },
    { Priority: 1, Type: 'NORMALIZE_PATH' },
  ]);
  assert.ok(rule.Action.Block);
  // A WAF block must still carry CORS + a JSON body, or the browser only sees a TypeError.
  assert.deepEqual(rule.Action.Block.CustomResponse, {
    ResponseCode: 429,
    CustomResponseBodyKey: 'RateLimited',
    ResponseHeaders: [{ Name: 'access-control-allow-origin', Value: '*' }],
  });
  const rateLimited = acl.Properties.CustomResponseBodies.RateLimited;
  assert.equal(rateLimited.ContentType, 'APPLICATION_JSON');
  assert.deepEqual(JSON.parse(rateLimited.Content), { error: 'quota', scope: 'user', window: 'minute', retryAfterSec: 300 });
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  assert.ok(dist.Properties.DistributionConfig.WebACLId, 'WebACL not attached');
});

test('other services keep the shared origin-driven cache policy and GET-only methods', () => {
  const [dist] = Object.values(data.findResources('AWS::CloudFront::Distribution'));
  for (const b of dist.Properties.DistributionConfig.CacheBehaviors) {
    if (b.PathPattern === '/ors-routing/*') continue;
    if (!SERVICES.some((s) => `${s.pathPrefix}/*` === b.PathPattern)) continue;
    assert.deepEqual([...b.AllowedMethods].sort(), ['GET', 'HEAD', 'OPTIONS']);
    assert.notEqual(b.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
    assert.equal(b.OriginRequestPolicyId, 'b689b0a8-53d0-40ab-baf2-68738e2966ac'); // managed AllViewerExceptHostHeader
  }
});
