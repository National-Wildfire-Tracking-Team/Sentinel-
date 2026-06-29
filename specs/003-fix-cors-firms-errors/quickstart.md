# Quickstart Validation Guide: Fix Production CORS and FIRMS/FIRIS Errors

**Date**: 2026-06-28
**Feature**: 003-fix-cors-firms-errors

## Prerequisites

- Access to production website: https://nationalwildfiretrackingteam.org
- Browser developer tools (Chrome DevTools, Firefox DevTools, etc.)
- Optional: Supabase dashboard access for function logs
- Optional: Netlify dashboard access for edge function logs

## Validation Scenarios

### Scenario 1: Verify CORS Preflight Fix (P1)

**Goal**: Confirm CORS preflight requests return HTTP 200 OK

**Steps**:
1. Open browser developer tools (F12 or Ctrl+Shift+I)
2. Go to Network tab
3. Navigate to https://nationalwildfiretrackingteam.org
4. Filter network requests by "firms-proxy"
5. Locate the OPTIONS request (preflight)
6. Verify response status is 200 OK
7. Verify response headers include `Access-Control-Allow-Origin: *`

**Expected Outcome**:
- OPTIONS request returns HTTP 200
- No CORS errors in Console tab
- FIRMS data loads successfully (red fire markers appear on map)

---

### Scenario 2: Verify FIRMS Data Loading (P1)

**Goal**: Confirm FIRMS fire hotspot data loads without errors

**Steps**:
1. Open browser developer tools
2. Navigate to https://nationalwildfiretrackingteam.org
3. Wait for page to fully load (5-10 seconds)
4. Check Console tab for any errors
5. Check Network tab for successful `/api/firms` or Supabase requests
6. Verify fire markers appear on map

**Expected Outcome**:
- No CORS-related errors in console
- FIRMS data requests complete successfully
- Fire hotspot markers visible on map
- No `[FIRMS] Supabase edge function failed` warnings

---

### Scenario 3: Verify Error Throttling (P2)

**Goal**: Confirm console error messages are throttled during outages

**Steps**:
1. If Supabase is temporarily unavailable, monitor console for 15 minutes
2. Count number of `[FIRMS]` error messages
3. Verify messages appear at most once per 5-minute polling interval
4. Verify no duplicate messages within the same interval

**Expected Outcome**:
- Maximum 3 error messages per 15-minute period (one per poll cycle)
- No duplicate messages within the same polling interval
- Error messages are clear and actionable

---

### Scenario 4: Verify FIRIS Graceful Handling (P3)

**Goal**: Confirm FIRIS errors are handled gracefully

**Steps**:
1. Open browser developer tools
2. Navigate to https://nationalwildfiretrackingteam.org
3. Wait for page to fully load
4. Check Console tab for FIRIS-related messages
5. Verify California fire perimeters load (if FIRIS is available)

**Expected Outcome**:
- If FIRIS available: CA perimeters displayed
- If FIRIS unavailable: Single warning message, no repeated errors
- Application continues functioning regardless of FIRIS status

---

### Scenario 5: Verify Fallback Mechanism (P2)

**Goal**: Confirm system gracefully degrades when Supabase fails

**Steps**:
1. Open browser developer tools
2. Navigate to https://nationalwildfiretrackingteam.org
3. If Supabase is working, temporarily block it:
   - In Network tab, right-click Supabase request → Block request URL
4. Refresh page
5. Verify FIRMS data still loads via Netlify fallback

**Expected Outcome**:
- FIRMS data loads via fallback proxy
- Console shows single warning about Supabase failure
- Fire markers still visible on map

---

## Testing Commands

### Local Development Testing

```bash
# Start development server
npm run dev

# Open browser to http://localhost:5173
# Check console for CORS errors (should use Vite proxy in dev mode)
# Verify FIRMS data loads via Vite proxy
```

### Production Testing

```bash
# No commands needed - test directly on production URL
# Use browser developer tools for validation
```

## Success Criteria Verification

| Criterion | How to Verify |
|-----------|---------------|
| SC-001: Zero CORS errors | Check Console tab in browser dev tools |
| SC-002: 95%+ FIRMS load rate | Monitor multiple page loads, count successes |
| SC-003: 80% error reduction | Compare console output before/after fix |
| SC-004: 5-second load time | Measure time from page load to fire markers visible |

## Troubleshooting

### If CORS errors persist:
1. Check Supabase function deployment status
2. Verify `NASA_FIRMS_API_KEY` secret is set in Supabase
3. Check Supabase function logs for errors
4. Consider making Netlify the primary proxy

### If FIRMS data doesn't load:
1. Check Network tab for failed requests
2. Verify API key is configured (check for demo data message)
3. Check if FIRMS API is available: https://firms.modaps.eosdis.nasa.gov/api/

### If console still shows errors:
1. Verify error throttling is implemented
2. Check if multiple error sources are active
3. Review polling interval configuration