# Data Model: Fix Production CORS and FIRMS/FIRIS Errors

**Date**: 2026-06-28
**Feature**: 003-fix-cors-firms-errors

## Overview

This feature is a bug fix focused on error handling and CORS configuration. It does not introduce new data entities or modify existing data structures. The data model below documents the existing entities involved in the error scenarios.

## Existing Entities

### 1. FIRMS Hotspot Data

**Source**: NASA FIRMS API via Supabase/Netlify edge functions
**Format**: CSV (FIRMS has no JSON endpoint)
**Key Fields**:
- `latitude`: Number - Detection latitude
- `longitude`: Number - Detection longitude
- `brightness`: Number - Brightness temperature (MODIS)
- `bright_ti4`: Number - Brightness temperature (VIIRS)
- `frp`: Number - Fire Radiative Power
- `acq_date`: String - Acquisition date (YYYY-MM-DD)
- `acq_time`: String - Acquisition time (HHMM)
- `satellite`: String - Satellite identifier (T, N, 1, 2)
- `instrument`: String - Sensor instrument (VIIRS, MODIS)
- `confidence`: String - Detection confidence (low, nominal, high)
- `version`: String - Data version

**Normalization**: Raw CSV rows are converted to objects with unified field names:
- `brightness` field is normalized from both `brightness` (MODIS) and `bright_ti4` (VIIRS)

### 2. FIRIS Fire Perimeter Data

**Source**: NIFC FIRIS ArcGIS service
**Format**: GeoJSON FeatureCollection
**Key Fields**:
- `poly_IncidentName`: String - Fire name
- `poly_GISAcres`: Number - Fire acreage
- `poly_PercentContained`: Number - Containment percentage
- `poly_DateCurrent`: String - Last update timestamp
- `geometry`: Object - GeoJSON polygon geometry

**Normalization**: Snake_case fields are normalized to camelCase for consistency.

### 3. Edge Function Configuration

**Supabase Edge Function** (`firms-proxy`):
```typescript
{
  CORS_HEADERS: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
}
```

**Netlify Edge Function** (`firms-proxy`):
```javascript
{
  CORS_HEADERS: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}
```

## Error State Transitions

### FIRMS Data Fetch Flow

```
┌─────────────────────────────────────┐
│  useFireHotspots Hook Polling       │
│  (every 5 minutes)                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Tier 1: Supabase Edge Function    │
│  Status: PRIMARY (current)          │
│  Error: CORS preflight failure      │
└──────────────┬──────────────────────┘
               │ on failure
               ▼
┌─────────────────────────────────────┐
│  Tier 2: Netlify Edge Function     │
│  Status: FALLBACK                   │
│  Error: May also fail               │
└──────────────┬──────────────────────┘
               │ on failure
               ▼
┌─────────────────────────────────────┐
│  Tier 3: Mock Data                 │
│  Status: DEMO MODE                  │
│  Returns: MOCK_FIRE_HOTSPOTS        │
└─────────────────────────────────────┘
```

### Error Message Throttling (Proposed)

```
┌─────────────────────────────────────┐
│  Error Occurs                       │
│  Message: "[FIRMS] Supabase..."     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Check Throttle Cache               │
│  Key: Error message hash            │
│  TTL: 5 minutes                     │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│  Not Cached │ │  Cached     │
│  Log Error  │ │  Skip Log   │
│  Add Cache  │ │             │
└─────────────┘ └─────────────┘
```

## No Schema Changes Required

This bug fix does not require:
- Database migrations
- New tables or columns
- API contract changes
- Data format modifications

All changes are to error handling logic and CORS configuration, not data structures.