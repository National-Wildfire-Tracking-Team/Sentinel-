# ors-routing

Backend for **Route to Safety**, shown in the UI as **Navigation** (Pro/Team, All Hazards tab). Spec:
`docs/superpowers/specs/2026-10-09-pro-route-to-safety-design.md`.

- `POST /shelters/nearest` `{ origin: [lng, lat], radiusKm? }` → `{ shelters, partial }`
- `POST /route` `{ origin, destination, avoid }` → `{ route, avoidedHazards }` (422 `no_route`).
  `avoidedHazards` means "avoid polygons were applied"; it is also false when none were sent.
  Bodies are capped at 512 KB (the client keeps them under ~150 KB).
- `GET /health`

Auth: `x-sentinel-auth: Bearer <Supabase access token>`; plan must be pro/team
with status active/trialing/past_due. Every ORS request first takes a unit
from `public.consume_routing_quota` (migration `20261009000000_routing_quota.sql`),
which enforces the account-wide ORS limits (Directions 2,000/day + 40/min,
Matrix 500/day + 40/min) with ~10% headroom plus per-user caps.

## Env

| Var | Meaning |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Public Supabase project URL + anon key |
| `ORS_SECRET_ID` | Secrets Manager secret holding the ORS key (default `Routing`); plain string or JSON `{ "ORS_API_KEY": … }`. In the console's Key/value editor: `ORS_API_KEY` on the left, the key on the right |
| `ORS_API_KEY` | Local dev only: skips Secrets Manager |
| `ALLOWED_ORIGINS` | CORS allow-list (comma-separated) |

If the key can't be read, every route fails with 502 `routing_upstream_failed`
(the app says "Routing is unavailable right now") and the log line
`upstream_failed` carries `kind: "OrsSecretError"` plus a `reason`:
`empty`, `invalid_json`, `missing_field`, or `key_in_name` (the key was typed
into the left box with the right box blank). Fix the secret; no redeploy is
needed, since a failed load is retried on the next request.

## Local run

    cd cloud/ors-routing && npm ci
    SUPABASE_URL=… SUPABASE_ANON_KEY=… ORS_API_KEY=… npm start   # :8080

Then set `VITE_ORS_ROUTING_URL=http://localhost:8080` for `npm run dev`.
Locally there is no CloudFront, so `x-amz-content-sha256` is simply ignored.

## Local dev with the app

    npm run dev:routing   # this service on :8787 (cloud/ors-routing/dev.mjs)
    npm run dev           # Vite proxies /ors-routing to it

`dev.mjs` takes the Supabase URL/anon key from the repo's `.env` and the ORS
key from `cloud/ors-routing/.env.local` (`ORS_API_KEY=…`, git-ignored) or,
without that, the AWS secret `Routing` (us-east-1) via your AWS credentials.
Navigation is Pro/Team only in the UI and here: sign in as a Pro or Team
account (active, trialing or past_due) to use it.
