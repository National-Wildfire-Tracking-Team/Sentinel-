#!/usr/bin/env node
/**
 * CDK entry point. The data services live in us-east-1: it's the closest AWS
 * region to the Cloud Run services' us-east1, the region CloudFront's
 * metrics and certificates live in, and where NOAA's open-data buckets are.
 *
 * Weather Models (SentinelWeatherModels) is the one exception: it runs in
 * us-west-2, next to dynamical.org's HRRR/GFS Icechunk buckets, and is served
 * through the same CloudFront distribution. It's opt-in: until
 * `sentinel:weatherModels=enabled`, the app synthesizes exactly as before.
 *
 * MRMS (SentinelMrms) builds radar frames from NOAA's MRMS bucket in
 * us-east-1 and is served at /mrms/*. Also opt-in: `sentinel:mrms=enabled`.
 *
 * HAFS (SentinelHafs) renders hurricane-model frames from NOAA's HAFS bucket
 * in us-east-1 and is served at /hafs/*. Opt-in: `sentinel:hafs=enabled`.
 *
 * Settings come from cdk.json context and can be overridden per deploy, e.g.
 *   npx cdk deploy SentinelDataServices -c sentinel:alarmEmail=ops@example.org
 */

import { App } from 'aws-cdk-lib';
import { DataServicesStack } from '../lib/data-services-stack.mjs';
import { GithubDeployStack } from '../lib/github-deploy-stack.mjs';
import { WEATHER_MODELS, WeatherModelsStack } from '../lib/weather-models-stack.mjs';
import { MrmsStack } from '../lib/mrms-stack.mjs';
import { HafsStack } from '../lib/hafs-stack.mjs';

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
  weatherModels: 'disabled', // 'enabled' adds SentinelWeatherModels and the /weather-models/* route
  distributionId: '', // set after the first deploy to scope the weather-models invoke permission
  weatherModelsReservedConcurrency: '0', // >0 caps concurrent executions (needs spare account concurrency)
  mrms: 'disabled', // 'enabled' adds SentinelMrms and the /mrms/* route
  hafs: 'disabled', // 'enabled' adds SentinelHafs and the /hafs/* route
  hafsReservedConcurrency: '0', // >0 caps concurrent frame renders (needs spare account concurrency)
};

const app = new App();
const ctx = (key) => app.node.tryGetContext(`sentinel:${key}`) || DEFAULTS[key];

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };
const weatherModelsEnabled = ctx('weatherModels') === 'enabled';

let weatherModels;
if (weatherModelsEnabled) {
  weatherModels = new WeatherModelsStack(app, 'SentinelWeatherModels', {
    env: { account: env.account, region: WEATHER_MODELS.region },
    // Its Function URL is read by the us-east-1 distribution.
    crossRegionReferences: true,
    description: 'Sentinel Weather Models: HRRR/GFS point forecasts from AWS Open Data (Lambda, us-west-2)',
    alarmEmail: ctx('alarmEmail'),
    distributionId: ctx('distributionId') || undefined,
    reservedConcurrency: Number(ctx('weatherModelsReservedConcurrency')),
  });
}

const mrmsEnabled = ctx('mrms') === 'enabled';
let mrms;
if (mrmsEnabled) {
  mrms = new MrmsStack(app, 'SentinelMrms', {
    env,
    description: 'Sentinel MRMS: radar map frames from NOAA MRMS on AWS Open Data (Lambda + S3, us-east-1)',
    alarmEmail: ctx('alarmEmail'),
    distributionId: ctx('distributionId') || undefined,
  });
}

let hafs;
if (ctx('hafs') === 'enabled') {
  hafs = new HafsStack(app, 'SentinelHafs', {
    env,
    description: 'Sentinel HAFS: hurricane-model map frames from NOAA HAFS on AWS Open Data (Lambda, us-east-1)',
    alarmEmail: ctx('alarmEmail'),
    distributionId: ctx('distributionId') || undefined,
    reservedConcurrency: Number(ctx('hafsReservedConcurrency')),
  });
}

const dataServices = new DataServicesStack(app, 'SentinelDataServices', {
  env,
  crossRegionReferences: weatherModelsEnabled,
  description: 'Sentinel public-data HTTP services (Lambda + CloudFront), migrated from Google Cloud Run',
  allowedOrigins: ctx('allowedOrigins'),
  nwsUserAgent: ctx('nwsUserAgent'),
  alarmEmail: ctx('alarmEmail'),
  monthlyBudgetUsd: Number(ctx('monthlyBudgetUsd')),
  weatherModelsFunctionUrl: weatherModels?.functionUrl.url,
  mrms: mrmsEnabled,
  hafsFunctionUrl: hafs?.functionUrl.url,
});
// Deploying the distribution deploys SentinelMrms first (its bucket backs /mrms/*), as CI deploys only SentinelDataServices.
if (mrms) dataServices.addDependency(mrms);
// SentinelHafs deploys first too: the distribution reads its Function URL (a same-region stack export).

new GithubDeployStack(app, 'SentinelGithubDeploy', {
  env,
  description: 'OIDC deploy role for the Sentinel GitHub Actions AWS workflow',
  githubRepo: ctx('githubRepo'),
  existingOidcProviderArn: ctx('existingOidcProviderArn') || undefined,
  // The deploy role may assume the CDK bootstrap roles in these regions.
  regions: ['us-east-1', WEATHER_MODELS.region],
});
