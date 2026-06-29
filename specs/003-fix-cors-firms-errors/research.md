# Research: Fix Production CORS and FIRMS/FIRIS Errors

**Date**: 2026-06-28
**Feature**: 003-fix-cors-firms-errors

## Research Areas

### 1. CORS Preflight Failure Analysis

**Decision**: The CORS error "Response to preflight request doesn't pass access control check: It does not have HTTP ok status" indicates the OPTIONS request is not returning HTTP 200.

**Rationale**: 
- The Supabase edge function `firms-proxy` at `supabase/functions/firms-proxy/index.ts` correctly handles OPTIONS requests and returns `new Response('ok', { headers: CORS_HEADERS })` with `Access-Control-Allow-Origin: *`
- However, the error suggests the function is either:
  1. Not deployed to Supabase
  2. Crashing before handling the OPTIONS request
  3. Supabase infrastructure is not routing OPTIONS requests correctly

**Alternatives Considered**:
- Direct browser requests to FIRMS API: Blocked by FIRMS CORS policy
- Netlify edge function as primary: Already exists as fallback at `/api/firms/*`

**Recommendation**: 
1. Verify Supabase edge function deployment status
2. Check Supabase function logs for errors
3. Consider making Netlify edge function the primary proxy (already working as fallback)

---

### 2. Console Error Flooding Analysis

**Decision**: The repeated CORS errors in console are caused by `setInterval` polling in `useFireHotspots.js` that retries failed requests without throttling.

**Rationale**:
- `useFireHotspots.js` polls at `VITE_REFRESH_INTERVAL` (default 5 minutes)
- Each poll attempt triggers 3 parallel requests (VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, MODIS_NRT)
- Each failed request logs `[FIRMS] Supabase edge function failed, trying fallback:`
- The 3x multiplier and frequent polling creates console noise

**Alternatives Considered**:
- Reduce polling frequency: May delay fire detection updates
- Remove console logging entirely: Loses debugging information
- Implement exponential backoff: More complex but handles transient failures

**Recommendation**: Implement console.log throttling with a minimum interval between identical messages (e.g., 5 minutes).

---

### 3. FIRIS ArcGIS Error Analysis

**Decision**: The FIRIS service at `services1.arcgis.com` is experiencing intermittent availability issues.

**Rationale**:
- Error message: `[FIRIS] Skipping CA perimeters source: ArcGIS FIRIS error`
- The `nifc.js` file already implements `withRetry()` with 3 attempts and exponential backoff
- However, the error is logged each time the retry exhausts, creating noise

**Alternatives Considered**:
- Increase retry attempts: May delay data more
- Remove FIRIS entirely: Loses California-specific fire perimeter data
- Cache last successful response longer: Reduces fetch frequency during outages

**Recommendation**: Implement error message throttling similar to FIRMS, and consider extending cache duration during detected outages.

---

### 4. Dual-Proxy Architecture Review

**Decision**: The current dual-proxy architecture (Supabase + Netlify) is intentional but creates confusion.

**Rationale**:
- Supabase edge functions: Keep API keys server-side (more secure)
- Netlify edge functions: Simpler, already working as fallback
- The fallback chain in `nasaFirms.js` (Supabase → Netlify → Mock) is working as designed
- The primary issue is Supabase function availability, not the architecture itself

**Alternatives Considered**:
- Consolidate to single proxy: Loses redundancy
- Remove API key from Supabase: Less secure
- Move all proxies to Netlify: Requires Netlify Pro for secrets management

**Recommendation**: Keep dual-proxy but make Netlify the primary (more reliable) and Supabase the fallback for API key security.

---

### 5. Error Handling Best Practices

**Decision**: Implement structured error logging with throttling and user-friendly messages.

**Rationale**:
- Current logging uses `console.warn()` and `console.error()` directly
- No throttling or deduplication of repeated error messages
- Users see raw error messages instead of friendly messages

**Alternatives Considered**:
- Remove all console logging: Loses debugging capability
- Use external error tracking (Sentry): Adds dependency
- Implement custom logger with throttling: More control

**Recommendation**: Create a lightweight error logging utility that:
1. Throttles identical messages (minimum 5-minute interval)
2. Provides user-friendly error messages in UI
3. Maintains detailed logs for debugging (accessible via dev tools)

---

## Summary of Decisions

| Area | Decision | Priority |
|------|----------|----------|
| CORS Preflight | Verify Supabase deployment or switch to Netlify primary | P1 |
| Console Flooding | Implement error message throttling | P2 |
| FIRIS Errors | Extend cache duration during outages | P3 |
| Architecture | Keep dual-proxy, adjust primary/fallback order | P2 |
| Error Handling | Create throttled logging utility | P2 |

## Technical Debt Identified

1. No centralized error handling utility
2. Console logging not production-ready
3. No monitoring/alerting for edge function failures
4. FIRIS retry logic could be more sophisticated