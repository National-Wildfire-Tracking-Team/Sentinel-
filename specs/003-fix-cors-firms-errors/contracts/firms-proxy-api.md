# API Contract: firms-proxy Edge Function

**Date**: 2026-06-28
**Feature**: 003-fix-cors-firms-errors

## Overview

The `firms-proxy` edge function exists in two implementations:
1. **Supabase** (`supabase/functions/firms-proxy/index.ts`) - Primary (current)
2. **Netlify** (`netlify/edge-functions/firms-proxy.js`) - Fallback (current)

## Supabase Edge Function Contract

### Endpoint
```
POST https://<supabase-project>.supabase.co/functions/v1/firms-proxy
```

### Request Headers
```
Content-Type: application/json
Authorization: Bearer <supabase-anon-key>
```

### Request Body (JSON)
```typescript
{
  action?: "status",           // Optional: check MAP key validity
  source?: "VIIRS_SNPP_NRT" | "VIIRS_NOAA20_NRT" | "MODIS_NRT",  // Default: VIIRS_SNPP_NRT
  area: "west,south,east,north",  // Required unless action="status"
  days?: "1" | "2" | ... | "10"  // Default: "1"
}
```

### Response: Success (200 OK)
```
Content-Type: text/csv
Body: <CSV data from NASA FIRMS API>
```

### Response: Error (4xx/5xx)
```json
{
  "error": "Error message description"
}
```

### CORS Headers (All Responses)
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

### Preflight (OPTIONS) Response
```
Status: 200 OK
Body: "ok"
Headers: Same CORS headers as above
```

---

## Netlify Edge Function Contract

### Endpoint
```
GET /api/firms/api/area/csv/<API_KEY>/<source>/<area>/<days>
```

### Request Headers
```
Content-Type: text/csv
```

### Response: Success (200 OK)
```
Content-Type: text/csv
Body: <CSV data from NASA FIRMS API>
```

### Response: Error (4xx/5xx)
```
Body: <Error message from upstream API>
```

### CORS Headers (All Responses)
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## Client-Side Contract (nasaFirms.js)

### Function Signature
```typescript
async function fetchFireHotspots(
  source: "VIIRS_SNPP_NRT" | "VIIRS_NOAA20_NRT" | "MODIS_NRT",
  area: string,           // "west,south,east,north"
  days?: number           // Default: 2
): Promise<FireHotspot[]>
```

### Fallback Chain
1. **Primary**: Supabase edge function (skipped in dev mode)
2. **Fallback**: Netlify edge function at `/api/firms/*`
3. **Demo**: Mock data if no API key configured

### Error Handling
- Each tier logs warning on failure
- Falls through to next tier on error
- Final tier returns mock data (demo mode)

---

## FIRIS API Contract (NIFC)

### Endpoint
```
GET https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query
```

### Request Parameters
```
where: 1=1
outFields: *
f: geojson
```

### Response: Success (200 OK)
```json
{
  "type": "FeatureCollection",
  "features": [...]
}
```

### Response: Error
- Returns empty FeatureCollection
- Logs warning: `[FIRIS] Skipping CA perimeters source: ArcGIS FIRIS error`

### Retry Logic
- 3 attempts with exponential backoff (1s, 2s, 4s)
- Retries on `ERR_HTTP2_PROTOCOL_ERROR` or network errors
- 10-minute cache per query

---

## CORS Requirements Summary

| Requirement | Supabase | Netlify | Status |
|-------------|----------|---------|--------|
| Access-Control-Allow-Origin | * | * | ✅ Pass |
| Access-Control-Allow-Methods | (implicit) | GET, OPTIONS | ⚠️ Review |
| Access-Control-Allow-Headers | authorization, x-client-info, apikey, content-type | Content-Type | ⚠️ Review |
| OPTIONS Preflight | Returns 200 "ok" | Not implemented | ⚠️ Review |

## Recommended Fixes

1. **Supabase**: Verify OPTIONS request handling returns 200 OK
2. **Netlify**: Add explicit OPTIONS handling for preflight requests
3. **Client**: Implement error throttling to reduce console noise
4. **Both**: Ensure CORS headers are consistent across implementations