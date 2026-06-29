# Feature Specification: Fix Production CORS and FIRMS/FIRIS Errors

**Feature Branch**: `003-fix-cors-firms-errors`

**Created**: 2026-06-28

**Status**: Draft

**Input**: User description: "Fix all console errors in production related to CORS policy blocking Supabase edge function requests and FIRIS ArcGIS errors"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fix CORS Policy Error (Priority: P1)

Users accessing the National Wildfire Tracking Team website should be able to view live fire data from FIRMS (Fire Information for Resource Management System) without encountering CORS errors that prevent data loading.

**Why this priority**: CORS errors completely block data fetching, making the core fire tracking functionality non-functional. This is the most critical issue as it prevents the primary use case of the application.

**Independent Test**: Can be fully tested by accessing the production website and verifying no CORS errors appear in the browser console when loading fire data.

**Acceptance Scenarios**:

1. **Given** a user visits nationalwildfiretrackingteam.org, **When** the page loads and requests fire data from Supabase edge function, **Then** the request completes successfully without CORS errors
2. **Given** the Supabase edge function responds, **When** the browser receives the response, **Then** the response passes access control checks and data is displayed
3. **Given** a user opens browser developer tools, **When** viewing the Console tab, **Then** no CORS-related error messages are displayed

---

### User Story 2 - Fix FIRMS Data Fallback Behavior (Priority: P2)

When the primary FIRMS data source via Supabase edge function fails, the system should gracefully handle the failure and attempt alternative data sources without flooding the console with error messages.

**Why this priority**: While the fallback mechanism exists, the repeated error logging creates noise in production monitoring and may indicate the fallback is also failing or being called excessively.

**Independent Test**: Can be tested by simulating a Supabase edge function failure and verifying the system handles it gracefully with minimal console output.

**Acceptance Scenarios**:

1. **Given** the Supabase edge function is unavailable, **When** the FIRMS data fetch fails, **Then** the system logs a single warning message and attempts fallback data source
2. **Given** the fallback data source is available, **When** the fallback succeeds, **Then** fire data is displayed to the user
3. **Given** both primary and fallback sources fail, **When** all attempts are exhausted, **Then** the user sees a user-friendly error message (not raw console errors)

---

### User Story 3 - Fix FIRIS ArcGIS Error Handling (Priority: P3)

The FIRIS (Fire Information for Resource Integration System) data source for California fire perimeters should either fetch successfully or be handled gracefully without repeated error messages.

**Why this priority**: This affects California-specific fire perimeter data but doesn't block the core FIRMS fire point data functionality.

**Independent Test**: Can be tested by monitoring console output when the FIRIS ArcGIS service is unavailable and verifying errors are handled cleanly.

**Acceptance Scenarios**:

1. **Given** the FIRIS ArcGIS service is unavailable, **When** the application attempts to fetch CA perimeters, **Then** the error is logged once and the application continues functioning
2. **Given** the FIRIS service returns an error, **When** the error is caught, **Then** the application displays available fire data from other sources
3. **Given** repeated polling intervals, **When** FIRIS remains unavailable, **Then** error messages are throttled or aggregated to reduce console noise

---

### Edge Cases

- What happens when the Supabase edge function is rate-limited or temporarily unavailable?
- How does the system handle mixed states where some data sources work and others fail?
- What occurs when network connectivity is intermittent during data polling?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST send requests to Supabase edge functions with proper CORS configuration that allows the production origin
- **FR-002**: System MUST handle CORS preflight requests correctly, returning appropriate HTTP status codes
- **FR-003**: System MUST implement graceful degradation when FIRMS data source is unavailable
- **FR-004**: System MUST throttle or aggregate error logging to prevent console flooding during outages
- **FR-005**: System MUST continue displaying available fire data even when one data source fails
- **FR-006**: System MUST display user-friendly error messages instead of raw technical errors

### Key Entities

- **FIRMS Data**: Fire Information for Resource Management System data representing active fire locations and hotspots
- **FIRIS Data**: Fire Information for Resource Integration System data for California fire perimeters
- **Supabase Edge Function**: Backend service proxy for fetching FIRMS data from external APIs

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero CORS-related console errors in production browser environments
- **SC-002**: FIRMS fire data loads successfully on 95%+ of page visits when external services are available
- **SC-003**: Console error messages reduced by 80% compared to current production state
- **SC-004**: Users can view fire tracking data within 5 seconds of page load under normal conditions

## Assumptions

- The CORS configuration on the Supabase edge function needs to be updated to allow requests from nationalwildfiretrackingteam.org
- The FIRMS edge function proxy code handles error responses from the upstream FIRMS API
- The FIRIS ArcGIS service may have temporary availability issues that require graceful handling
- The production website uses standard browser security policies that enforce CORS
- The existing fallback mechanism for FIRMS data is intended behavior that needs proper error handling