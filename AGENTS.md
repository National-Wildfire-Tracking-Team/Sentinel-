# AGENTS.md

## Cursor Cloud specific instructions

Sentinel is a single-product **Vite + React** wildfire dashboard (no separate backend
service required for local dev). It runs in **demo mode** with realistic mock/live-public
data even without any API keys. Standard commands live in `package.json` `scripts` and the
`README.md`; only the non-obvious caveats are captured here.

### Services

- **Frontend dev server** (Vite, port `3000`) — the app. Serves routes `/` → `/sentinel`
  (live map), `/login`, `/register`, `/reporter-dashboard`, etc.
- **`ipaws-server`** (Node, `127.0.0.1:3847`) — small local poller that fetches FEMA IPAWS
  CAP alerts and serves `GET /alerts`. Vite proxies `/alerts` to it.
- `npm run dev:all` (a.k.a. `bash dev.sh`) starts **both** the ipaws-server and Vite. Prefer
  this over `npm run dev` so the `/alerts` proxy target exists. Run it in a tmux terminal;
  `dev.sh` kills the ipaws-server when Vite exits.

### Environment / `.env` (non-obvious)

- The app tolerates a missing `.env` (Supabase falls back to a placeholder and auth-gated
  UI is disabled). For a complete dev setup, create `.env` (gitignored) with the same
  placeholder Supabase values the CI e2e job uses:
  `VITE_SUPABASE_URL=https://placeholder.supabase.co` and
  `VITE_SUPABASE_ANON_KEY=placeholder-anon-key`. Without these, the **Login submit button
  is disabled**, which makes the Playwright login specs fail.
- Vite only reads `.env` at startup — **restart the dev server after editing `.env`.**
- Real API keys are optional; NASA FIRMS / AirNow etc. only enrich data and are consumed by
  Supabase edge functions, not the frontend directly.

### Testing caveats (non-obvious)

- **Unit tests** (`npm run test`, Vitest) run against `Tests/Vitest/**` and need no server.
- **E2E tests** (`npm run test:e2e`, Playwright) are designed to run against the **production
  build**, not the dev server. `playwright.config.ts` switches its `webServer` based on the
  `CI` env var: without `CI` it uses `npm run dev` (the `/sentinel` map crashes to the
  ErrorBoundary under the mocked routes in dev mode → live-alerts specs fail); with `CI` set
  it builds-then-serves `dist` and all 60 specs pass. So run e2e as:
  `npm run build && CI=true npm run test:e2e` (baseURL is hardcoded to `http://localhost:3000`,
  so free that port first — stop the dev server before an e2e run, then restart it after).
- Playwright's default `html` reporter auto-serves the report and **blocks** when a local
  (non-CI) run has failures; running with `CI=true` avoids that hang.

### GUI / computer-use caveat (non-obvious)

- The map is WebGL (MapLibre/mapbox-gl). In the headless computer-use browser (no GPU) the
  **map canvas renders black**, but the "Active Incidents" sidebar, incident-detail panel,
  and layer toggles all populate/work normally. A black map center in a screenshot is a
  browser-GPU limitation, not an app failure. The reporter "updates" panel also shows
  "Failed to load updates" because Supabase is only a placeholder locally — that is expected.
