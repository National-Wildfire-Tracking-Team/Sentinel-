/**
 * registry.mjs
 * The one list of hurricane guidance Sentinel knows by name: which ATCF
 * techniques make up each selectable model, what to call it, whether it's
 * the official forecast, an operational model or a retired (legacy) one,
 * and the color its track is drawn in.
 *
 * SHARED FILE: src/app/api/atcf/ and cloud/hurricane-models/ hold
 * byte-identical copies (Tests/Vitest/hurricaneModelsService.test.js pins
 * this). Edit one, copy it to the other.
 *
 * Identifiers were checked against NHC's live public a-decks
 * (ftp.nhc.noaa.gov/atcf/aid_public/aal092026.dat.gz) on 2026-10-08:
 *  - UKMET is filed as UKX (UKXI/UKX2 interpolated), not EGRR. EGRR is kept
 *    as a fallback in case the Met Office's own tracker reappears.
 *  - CMC is filed as CMC (CMCI/CMC2 interpolated).
 *  - ECMWF (EMX, interpolated EMXI/EMX2) is NOT in the public a-decks — the
 *    entry stays so the response says so instead of silently omitting it,
 *    and so tracks show up automatically if NHC ever publishes them.
 *  - HWRF and HMON were superseded by HAFS (HFSA/HFSB) in 2023. They are
 *    'legacy': never offered as current guidance by default, but their runs
 *    are still read wherever a deck carries them (historical seasons from
 *    atcf/archive, and any current deck that still has the IDs).
 *
 * `techniques` are the raw model runs, in order of preference: the model's
 * own forecast points at its own initialization time. `related` are the
 * interpolated ("early") and other derived versions of the same model,
 * which aren't drawn as separate tracks. `cycleHours` is how often the
 * model runs; a run is current while it's at most cycleHours + 12 h older
 * than the newest guidance (raw runs land about one cycle late).
 *
 * Colors follow the existing spaghetti palette (official white, hurricane
 * models in the sky blue the dynamical group used) and reuse GFS's color
 * from Weather Models (modelTheme.js), so one model looks the same across
 * Sentinel.
 */

export const HURRICANE_MODELS = {
  OFCL: {
    id: 'OFCL', name: 'NHC Official', category: 'official', cycleHours: 6,
    techniques: ['OFCL'], related: ['OFCI', 'OFC2'], color: '#ffffff',
    description: 'National Hurricane Center official forecast track',
  },
  HFSA: {
    id: 'HFSA', name: 'HAFS-A', category: 'operational', cycleHours: 6,
    techniques: ['HFSA'], related: ['HFAI', 'HFA2'], color: '#38bdf8',
    description: 'NOAA Hurricane Analysis and Forecast System, configuration A',
  },
  HFSB: {
    id: 'HFSB', name: 'HAFS-B', category: 'operational', cycleHours: 6,
    techniques: ['HFSB'], related: ['HFBI', 'HFB2'], color: '#2dd4bf',
    description: 'NOAA Hurricane Analysis and Forecast System, configuration B',
  },
  AVNO: {
    id: 'AVNO', name: 'GFS', category: 'operational', cycleHours: 6,
    techniques: ['AVNO'], related: ['AVNI', 'AVN2', 'AVNX'], color: '#d55181',
    description: 'NCEP Global Forecast System',
  },
  EMX: {
    id: 'EMX', name: 'ECMWF', category: 'operational', cycleHours: 12,
    techniques: ['EMX', 'ECMF'], related: ['EMXI', 'EMX2', 'ECMI', 'ECM2'], color: '#f59e0b',
    description: 'European Centre for Medium-Range Weather Forecasts (IFS)',
    availabilityNote: "ECMWF tracks aren't included in NHC's public ATCF guidance files.",
  },
  UKX: {
    id: 'UKX', name: 'UKMET', category: 'operational', cycleHours: 12,
    techniques: ['UKX', 'EGRR'], related: ['UKXI', 'UKX2', 'UKMI', 'UKM', 'EGRI', 'EGR2'], color: '#c084fc',
    description: 'UK Met Office global model',
  },
  CMC: {
    id: 'CMC', name: 'CMC', category: 'operational', cycleHours: 12,
    techniques: ['CMC'], related: ['CMCI', 'CMC2'], color: '#f87171',
    description: 'Environment and Climate Change Canada global model (GDPS)',
  },
  CTCX: {
    id: 'CTCX', name: 'COAMPS-TC', category: 'operational', cycleHours: 6,
    techniques: ['CTCX'], related: ['CTCI', 'CTC2'], color: '#a3e635',
    description: 'U.S. Navy COAMPS-TC (GFS-driven)',
  },
  HWRF: {
    id: 'HWRF', name: 'HWRF', category: 'legacy', cycleHours: 6,
    techniques: ['HWRF'], related: ['HWFI', 'HWF2'], color: '#94a3b8',
    description: 'Hurricane Weather Research and Forecasting model — superseded by HAFS in 2023',
  },
  HMON: {
    id: 'HMON', name: 'HMON', category: 'legacy', cycleHours: 6,
    techniques: ['HMON'], related: ['HMNI', 'HMN2'], color: '#cbd5e1',
    description: 'Hurricanes in a Multi-scale Ocean-coupled Non-hydrostatic model — superseded by HAFS in 2023',
  },
};

/** Display order: official first, then operational, then legacy. */
export const MODEL_ORDER = ['OFCL', 'HFSA', 'HFSB', 'AVNO', 'EMX', 'UKX', 'CMC', 'CTCX', 'HWRF', 'HMON'];

/** Registry ids drawn when spaghetti models are first shown. */
export const DEFAULT_MODEL_IDS = MODEL_ORDER.filter((id) => HURRICANE_MODELS[id].category !== 'legacy');

// Every technique that belongs to a registry model, raw or derived; those
// never also appear as "other guidance".
const REGISTRY_TECHNIQUES = new Set(
  MODEL_ORDER.flatMap((id) => [...HURRICANE_MODELS[id].techniques, ...HURRICANE_MODELS[id].related]),
);

export function isRegistryTechnique(tech) {
  return REGISTRY_TECHNIQUES.has(tech);
}

// ─── Other guidance ──────────────────────────────────────────────────────────
// The rest of the a-deck's track aids, offered as groups rather than one by
// one (there are 50+ per storm).

export const GUIDANCE_GROUPS = [
  { key: 'consensus', label: 'Consensus aids', color: '#a78bfa' },
  { key: 'statistical', label: 'Statistical & trajectory', color: '#e69800' },
  { key: 'ensemble', label: 'GEFS ensemble members', color: '#cbd5e1' },
  { key: 'other', label: 'Other models & ensemble means', color: '#cbd5e1' },
];

// ATCF technique → [group, display name, family]. Within a family the
// interpolated technique in EARLY_AIDS wins over the raw run.
const AIDS = {
  TVCN: ['consensus', 'TVCN consensus'], TVCE: ['consensus', 'TVCE consensus'], TVCA: ['consensus', 'TVCA consensus'],
  TVCX: ['consensus', 'TVCX consensus'], IVCN: ['consensus', 'IVCN consensus'], HCCA: ['consensus', 'HCCA consensus'],
  RVCN: ['consensus', 'RVCN consensus'], GFEX: ['consensus', 'GFS/ECMWF consensus'], FSSE: ['consensus', 'FSU superensemble'],
  NVGI: ['other', 'NAVGEM', 'navgem'], NVG2: ['other', 'NAVGEM', 'navgem'], NGX2: ['other', 'NAVGEM', 'navgem'],
  NGXI: ['other', 'NAVGEM', 'navgem'], NGX: ['other', 'NAVGEM', 'navgem'], NVGM: ['other', 'NAVGEM', 'navgem'],
  AEMI: ['other', 'GEFS mean', 'gefsmean'], AEMN: ['other', 'GEFS mean', 'gefsmean'],
  CEM2: ['other', 'Canadian ens. mean', 'cmcmean'], CEMI: ['other', 'Canadian ens. mean', 'cmcmean'], CEMN: ['other', 'Canadian ens. mean', 'cmcmean'],
  EEMN: ['other', 'ECMWF ens. mean', 'ecmean'], EMNI: ['other', 'ECMWF ens. mean', 'ecmean'],
  GDMI: ['other', 'GFDL-based mean', 'gdm'], GDM2: ['other', 'GFDL-based mean', 'gdm'], GDMN: ['other', 'GFDL-based mean', 'gdm'],
  TABS: ['statistical', 'Beta & advection (shallow)'], TABM: ['statistical', 'Beta & advection (medium)'],
  TABD: ['statistical', 'Beta & advection (deep)'], BAMS: ['statistical', 'BAM shallow'], BAMM: ['statistical', 'BAM medium'],
  BAMD: ['statistical', 'BAM deep'], CLP5: ['statistical', 'CLIPER5'], TCLP: ['statistical', 'Trajectory CLIPER'],
  XTRP: ['statistical', 'Extrapolation'], LBAR: ['statistical', 'LBAR'],
  AC00: ['ensemble', 'GEFS control'],
};
const EARLY_AIDS = new Set(['NVGI', 'NVG2', 'NGX2', 'AEMI', 'CEM2', 'CEMI', 'EMNI', 'GDMI', 'GDM2']);

// Analysis/warning records and intensity-only aids: no track of their own.
const NOT_TRACKS = new Set(['CARQ', 'WRNG', 'BEST', 'SHIP', 'DSHP', 'LGEM', 'SHF5', 'DSF5', 'OCD5', 'DRCL', 'SHFR',
  'NNIB', 'NNIC', 'RI25', 'RI30', 'RI35', 'RI40', 'ICON', 'IVDR', 'FRIA']);

export function isTrackTechnique(tech) {
  return !NOT_TRACKS.has(tech);
}

/** Technique → { group, name, family, early } for guidance outside the registry. */
export function guidanceInfo(tech) {
  const known = AIDS[tech];
  if (known) return { group: known[0], name: known[1], family: known[2] ?? null, early: EARLY_AIDS.has(tech) };
  const member = tech.match(/^AP(\d\d)$/);
  if (member) return { group: 'ensemble', name: `GEFS member ${Number(member[1])}`, family: null, early: false };
  return { group: 'other', name: tech, family: null, early: false };
}
