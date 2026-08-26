# Sentinel — Full Bug & Issue Audit

**Date:** 2026-08-26
**Branch:** `cursor/full-bug-issue-audit-6bd9`
**Scope:** `Main` at `0d02fce` (storm-centered dBZ radar probe) plus this PR’s fixes
**Tracker:** GitHub Issues is enabled but **empty**. The project tracks work as pull requests.

---

## Executive summary

Sentinel is a large React + Mapbox + Supabase wildfire tracker. Most data pipelines are resilient (demo-mode fallbacks, rate limiters, ErrorBoundary). The highest-impact defects were **silent data-layer failures** and **over-permissive RLS**, not crash-loop UI bugs.

This PR **fixes** the confirmed functional/security defects listed under “Fixed in this PR” and **documents** product/architecture issues that need a follow-up (server-side writers, proxy auth, reporter onboarding).

| Severity | Open (documented) | Fixed here |
|----------|-------------------|------------|
| Critical | 1 remaining (automated-update RLS — mitigated, not locked) | 1 (evac-zone fetch interceptor) |
| High     | 4 (registration, proxies, nexrad trigger, client-side writers) | 3 (photo URLs, demoted-role RLS, duplicate automated rows) |
| Medium   | Several (plan limits, proxy abuse, coverage) | 5 (Stripe replay, admin entitlements, stuck evac loader, dead layer toggles, evac centroid markers) |

---

## GitHub tracker status

### Issues

`gh issue list` returned **zero open and zero closed issues**. `hasIssuesEnabled: true`.

There is no issue backlog to triage. Historical work lives in PRs (#1–#492).

### Open pull requests (not duplicated here)

| PR | Title | Notes |
|----|--------|--------|
| [#491](https://github.com/National-Wildfire-Tracking-Team/Sentinel-/pull/491) | Close layers panel on map click | Known UX bug. **Do not duplicate** — already in review on `layer_tab_fix`. |
| [#477](https://github.com/National-Wildfire-Tracking-Team/Sentinel-/pull/477) | Cloud Agent env + AGENTS.md | Draft chore; unrelated to runtime bugs. |

### Recent merged context

Recent Main merges include photo attachments on any update (#492), AdSense (#490), mobile/theme (#488), Netlify deploy secrets (#487), live-map redesign churn (#480–#486), locate-me errors (#481), NGFS layer (#476), DAT layer (#471).

---

## Fixed in this PR

### C1. Reporter evacuation zones never hit Supabase (Critical) — **FIXED**

`src/api/supabaseClient.js` installed a global `fetch` wrapper that short-circuited **every** request whose URL contained `reporter_evac_zones` and returned `200 []` **before the network**. SELECT, INSERT, UPDATE, and DELETE all no-op’d.

- Zones never loaded on the public map
- Reporter draws appeared to succeed or fail unpredictably
- `checkTableExists()` treated `[]` as “table exists”

**Fix:** Removed the interceptor. The table has existed since migration `20260423000000_reporter_evac_zones.sql`. `useReporterEvacZones` already handles a genuine missing-table 404. Network errors no longer permanently disable the table for the rest of the session.

### H1. `photo_urls` rendered unsanitized (High) — **FIXED**

`IncidentTimeline` rendered `<a href={url}>` / `<img src={url}>` for any string in `photo_urls`. Combined with client-writable `incident_updates`, `javascript:` and non-http URLs were possible.

**Fix:** `src/utils/safeUrl.js` allows only `http:` / `https:`. Applied on insert and on render. Uploads now whitelist `jpg/jpeg/png/webp/gif` (MIME + extension) to match the storage bucket.

### H2. Demoted reporters keep write access (High) — **FIXED**

`reporter_evac_zones` and `hazard_events` UPDATE/DELETE policies only checked `auth.uid() = user_id`, not current role. A user demoted to `public` could still edit/delete their old rows. Storage photo delete had the same gap.

**Fix:** Migration `20260826000000_audit_rls_and_automated_dedupe.sql` requires `reporter` or `admin` on those writes. `schema.sql` updated to match.

### H3. Duplicate automated timeline rows (High) — **MITIGATED**

Every open browser tab calls `insertAutomatedUpdate()` when IRWIN/CAL FIRE fields change. Combined with a public insert policy, this spam-floods the public feed.

**Fix:** Unique index on `(incident_id, source_name, md5(content))` where `source_type = 'automated'`. Duplicate inserts from N clients now collide instead of multiplying. **The insert policy is still public** (locking it would stop the only writer — the browser). See remaining item C2.

### M1. Stripe webhook replay (Medium) — **FIXED**

Signature HMAC was checked but the `t=` timestamp was not. Captured valid payloads could be replayed.

**Fix:** Reject signatures older than 5 minutes; compare hex with a constant-time loop.

### M2. Admins denied Pro infrastructure layers (Medium) — **FIXED**

`usePlan()` granted Pro-equivalent infrastructure access to `isReporter` only. Admins (`role === 'admin'`) on a free plan could not see power lines / pipelines / schools.

**Fix:** `hasProInfrastructureAccess` is true for paid plans, reporters, **or** admins.

### M3. `useEvacZones` loading stuck on throw (Medium) — **FIXED**

`load()` had no try/catch. A throw from `fetchCAEvacZones()` left `loading === true` forever. (Hook is currently unused by `LiveTrackerPage`, which uses `useCombinedEvacZones`; still a landmine.)

### M4. Dead layer toggles in the Layers panel (Medium) — **FIXED**

The Layers panel exposed **7-day Fire Risk** and **GOES Fire Temperature**. Neither is mounted in `MapView`. `FireRiskOutlook.jsx` does not even parse (`export default funtion`, mixed quotes, etc.).

**Fix:** Removed those keys from `TAB_SECTIONS` so users cannot toggle a no-op layer. Left `LAYER_DEFS` / AppContext flags in place for a future wiring. ESLint ignores the broken WIP file so CI does not fail on a parse error.

### M9. Evacuation zone centroid markers dropped (Medium) — **FIXED**

`Tests/Vitest/EvacuationZonesLayer.test.jsx` still required `evac-zones-dot` / halo / `!` marker layers that stay visible at every zoom. The mobile/theme merge (`5df12c7`) removed those centroid markers, so at the default national zoom polygons disappear and zones look “off.” Restored the centroid source using `polygonCentroid` from `geoUtils.js` and wired the dots into MapView click/hover.

---

## Remaining findings (not fully fixed — product / architecture)

### C2. Anyone can insert fake “automated” timeline updates (Critical)

**Files:** `supabase/schema.sql` 252–256; `src/hooks/useIncidentUpdates.js` `insertAutomatedUpdate`

```sql
create policy "updates automated insert"
  on public.incident_updates for insert
  with check (source_type = 'automated' and user_id is null);
```

No auth, no service role. The anon key in the browser is enough. This PR **dedupes** spam but does **not** drop the policy, because the only writer today is the client (`useIncidents` / `useCalFireIncidents`).

**Recommended follow-up:** Move persistence to a cron or Edge Function using `service_role`, drop the public insert policy, and keep `publishIncidentChange` for local UI. Then every open tab stops being a writer.

### H4. Open reporter self-registration (High — product)

`/reporter-register` is a public route. Signup metadata `intended_role: 'reporter'` is honored by `handle_new_user()`. Anyone who finds the URL becomes a live-map publisher after email confirm.

If this is intentional for volunteer recruiting, add rate limits / admin approval. If not, stop reading `intended_role` from client metadata and invite via admin.

### H5. Unauthenticated secret-bearing proxies (High)

Supabase Edge Functions (`firms-proxy`, `mapbox-geocoding`, `airnow-proxy`, `opensky-proxy`) and Netlify `/api/firms/*` accept anonymous CORS `*` calls. They exist to hide keys from the browser, but the functions themselves are an open quota burner.

**Recommended:** App Check / shared function secret / IP allowlist / stricter path validation. Do not put `VITE_NASA_FIRMS_API_KEY` in client URLs as a fallback (`src/api/nasaFirms.js`).

### H6. `nexrad-heartbeat` is an unauthenticated service-role trigger (High)

`supabase/functions/nexrad-heartbeat/index.ts` — any caller with the anon key can POST `{ site_id }` and trigger service-role upserts, storage writes, and CPU-heavy decode. GitHub Action `nexrad-radar-sync` is the intended caller.

**Recommended:** Require `NEXRAD_HEARTBEAT_SECRET` (or similar) on the function and in the workflow.

### M5. Saved-location plan limits are client-only (Medium)

`useSavedLocations` caps at 4/25/100 in JS. RLS allows unlimited owner inserts. Bypass with a direct REST call.

**Recommended:** Trigger or RLS using `subscriptions.plan`.

### M6. `subscriptions` write policy is named “service write” but is admin-client (Medium)

`supabase/migrations/20260423000000_subscriptions.sql` — admins can UPDATE `plan` via the anon client and skip Stripe. Confirm whether that is an intended ops escape hatch.

### M7. Client rate limiters are per-tab (Medium)

FIRMS / Mapbox / OpenSky / HRRR limiters live in module state. N users × M tabs = N×M budgets. Real limits belong on the proxy.

### M8. Mapbox geocoding fallback embeds the public token in query strings (Low–Medium)

`ReporterDashboardPage`, `AddressAlertSearch` fall back to `api.mapbox.com/...&access_token=`. Expected for Mapbox GL, but the geocoding proxy exists specifically to avoid this. Prefer failing closed when the proxy is down.

### L1. `/error-test` is in production builds (Low)

Required by Playwright e2e (`Tests/e2e/login.spec.ts`) which serves `dist/`. Keep it, or move e2e to a test-only Vite plugin that injects the route.

### L2. Duplicate migration timestamps (Low)

Two files named `20260423000000_*.sql` (subscriptions + reporter_evac_zones). Supabase CLI ordering is filename-based; this is fragile. Rename on next migration squash.

### L3. `opensky-proxy` looks like leftover debug code (Low)

Returns `{ marker: 'OPENSKY-OAUTH-TEST', body: text }` and does not upsert `aircraft_positions`. Production sync is `scripts/opensky-sync.mjs`. Either restore the upsert or delete the function to stop exposing OAuth.

### L4. Volunteer page TODO is stale (Low)

`VolunteerPage.jsx` still says `TODO: Replace with your actual Google Form URL` but `GOOGLE_FORM_URL` is already a real form. Remove the TODO.

---

## Dead / unwired code (not deleted)

| File | Status |
|------|--------|
| `src/components/Map/layers/FireRiskOutlook.jsx` | Does not parse. Not imported. Toggle hidden in this PR. |
| `src/components/Map/GOESFireTemperatureLayer.jsx` | Disabled in MapView with a comment. Toggle hidden in this PR. |
| `src/components/Map/layers/CaEvacuationsLayer.jsx` + `useCaEvacuations.js` | Superseded by `useCombinedEvacZones` / `EvacuationZonesLayer`. |
| `src/hooks/useEvacZones.js` | Unused by LiveTracker; still fixed try/catch. |
| `src/components/Map/layers/NhcInvestsLayer.jsx` | Not wired into LiveTrackerPage. |
| `src/components/Map/layers/Buildings3DLayer.jsx` | Not wired. |
| `src/api/openSkyApi.js` `fetchFlights` | Stub returning empty GeoJSON; live path is table + heartbeat. |

Do **not** delete these in this audit PR — they look like in-progress features.

---

## Fragile areas (no single-line fix)

1. **`LiveTrackerPage` + `useMergedFireData.getFireMatchKey()`** — IRWIN / CAL FIRE / reporter name matching. Source of duplicate or missing map dots. Has unit tests; keep expanding fixtures (slash names, “FIRE PERIMETER” suffixes).
2. **`useWeatherAlerts`** — six geometry fallbacks + UGC padding. Race-guarded with `loadIdRef`; still the most complex hook.
3. **God components:** `MapView.jsx` (~1900), `ReporterDashboardPage.jsx` (~2400), `FireDetailPanel.jsx` (~1500). High regression cost; almost no component tests.
4. **IPAWS dev vs prod:** local Node poller (`server/ipaws-server.js`) vs production Netlify `fema-proxy`. Client `_ipawsCache` papers over the difference.
5. **`AuthContext` profile fetch failure → role `'public'`** — fail-open for reads. A reporter whose profile query 500s loses dashboard access until retry (e2e covers “still reaches /sentinel”).

---

## Test coverage gaps

Vitest covers utils, rate limiters, several hooks, LayerControl, Footer, EvacuationZonesLayer.

**No tests for:** `LiveTrackerPage`, `MapView`, `ReporterDashboardPage`, `FireDetailPanel`, `AuthContext`, most layer components, Stripe functions.

E2E: login + live-alerts + ErrorBoundary only.

Coverage thresholds in `vitest.config.js` are 5–8% — they will not catch regressions.

---

## Verification of this PR

- New unit tests: `safeUrl`, `incidentPhotos` MIME/ext, `usePlan` admin entitlement, `useEvacZones` error path, LayerControl hides dead toggles, `useReporterEvacZones` does not latch false on network errors.
- Existing Vitest + ESLint + production build should stay green.
- SQL migration is additive (policies + unique index + pre-dedupe DELETE). Apply with `supabase db push` / migration runner before relying on it in production.

---

## Suggested follow-up PRs (priority)

1. Server-side automated incident updates + drop public insert policy (closes C2).
2. Shared secret on `nexrad-heartbeat` + proxy functions (H5, H6).
3. Reporter invite/approval instead of public `/reporter-register` (H4) — **product decision**.
4. DB trigger for saved-location limits (M5).
5. Finish or delete `FireRiskOutlook.jsx` / `GOESFireTemperatureLayer.jsx`.
6. Merge or close #491 (layers panel on map click) independently.
