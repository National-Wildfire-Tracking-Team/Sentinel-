# ors-routing

Backend for **Route to Safety**, shown in the UI as **Navigation** (Pro/Team, All Hazards tab). It runs as a
Supabase Edge Function; it used to be an AWS Lambda behind CloudFront. Spec:
`docs/superpowers/specs/2026-10-09-pro-route-to-safety-design.md`.

Base URL: `<SUPABASE_URL>/functions/v1/ors-routing`

- `POST /shelters/nearest` `{ origin: [lng, lat], radiusKm? }` → `{ shelters, partial }`
- `POST /route` `{ origin, destination, avoid, preference? }` → `{ route, avoidedHazards }` (422 `no_route`).
  `preference` is optional, `"fastest"` or `"recommended"` (ORS default); the client sends
  `"fastest"` when leaving an evacuation zone so the route favours major roads.
  `avoidedHazards` means "avoid polygons were applied"; it is also false when none were sent.
  Bodies are capped at 512 KB (the client keeps them under ~150 KB).
- `GET /health`

Auth: `Authorization: Bearer <Supabase access token>` (plus `apikey: <anon key>`),
checked by the Functions gateway (JWT verification stays on) and again here. The
plan must be pro/team with status active/trialing/past_due. Every ORS request
first takes a unit from `public.consume_routing_quota` (migration
`20261009000000_routing_quota.sql`), which enforces the account-wide ORS limits
(Directions 2,000/day + 40/min, Matrix 500/day + 40/min) with ~10% headroom plus
per-user caps.

## Secret

The ORS key is the Edge Function secret **`Routing`**, the same name it had in
AWS Secrets Manager. Set it in the dashboard (Edge Functions → Secrets) or:

    supabase secrets set Routing=<ORS API key>

The value is the bare key or JSON `{ "ORS_API_KEY": "…" }`.

If the key can't be read, every route fails with 502 `routing_upstream_failed`
(the app says "Routing is unavailable right now") and the function log line
`upstream_failed` carries `kind: "OrsSecretError"` plus a `reason`:
`empty` (secret missing or blank), `invalid_json`, `missing_field`, or
`key_in_name` (`{"<key>": ""}`). Fix the secret; no redeploy is needed.

## Env

| Var | Meaning |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Injected by Supabase; used with the caller's JWT, never the service-role key |
| `Routing` | The ORS key (see above) |
| `ALLOWED_ORIGINS` | Optional CORS allow-list (comma-separated); unset allows `*` |

## Deploy

    supabase functions deploy ors-routing

Keep JWT verification on (don't pass `--no-verify-jwt`). The app calls
`<VITE_SUPABASE_URL>/functions/v1/ors-routing` itself, so there is no frontend
env var to set.

## Local run

    supabase functions serve ors-routing --env-file supabase/.env.local

with `Routing=<key>` in that (git-ignored) env file. `npm run dev` always calls
the function on the project in `VITE_SUPABASE_URL`. Navigation is Pro/Team only
in the UI and here: sign in as a Pro or Team account (active, trialing or
past_due) to use it.
