/**
 * dev.mjs
 * Runs ors-routing locally for `npm run dev` (Vite proxies /ors-routing here).
 *
 *   npm run dev:routing
 *
 * - Supabase URL/anon key come from the repo's .env (VITE_SUPABASE_URL /
 *   VITE_SUPABASE_ANON_KEY), the same project the app uses.
 * - The ORS key comes from cloud/ors-routing/.env.local (ORS_API_KEY=…,
 *   git-ignored via *.local) if present; otherwise the server reads the AWS
 *   Secrets Manager secret "Routing" (us-east-1) with your local AWS
 *   credentials (`aws configure` or `aws sso login`).
 * - The server still enforces everything it does in production: a signed-in
 *   Pro/Team user and the Supabase quota (migration 20261009000000).
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

for (const file of [path.join(root, '.env'), path.join(here, '.env.local')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL || '';
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY || '';
process.env.PORT ||= '8787';
process.env.AWS_REGION ||= 'us-east-1';
process.env.ORS_SECRET_ID ||= 'Routing';

const problems = [];
if (!existsSync(path.join(here, 'node_modules'))) {
  problems.push('Install the service once: npm --prefix cloud/ors-routing ci');
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  problems.push('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}
if (problems.length) {
  console.error(`ors-routing (dev) can't start:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

console.log(
  `ors-routing (dev) on http://127.0.0.1:${process.env.PORT} — ORS key from ${
    process.env.ORS_API_KEY ? 'cloud/ors-routing/.env.local' : 'AWS Secrets Manager'
  }`,
);
await import('./index.mjs');
