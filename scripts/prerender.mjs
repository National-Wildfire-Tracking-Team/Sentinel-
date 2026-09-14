#!/usr/bin/env node
/**
 * scripts/prerender.mjs
 * Snapshots the marketing site's static pages (already built by `vite
 * build`) as real HTML files, so crawlers get full content without having
 * to execute JS first — one of the contributors to AdSense's "Low Value
 * Content" review flagged this site.
 *
 * Deliberately excludes "/": dist/index.html is the single shared shell
 * served for all three subdomains (main marketing site, the app subdomain,
 * and the reporter subdomain) via hostname-based routing in src/main.jsx.
 * Overwriting it with the prerendered marketing homepage would make it the
 * fallback shell for the app/reporter subdomains too, which is wrong there.
 * The other marketing routes below don't have this conflict — they don't
 * exist as routes on those other subdomains, so writing
 * dist/<route>/index.html only ever affects the marketing domain. The
 * homepage keeps relying on client-side rendering + the Seo component,
 * same as before this script existed.
 *
 * Uses Playwright (already a devDependency for e2e tests, see
 * playwright.config.ts) against a `vite preview` of the real production
 * build, then saves the fully-rendered DOM. The saved HTML still includes
 * the built <script>/<link> tags, so the client bundle mounts over it
 * normally on load — this only changes what a crawler sees on first byte,
 * not how the app behaves for a real visitor.
 *
 * Intentionally NOT wired into `npm run build` (used by netlify.toml for
 * deploy-preview/branch-deploy contexts) — this keeps Netlify's own build
 * path completely unchanged. It's run as an explicit extra step in
 * .github/workflows/deploy.yml, in the same CI environment that already
 * runs Playwright reliably for e2e tests.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;
const PRODUCTION_ORIGIN = 'https://nationalwildfiretrackingteam.org';

const ROUTES = [
  '/about',
  '/disaster-response',
  '/disaster-response/preparedness',
  '/disaster-response/recovery',
  '/disaster-response/get-involved',
  '/volunteer',
  '/pricing',
  '/privacy-policy',
  '/terms',
];

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url).then(() => resolve(), () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function main() {
  const previewProcess = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'inherit' }
  );
  previewProcess.on('error', (err) => {
    throw err;
  });

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch();
    const page = await browser.newPage();

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      // Every marketing page renders an <h1> in its hero section; wait for
      // it rather than networkidle, since a background auth/session check
      // (Navbar's useAuth) can keep a connection open past what networkidle
      // would tolerate.
      await page.waitForSelector('h1', { timeout: 15000 });
      await page.waitForTimeout(300);

      // The Seo component builds canonical/og:url from window.location.origin,
      // which is the local preview server here — rewrite to the real origin.
      const rawHtml = await page.content();
      const html = `<!DOCTYPE html>\n${rawHtml.split(BASE_URL).join(PRODUCTION_ORIGIN)}`;
      const outDir = path.join('dist', route);
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
      console.log(`Prerendered ${route} -> dist${route}/index.html`);
    }
  } finally {
    await browser?.close();
    previewProcess.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
