#!/usr/bin/env node
/**
 * CDK entry point. Everything lives in us-east-1: it's the closest AWS
 * region to the Cloud Run services' us-east1, the region CloudFront's
 * metrics and certificates live in, and where NOAA's open-data buckets are.
 *
 * Settings come from cdk.json context and can be overridden per deploy, e.g.
 *   npx cdk deploy SentinelDataServices -c sentinel:alarmEmail=ops@example.org
 */

import { App } from 'aws-cdk-lib';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { GithubDeployStack } from '../lib/github-deploy-stack.mjs';

// Defaults live here, not in cdk.json: an empty `-c sentinel:key=` (an
// unset GitHub variable in deploy-aws.yml) replaces cdk.json context
// outright, so the fallback has to be applied in code.
const DEFAULTS = {
  allowedOrigins: 'https://app.nationalwildfiretrackingteam.org', // live nws-alerts ALLOWED_ORIGINS
  nwsUserAgent: 'SentinelWildfireTracker/1.0 (+https://app.nationalwildfiretrackingteam.org)',
  alarmEmail: '',
  monthlyBudgetUsd: '50',
  githubRepo: 'National-Wildfire-Tracking-Team/Sentinel-',
  existingOidcProviderArn: '',
};

const app = new App();
const ctx = (key) => app.node.tryGetContext(`sentinel:${key}`) || DEFAULTS[key];

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

new DataServicesStack(app, 'SentinelDataServices', {
  env,
  description: 'Sentinel public-data HTTP services (Lambda + CloudFront), migrated from Google Cloud Run',
  allowedOrigins: ctx('allowedOrigins'),
  nwsUserAgent: ctx('nwsUserAgent'),
  alarmEmail: ctx('alarmEmail'),
  monthlyBudgetUsd: Number(ctx('monthlyBudgetUsd')),
});

new GithubDeployStack(app, 'SentinelGithubDeploy', {
  env,
  description: 'OIDC deploy role for the Sentinel GitHub Actions AWS workflow',
  githubRepo: ctx('githubRepo'),
  existingOidcProviderArn: ctx('existingOidcProviderArn') || undefined,
});
