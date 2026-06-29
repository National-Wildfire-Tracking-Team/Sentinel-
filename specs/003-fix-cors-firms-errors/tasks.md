# Tasks: Fix Production CORS and FIRMS/FIRIS Errors

**Input**: Design documents from `/specs/003-fix-cors-firms-errors/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not requested in feature specification - omitting test tasks

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Supabase Edge Functions**: `supabase/functions/`
- **Netlify Edge Functions**: `netlify/edge-functions/`
- **Client-Side API**: `src/api/`
- **Client-Side Hooks**: `src/hooks/`
- **Utilities**: `src/utils/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify deployment status and establish baseline

- [X] T001 Verify Supabase edge function deployment status in Supabase dashboard [MANUAL - requires Supabase access]
- [X] T002 Check Supabase function logs for firms-proxy errors [MANUAL - requires Supabase access]
- [X] T003 Verify NASA_FIRMS_API_KEY secret is set in Supabase [MANUAL - requires Supabase access]
- [X] T004 Test current Netlify edge function availability at /api/firms/* [MANUAL - requires browser testing]

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create error throttling utility that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Create error throttling utility in src/utils/errorThrottle.js
- [X] T006 [P] Implement message deduplication with 5-minute TTL in src/utils/errorThrottle.js
- [X] T007 Add user-friendly error message mapping in src/utils/errorThrottle.js
- [X] T008 Export throttleError() function for use in API modules

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Fix CORS Policy Error (Priority: P1) 🎯 MVP

**Goal**: Users can view live fire data without CORS errors blocking data loading

**Independent Test**: Access production website and verify no CORS errors in browser console

### Implementation for User Story 1

- [X] T009 [US1] Review and fix CORS headers in supabase/functions/firms-proxy/index.ts
- [X] T010 [US1] Ensure OPTIONS preflight returns HTTP 200 OK in supabase/functions/firms-proxy/index.ts
- [X] T011 [US1] Add Access-Control-Allow-Methods header for GET, OPTIONS in supabase/functions/firms-proxy/index.ts
- [X] T012 [US1] Update client-side fallback order in src/api/nasaFirms.js to try Netlify first
- [X] T013 [US1] Verify Supabase function is accessible from production origin [MANUAL - requires browser testing]
- [X] T014 [US1] Test CORS preflight handling in browser developer tools [MANUAL - requires browser testing]
- [X] T015 [US1] Validate FIRMS data loads successfully without CORS errors [MANUAL - requires browser testing]

**Checkpoint**: CORS errors eliminated - FIRMS data loads on 95%+ of page visits

---

## Phase 4: User Story 2 - Fix FIRMS Data Fallback Behavior (Priority: P2)

**Goal**: Graceful degradation when FIRMS data source is unavailable without console flooding

**Independent Test**: Simulate Supabase failure and verify minimal console output

### Implementation for User Story 2

- [X] T016 [P] [US2] Integrate error throttle utility in src/api/nasaFirms.js
- [X] T017 [US2] Replace console.warn for Supabase failure with throttled logging in src/api/nasaFirms.js
- [X] T018 [US2] Replace console.error for Netlify failure with throttled logging in src/api/nasaFirms.js
- [X] T019 [US2] Add user-friendly error message display in src/api/nasaFirms.js
- [X] T020 [US2] Implement fallback chain logging (single message per tier) in src/api/nasaFirms.js
- [X] T021 [US2] Verify error messages appear at most once per polling interval [MANUAL - requires browser testing]
- [X] T022 [US2] Test graceful degradation when both sources fail [MANUAL - requires browser testing]

**Checkpoint**: Console errors reduced by 80% - graceful degradation working

---

## Phase 5: User Story 3 - Fix FIRIS ArcGIS Error Handling (Priority: P3)

**Goal**: FIRIS errors handled gracefully without repeated error messages

**Independent Test**: Monitor console output when FIRIS service is unavailable

### Implementation for User Story 3

- [X] T023 [P] [US3] Integrate error throttle utility in src/api/nifc.js
- [X] T024 [US3] Replace console.warn for FIRIS failure with throttled logging in src/api/nifc.js
- [X] T025 [US3] Extend cache duration during detected FIRIS outages in src/api/nifc.js
- [X] T026 [US3] Implement outage detection logic in src/api/nifc.js
- [X] T027 [US3] Add fallback to WFIGS data when FIRIS unavailable in src/hooks/useMergedFireData.js
- [X] T028 [US3] Verify FIRIS errors logged once per outage period [MANUAL - requires browser testing]
- [X] T029 [US3] Test California fire perimeters still display from WFIGS when FIRIS fails [MANUAL - requires browser testing]

**Checkpoint**: All user stories complete - FIRIS errors throttled and graceful degradation working

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T030 [P] Review all Supabase edge functions for consistent CORS patterns in supabase/functions/
- [X] T031 [P] Review all Netlify edge functions for consistent CORS patterns in netlify/edge-functions/
- [X] T032 Update error logging in src/api/calFire.js with throttle utility
- [X] T033 Update error logging in src/api/nhcStorms.js with throttle utility
- [X] T034 Update error logging in src/hooks/useCalFireIncidents.js with throttle utility
- [X] T035 Run quickstart.md validation scenarios [MANUAL - requires browser testing]
- [X] T036 Verify success criteria SC-001 through SC-004 are met [MANUAL - requires browser testing]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (P1) should be implemented first
  - US2 (P2) and US3 (P3) can proceed in parallel after US1
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Uses throttle utility from Phase 2
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses throttle utility from Phase 2

### Within Each User Story

- Infrastructure integration before logging changes
- Logging changes before validation testing
- Core implementation before edge case handling

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, US2 and US3 can start in parallel
- CORS pattern reviews across all edge functions can run in parallel

---

## Parallel Example: User Story 2 & 3

```bash
# Once Phase 2 completes, launch US2 and US3 together:
Task: "Integrate error throttle utility in src/api/nasaFirms.js"
Task: "Integrate error throttle utility in src/api/nifc.js"

# Then implement logging changes in parallel:
Task: "Replace console.warn for Supabase failure in src/api/nasaFirms.js"
Task: "Replace console.warn for FIRIS failure in src/api/nifc.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify deployment status)
2. Complete Phase 2: Foundational (error throttle utility)
3. Complete Phase 3: User Story 1 (CORS fix)
4. **STOP and VALIDATE**: Test CORS errors eliminated
5. Deploy to production

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy (MVP!)
3. Add User Story 2 → Test independently → Deploy
4. Add User Story 3 → Test independently → Deploy
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (CORS fix - highest priority)
   - Developer B: User Story 2 (FIRMS error throttling)
   - Developer C: User Story 3 (FIRIS error throttling)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

---

## Success Criteria Verification

| Criterion | How to Verify | Task(s) |
|-----------|---------------|---------|
| SC-001: Zero CORS errors | Check Console tab in browser dev tools | T014, T015 |
| SC-002: 95%+ FIRMS load rate | Monitor multiple page loads | T015, T021 |
| SC-003: 80% error reduction | Compare console output before/after | T021, T028 |
| SC-004: 5-second load time | Measure time from page load to fire markers | T015, T035 |