# Fire Behavior Modeling Engine — Architecture (Phase 1)

Status: **Phase 1 implemented** (physics core, single-process, in-repo). Phases 2+ are
roadmap, not yet built. This doc is the reference for both.

## 0. Why this looks different from a from-scratch spec

Sentinel/NWTT is a live product: React + Vite frontend, Supabase (Postgres) for
persistence, Netlify (edge functions + regular functions) as the API/proxy layer,
Mapbox GL for rendering. There is **no Python/GDAL/Celery anywhere in the stack today**,
and a ships-today Pro/Team feature already exists at
[`src/utils/fireBehaviorModel.js`](../../src/utils/fireBehaviorModel.js) — a deliberately
simple, honestly-labeled heuristic (Byram flame length + an Anderson-1983-style
elliptical growth approximation driven by nearest-RAWS wind/fuel-moisture). That model
stays as-is: it's cheap, it's already reviewed, and it's the right tool when there's no
fuel/terrain data to feed anything heavier.

This architecture adds a **second, deeper computational path** — a real Rothermel-based
physics engine — as a standalone, tested module (`src/fireEngine/`). It does not replace
the existing layer yet, because the inputs a real model needs (LANDFIRE fuel model
rasters, DEM slope/aspect, gridded weather) aren't ingested into this app yet. Phase 1
below is the physics core plus a working end-to-end simulation using caller-supplied or
synthetic spatial inputs. Phases 2–4 are what it takes to wire it to real data at
production scale.

## 1. Scientific model selection

| Behavior | Model used | Classification |
|---|---|---|
| Surface rate of spread | Rothermel (1972), full multi-size-class surface-area weighting per Albini (1976)/Andrews (2018) | Established physics |
| Fireline intensity | Byram (1959): `I_B = I_R · t_r · (R/60)` | Established physics |
| Flame length | Byram (1959) empirical: `L = 0.45 · I_B^0.46` | Empirical (widely validated) |
| Flame residence time | Anderson (1969): `t_r = 384/σ` | Empirical approximation |
| Wind adjustment (20-ft → midflame) | Albini & Baughman (1979) / Andrews (2012, RMRS-GTR-266) | Established approximation |
| Elliptical fire shape | Focus-based radial ROS from length-to-breadth ratio (Anderson 1983 concept) | Empirical approximation — see caveat below |
| Fire growth | Vertex-based Huygens' principle (simplified — see §5) | Established concept, simplified implementation |
| Crown fire initiation | Van Wagner (1977) critical intensity | Established physics |
| Crown fire spread rate | Rothermel (1991), `R_active ≈ 3.34 · R_10` | Empirical correlation |
| Spotting distance | Not modeled physically | Heuristic, explicitly labeled — see §1.1 |
| Confidence/uncertainty | Weighted data-quality scoring | Heuristic, not a statistical CI |

**§1.1 — honesty flags, called out per the "never present an approximation as
validated" requirement:**

- The length-to-breadth (LB) ratio vs. wind-speed curve in `fireEllipse.js` intentionally
  reuses the same simple linear approximation already shipping in
  `fireBehaviorModel.js` (`LB = 1 + 0.125·U_mph`, capped at 8:1) rather than the
  exponential Anderson(1983)/Alexander(1985) curve sometimes cited in the literature.
  I could not confidently reconstruct that curve's exact published coefficients from
  memory without a citable primary source in front of me, and a wrong exponential curve
  is worse than an honestly-labeled linear one. **Action item before relying on this for
  anything beyond visualization: pull the coefficients from Alexander (1985, Table 1) or
  BehavePlus source and swap them in.**
- `spotting.js` does **not** implement Albini's ember-transport/plume physics (that
  requires solving lofting height + ballistic trajectory under a wind profile — a
  research-grade undertaking on its own). It returns a clearly-labeled heuristic
  "maximum plausible spot distance" for situational awareness only, scaled off flame
  length and wind speed. Do not present its output as a physical spotting model.
- Crown fire *type* (passive vs. active vs. no crowning) is not classified — only
  Van Wagner's binary initiation criterion is implemented. Full classification requires
  Cruz et al.'s critical crown fire spread rate work, not yet implemented.
- Live fuel moisture of extinction uses each fuel model's static value from the Anderson
  (1982) table rather than Albini's dynamic (load-transfer) live-extinction-moisture
  correction — a documented simplification, not an omission.

## 2. Module map (implemented, `src/fireEngine/`)

```
src/fireEngine/
├── geo.js                    pure lat/lon math: bearing, destination point, ring resample
├── confidence.js              data-quality → confidence score/label
├── science/
│   ├── fuelModels.js          Anderson (1982) 13 standard fuel models, tons/ac → lb/ft²
│   ├── rothermel.js           full Rothermel (1972) ROS + Byram intensity/flame length
│   ├── windAdjustment.js      20-ft wind → midflame wind (Albini & Baughman 1979)
│   └── crownFire.js           Van Wagner (1977) initiation + Rothermel (1991) crown ROS
├── spotting.js                heuristic max spot distance (explicitly non-physical)
├── simulation/
│   ├── fireEllipse.js         LB ratio → eccentricity → focus-based radial ROS
│   ├── grid.js                spatially-varying cell lookup (fuel/wind/slope/moisture per cell)
│   └── perimeterGrowth.js     Huygens-style vertex wavelet perimeter propagation
└── index.js                   simulateFireGrowth() orchestrator, GeoJSON output
```

Scientific calculations (`science/`) have zero dependency on GeoJSON, React, or the
grid — they take plain numbers, return plain numbers. `simulation/` is the geospatial
layer built on top. `index.js` is the only file that knows about GeoJSON feature shape.
This split exists so the physics can be unit-tested (and eventually reused from a
Python/Rust service) without dragging geometry code along.

## 3. Data inputs

| Input | Phase 1 (today) | Phase 2+ (production) |
|---|---|---|
| Fuel model | Caller-supplied Anderson-13 id per cell/vertex, or a single default | LANDFIRE 40 (Scott & Burgan) raster via LANDFIRE REST API, resampled to sim grid |
| Fuel moisture | Caller-supplied % (1-hr/10-hr/100-hr/live), or derived from single RAWS reading like the existing model | NFDRS fuel moisture model driven by gridded HRRR + RAWS network, per NWTT's already-integrated `src/api/raws.js` |
| Wind | Caller-supplied 20-ft speed/direction per cell | HRRR 3-km gridded wind, terrain-adjusted; NWS/NOAA already integrated (`src/api/noaaWeather.js`) as the coarse fallback |
| Slope/aspect | Caller-supplied % slope + aspect per cell | USGS 3DEP DEM (10–30m), precomputed slope/aspect rasters cached per fire AOI |
| Canopy (cover/height/base height/bulk density) | Optional, defaults to no canopy (open fuel) | LANDFIRE canopy rasters |
| Ignition/current perimeter | GeoJSON point or polygon, caller-supplied | NIFC WFIGS perimeters — already integrated in this app |
| Satellite detections | Not consumed yet | VIIRS/MODIS via `src/api/nasaFirms.js` (already integrated) for data assimilation, §Phase 3 |

## 4. Simulation grid & resolution

Resolution is a size/duration/compute trade-off, not a fixed choice:

| Resolution | Cells for a 10,000-acre fire (~6,300 ac bounding box side) | Use case | Cost |
|---|---|---|---|
| 30 m | ~45,000 cells | Small fire (<1,000 ac), short horizon (≤6h), high-value structure protection | High — only run when it matters |
| 60–100 m | ~4,000–11,000 cells | Typical operational fire, 6–24h horizon | Moderate, the default target |
| 250 m | ~650 cells | Large fire (>50,000 ac) or long horizon (24h+) | Low, coarse but fast |
| 500 m | ~160 cells | Regional/strategic overview, multi-day | Very low |

Phase 1's `perimeterGrowth.js` doesn't rasterize the whole AOI — it's vertex-based
(propagates the perimeter's own vertices via Huygens' principle), so "resolution" there
means vertex spacing along the perimeter, not a grid cell size. `simulation/grid.js`
exists for callers who *do* want a rasterized spatially-varying field (e.g. for painting
a rate-of-spread heatmap) and exposes the resolution knob directly. Phase 2's
auto-resolution selector: start at 100m; drop to 250m if `(AOI cells) > 50,000` or
forecast horizon > 24h; drop to 30m only for explicit small-AOI + short-horizon requests.

## 5. Fire growth algorithm (Phase 1 implementation)

`perimeterGrowth.js` implements a simplified Huygens' principle:

1. Resample the input perimeter ring to a bounded vertex count.
2. For each vertex, look up local conditions (fuel model, wind, slope/aspect, moisture)
   — either from a supplied `FireGrid` or from per-vertex overrides.
3. Run `rothermel.js` for that vertex's conditions → head ROS, and derive the elliptical
   LB ratio → eccentricity.
4. Compute the radial ROS at the bearing from the perimeter's centroid through that
   vertex (focus-based ellipse formula), and push the vertex outward by `ROS × Δt`.
5. Repeat per timestep (not one big multi-hour jump) so weather can change mid-simulation
   — this is what makes "update fire behavior as weather changes" (spec §7) real instead
   of a single static extrapolation.

This is **not** FARSITE's full algorithm — real Huygens-principle implementations
detect and resolve self-intersections when fire fronts wrap around barriers or merge
with themselves, which requires polygon regularization (buffering/union operations)
that this Phase 1 version does not attempt. It will produce reasonable perimeters for
convex-ish, unobstructed growth and will misbehave around terrain barriers or when a
fire's perimeter wraps back on itself. Flagged in code (`simulation/perimeterGrowth.js`)
and in §Phase 2.

## 6. Uncertainty / confidence methodology (`confidence.js`)

Score ∈ [0, 1], derived from a weighted checklist rather than any formal statistical
error propagation (that would need actual validation data — see §Phase 4):

| Factor | Weight | Full credit when |
|---|---|---|
| Fuel model source | 0.25 | Real per-cell fuel model (vs. single default applied everywhere) |
| Wind data recency/distance | 0.25 | Observation < 30 min old, station < 10 mi away |
| Fuel moisture source | 0.20 | Measured (RAWS) vs. climatological default |
| Terrain resolution | 0.15 | Slope/aspect supplied (vs. flat-ground assumption) |
| Perimeter accuracy | 0.15 | Mapped perimeter (vs. point ignition guess) |

Label bands: ≥0.75 "high", 0.45–0.75 "moderate", <0.45 "low". This is intentionally
coarse — it tells the UI when to show a fire's forecast with a heavy dashed line and a
warning chip, not a defensible statistical confidence interval. Do not expose the raw
number as if it were one.

## 7. Roadmap (not built yet)

**Phase 2 — real data + rasterized grid.** LANDFIRE fuel/canopy ingestion, USGS 3DEP
slope/aspect, HRRR gridded wind, wire `simulation/grid.js` to real rasters, auto
resolution selection, replace vertex-only growth with a proper rasterized Huygens
implementation (self-intersection handling).

**Phase 3 — persistence + async jobs + assimilation.** PostGIS tables (schema sketch
below), a job queue for multi-hour simulations (Netlify Background Functions or a small
worker service if Netlify's 15-min function ceiling becomes limiting), VIIRS/MODIS/GOES
assimilation against modeled perimeters, scenario modeling API.

**Phase 4 — validation + ML correction.** Historical-fire backtesting (IoU, area error,
arrival-time error against real perimeter progression data e.g. NIFC's historical WFIGS
archive), then — only after a physics baseline is validated — an ML correction layer
trained on (physics prediction, observed outcome) pairs, per the hybrid architecture in
the original spec. Not started; do not build the ML layer before the physics baseline
has been backtested, or there's nothing to correct against.

### Phase 3 schema sketch (Postgres/PostGIS via Supabase, illustrative — not migrated)

```sql
create extension if not exists postgis;

create table fire_simulations (
  id uuid primary key default gen_random_uuid(),
  fire_id text not null,                 -- UniqueFireIdentifier, joins existing perimeter data
  created_at timestamptz not null default now(),
  horizon_hours numeric not null,
  resolution_m numeric not null,
  input_snapshot jsonb not null,         -- fuel/wind/moisture/slope used, for reproducibility
  status text not null default 'queued'  -- queued | running | complete | failed
);

create table fire_simulation_results (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references fire_simulations(id) on delete cascade,
  horizon_hours numeric not null,
  perimeter geometry(Polygon, 4326) not null,
  ros_head_ft_min numeric,
  flame_length_ft numeric,
  fireline_intensity_btu_ft_s numeric,
  confidence numeric not null,
  confidence_label text not null
);
create index on fire_simulation_results using gist (perimeter);
```

## 8. Safety / limitations (unchanged from the existing feature's framing)

Same posture as the shipped model: this is decision support, not a dispatch tool.
Weather and fuel inputs carry their own uncertainty that compounds through the physics;
the confidence score in §6 is a rough visibility aid, not a certified error bound.
Nothing here should suppress or substitute for official incident command, InciWeb/NIFC
data, or evacuation orders — the UI must keep surfacing that, exactly as
`fireBehaviorModel.js`'s header comment already does.
