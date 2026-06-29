# Implementation Plan: Fix Production CORS and FIRMS/FIRIS Errors

**Branch**: `003-fix-cors-firms-errors` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-fix-cors-firms-errors/spec.md`

## Summary

Fix production console errors caused by CORS policy blocking Supabase edge function requests and FIRIS ArcGIS service errors. The primary issue is that the `firms-proxy` Supabase edge function is not returning proper HTTP 200 status for CORS preflight (OPTIONS) requests, causing the browser to block all data fetching. Secondary issues include excessive console error logging from polling intervals and FIRIS service unavailability.

## Technical Context

**Language/Version**: JavaScript/TypeScript (Vite + React frontend, Supabase Deno functions, Netlify Edge Functions)

**Primary Dependencies**: React, Supabase, Mapbox GL, Vite

**Storage**: N/A (error handling fixes only)

**Testing**: Vitest (existing test infrastructure)

**Target Platform**: Web browser (nationalwildfiretrackingteam.org)

**Project Type**: web-application

**Performance Goals**: Fire data loads within 5 seconds of page load

**Constraints**: Must not break existing fallback mechanisms or data integrity

**Scale/Scope**: Single production website with dual-proxy architecture (Netlify Edge Functions + Supabase Edge Functions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution file found. No gates to evaluate.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-cors-firms-errors/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
supabase/functions/
├── firms-proxy/index.ts        # Primary CORS fix target
├── calfire-proxy/index.ts      # Similar pattern, may need review
├── airnow-proxy/index.ts       # Similar pattern
├── opensky-proxy/index.ts      # Similar pattern
└── ...

netlify/edge-functions/
├── firms-proxy.js              # Fallback proxy (review needed)
├── calfire-proxy.js            # Similar pattern
├── nhc-proxy.js                # Similar pattern
├── fema-proxy.js               # Similar pattern
└── census-counties-proxy.js    # Similar pattern

src/
├── api/nasaFirms.js            # FIRMS data fetching with tiered fallback
├── api/nifc.js                 # FIRIS data fetching with retry logic
├── hooks/useFireHotspots.js    # FIRMS polling hook
└── hooks/useMergedFireData.js  # Merged fire data hook
```

**Structure Decision**: Existing dual-proxy architecture (Supabase + Netlify) with React frontend. Focus changes on:
1. Supabase edge functions (CORS configuration review)
2. Client-side error handling (console.log throttling)
3. FIRIS retry logic improvements

## Complexity Tracking

No violations to track. This is a bug fix, not a new feature requiring architectural decisions.