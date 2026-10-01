/**
 * services.mjs
 * One entry per cloud/<dir> HTTP service that moves from Cloud Run to AWS
 * Lambda. Sizing mirrors what is actually deployed on Cloud Run (read from
 * `gcloud run services list` on 2026-09-30, not the READMEs), translated:
 *
 * - memory: Lambda's CPU scales with memory (1769 MB = 1 vCPU). Every Cloud
 *   Run service has 1 vCPU, so nothing gets less than 1769 MB even where
 *   Cloud Run only needed 512Mi of RAM — otherwise the CPU-bound merges and
 *   gzip would run at a fraction of the speed they do today.
 * - timeoutSeconds: the Cloud Run request timeout. CloudFront's origin read
 *   timeout is capped at 60 s without a quota increase, so a longer Lambda
 *   timeout (calfire-frap-proxy's 120 s) only helps the in-flight upstream
 *   fetch finish and fill the warm cache; the viewer sees a 504 after 60 s.
 * - env: the Cloud Run env vars, unchanged.
 *
 * pathPrefix is where the service lives on the shared CloudFront
 * distribution. The Lambda Web Adapter strips it (AWS_LWA_REMOVE_BASE_PATH)
 * before the request reaches the unchanged Node server, so the frontend's
 * VITE_*_URL becomes `https://<distribution>/<pathPrefix>` and every path it
 * appends (/perimeters, /v1/alerts, …) is exactly what the service expects.
 *
 * Radar (nexrad-sync, nexrad-heartbeat) is deliberately absent: it is being
 * rebuilt from scratch rather than migrated.
 */

export const SERVICES = [
  {
    id: 'CalfireFrapProxy',
    dir: 'calfire-frap-proxy',
    pathPrefix: '/calfire-frap-proxy',
    frontendEnvVar: 'VITE_CALFIRE_FRAP_PROXY_URL',
    healthPath: '/health',
    memoryMb: 4096, // live since 2026-10-01 (raised from Cloud Run's 2Gi and deployed, but never committed); holds the whole statewide CKAN GeoJSON in memory
    timeoutSeconds: 120,
    env: {},
  },
  {
    id: 'CaliforniaLandOwnershipProxy',
    dir: 'california-land-ownership-proxy',
    pathPrefix: '/california-land-ownership-proxy',
    frontendEnvVar: 'VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL',
    healthPath: '/health',
    memoryMb: 1769,
    timeoutSeconds: 30,
    env: {},
  },
  {
    id: 'FemaNfhlProxy',
    dir: 'fema-nfhl-proxy',
    pathPrefix: '/fema-nfhl-proxy',
    frontendEnvVar: 'VITE_FEMA_NFHL_PROXY_URL',
    healthPath: '/health',
    memoryMb: 1769,
    timeoutSeconds: 60,
    // The README's deploy command sets ALLOWED_ORIGINS, but the live Cloud
    // Run service has no env vars at all, so it answers `*` — which deploy
    // previews rely on. Match what's deployed, not the README.
    env: {},
  },
  {
    id: 'FirePerimetersMerge',
    dir: 'fire-perimeters-merge',
    pathPrefix: '/fire-perimeters-merge',
    frontendEnvVar: 'VITE_FIRE_MERGE_SERVICE_URL',
    healthPath: '/health',
    memoryMb: 3008, // ~80 MB merged GeoJSON plus four raw sources held at once; 1Gi on Cloud Run ran close to the line
    timeoutSeconds: 60,
    env: {},
  },
  {
    id: 'NwsAlerts',
    dir: 'nws-alerts',
    pathPrefix: '/nws-alerts',
    frontendEnvVar: 'VITE_NWS_ALERTS_SERVICE_URL',
    healthPath: '/health',
    memoryMb: 1769,
    timeoutSeconds: 60,
    env: ({ allowedOrigins, nwsUserAgent }) => ({
      ALLOWED_ORIGINS: allowedOrigins,
      NWS_USER_AGENT: nwsUserAgent,
    }),
  },
];

/** AWS Lambda Web Adapter, published by AWS in every commercial region. */
export const LWA_LAYER_ACCOUNT = '753240598075';
export const LWA_LAYER_NAME = 'LambdaAdapterLayerArm64';
export const LWA_LAYER_VERSION = 30;
