/**
 * nhcTextProducts.js
 * NHC's per-storm text products, read from the NWS API
 * (api.weather.gov/products/types/{TYPE}/locations/{slot}/latest, via the
 * /api/wx edge proxy), and parsed into the pieces the hurricane panel shows:
 *
 *   TCP  public advisory      nearest place, watches & warnings by area,
 *                             wind field, hazards (surge, rainfall), next advisory
 *   TCD  forecast discussion  discussion paragraphs, key messages, per-tau notes
 *   TCM  forecast advisory    eye diameter
 *   PWS  wind probabilities   per-location 34/50/64-kt chances
 *
 * A storm slot is reused by later storms, so a product only counts when it
 * names the storm's ATCF id (e.g. EP182026). Parsers never throw; anything
 * they can't read comes back null/empty.
 */

import { fetchWithCache } from '../utils/dataCache';

const BASE = '/api/wx/products/types';
const TTL_MS = 10 * 60 * 1000;
export const NHC_TEXT_TYPES = ['TCP', 'TCD', 'TCM', 'PWS'];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SMALL_WORDS = new Set(['of', 'the', 'and', 'to', 'in', 'on', 'at', 'de', 'del', 'la', 'el', 'los', 'las']);

const lines = (text) => String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.trimEnd());
const isBlank = (l) => l.trim() === '';

/**
 * "SOUTHERN TIP OF BAJA CALIFORNIA" → "Southern Tip of Baja California";
 * keeps "U.S." and "20N 120W". `midSentence` keeps a leading "the" lowercase.
 */
export function titleCase(text, { midSentence = false } = {}) {
  return String(text ?? '').toLowerCase().split(/(\s+|-)/).map((w, i) => {
    if (!/[a-z]/.test(w) || /\d/.test(w)) return w.toUpperCase();
    if (/^([a-z]\.)+$/.test(w)) return w.toUpperCase();
    if ((i > 0 || midSentence) && SMALL_WORDS.has(w)) return w;
    return w[0].toUpperCase() + w.slice(1);
  }).join('');
}

/** "200 PM PDT" → "2:00 PM PDT". */
function formatClock(hhmm, ampm, tz) {
  const s = String(hhmm).padStart(3, '0');
  return `${Number(s.slice(0, -2))}:${s.slice(-2)} ${ampm.toUpperCase()} ${tz.toUpperCase()}`;
}

/** Advisory date ("800 AM PDT Tue Oct 06 2026") in the storm's own time: "Oct 6, 8:00 AM PDT". */
export function formatAdvisoryLocal(advisoryDate) {
  const m = String(advisoryDate ?? '').trim()
    .match(/^(\d{3,4})\s+(AM|PM)\s+([A-Z]{2,4})\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+\d{4}$/i);
  if (!m || !MONTHS.includes(m[4].toUpperCase())) return null;
  const month = m[4][0].toUpperCase() + m[4].slice(1).toLowerCase();
  return `${month} ${Number(m[5])}, ${formatClock(m[1], m[2], m[3])}`;
}

/** Paragraphs (blank-line separated, wrapped lines joined). */
function paragraphs(block) {
  const out = [];
  let current = [];
  for (const l of block) {
    if (isBlank(l)) {
      if (current.length) out.push(current.join(' '));
      current = [];
    } else current.push(l.trim());
  }
  if (current.length) out.push(current.join(' '));
  return out;
}

// ─── TCP: public advisory ────────────────────────────────────────────────────

/** TCP sections by heading (a line underlined with dashes). */
function tcpSections(text) {
  const ls = lines(text);
  const sections = {};
  let current = null;
  for (let i = 0; i < ls.length; i += 1) {
    if (/^-{3,}$/.test(ls[i + 1]?.trim() ?? '') && !isBlank(ls[i])) {
      current = ls[i].trim().toUpperCase();
      sections[current] = [];
      i += 1;
      continue;
    }
    if (ls[i].trim() === '$$') current = null;
    if (current) sections[current].push(ls[i]);
  }
  return sections;
}

/**
 * Watches and warnings in effect, by type with their areas:
 * [{ type: 'Hurricane Watch', areas: ['Ensenada to the U.S./Mexico border'] }].
 * [] when the advisory says none are in effect; null when it doesn't say.
 */
function parseWatchWarnings(block) {
  const text = block.join('\n');
  if (/no coastal watches or warnings in effect/i.test(text)) return [];
  const summaryAt = text.search(/SUMMARY OF WATCHES AND WARNINGS IN EFFECT/i);
  if (summaryAt < 0) return null;
  const summary = lines(text.slice(summaryAt));
  const result = [];
  let entry = null;
  for (const l of summary) {
    const head = l.match(/^An?\s+(.+?)\s+is in effect for/i);
    if (head) {
      entry = { type: titleCase(head[1]), areas: [] };
      result.push(entry);
    } else if (entry && /^\s*\*/.test(l)) {
      entry.areas.push(l.replace(/^\s*\*\s*/, '').trim());
    } else if (entry && !isBlank(l) && entry.areas.length && !/^(For |Interests |A |An )/.test(l.trim())) {
      // A bullet that wrapped onto the next line.
      entry.areas[entry.areas.length - 1] += ` ${l.trim()}`;
    } else if (isBlank(l)) {
      entry = entry && entry.areas.length ? null : entry;
    }
  }
  return result.filter((r) => r.areas.length);
}

/** HAZARDS AFFECTING LAND → { 'storm surge': '...', rainfall: '...', ... } (raw text, line breaks kept). */
function parseHazards(block) {
  const hazards = {};
  let key = null;
  for (const l of block) {
    const m = l.match(/^([A-Z][A-Z /-]+):\s*(.*)$/);
    if (m) {
      key = m[1].trim().toLowerCase();
      hazards[key] = m[2];
    } else if (key) {
      hazards[key] += `\n${l.trim()}`;
    }
  }
  for (const k of Object.keys(hazards)) hazards[k] = hazards[k].trim();
  return hazards;
}

/** Storm surge text → peak heights by area ([{ area, minFt, maxFt }]) and the prose around them. */
export function parseSurge(text) {
  const rows = [];
  const prose = [];
  for (const l of lines(text)) {
    const m = l.trim().match(/^(.+?)\.{3}\s*(\d+)\s*(?:-|to)\s*(\d+)\s*ft\.?$/i);
    if (m) rows.push({ area: m[1].trim(), minFt: Number(m[2]), maxFt: Number(m[3]) });
    else prose.push(l);
  }
  return { rows, text: paragraphs(prose).join('\n\n') };
}

export function parseTcp(text) {
  const sections = tcpSections(text);
  const summary = (sections[Object.keys(sections).find((k) => k.startsWith('SUMMARY OF'))] ?? []).map((l) => l.trim());
  const placeLine = summary.find((l) => /^ABOUT \d+ MI/.test(l));
  const place = placeLine?.match(/^ABOUT (\d+) MI\.{3}\d+ KM ([NSEW]{1,3}) OF (.+)$/);

  const discussion = (sections['DISCUSSION AND OUTLOOK'] ?? []).join(' ').replace(/\s+/g, ' ');
  const hurricaneMi = discussion.match(/Hurricane-force winds extend outward up to (\d+) miles/i);
  const tsMi = discussion.match(/tropical-storm-force winds extend outward up to (\d+) miles/i);

  const next = (sections['NEXT ADVISORY'] ?? []).join(' ')
    .match(/Next (intermediate |complete )?advisory at (\d{3,4}) (AM|PM) ([A-Z]{3,4})/i);

  const hazards = parseHazards(sections['HAZARDS AFFECTING LAND'] ?? []);
  return {
    place: place ? `${place[1]} mi ${place[2]} of ${titleCase(place[3], { midSentence: true })}` : null,
    watchWarnings: parseWatchWarnings(sections['WATCHES AND WARNINGS'] ?? []),
    windExtentMi: {
      ...(tsMi ? { 34: Number(tsMi[1]) } : {}),
      ...(hurricaneMi ? { 64: Number(hurricaneMi[1]) } : {}),
    },
    nextAdvisory: next
      ? `Next ${next[1] ? next[1].trim().toLowerCase() : ''} advisory at ${formatClock(next[2], next[3], next[4])}`.replace(/\s+/g, ' ')
      : null,
    surge: hazards['storm surge'] ? parseSurge(hazards['storm surge']) : null,
    rainfall: hazards.rainfall ? paragraphs(lines(hazards.rainfall)).join('\n\n') : null,
  };
}

// ─── TCD: forecast discussion ────────────────────────────────────────────────

const TAU_NOTES = { INLAND: 'inland', 'POST-TROPICAL': 'post-tropical', 'POST-TROP/EXTRATROP': 'post-tropical', 'POST-TROP/REMNT LOW': 'remnant low', DISSIPATED: 'dissipated' };

export function parseTcd(text) {
  const ls = lines(text);
  const start = ls.findIndex((l) => /^\d{3,4} (AM|PM) [A-Z]{2,4} \w{3} \w{3} \d{1,2} \d{4}$/i.test(l.trim()));
  if (start < 0) return null;
  const tableAt = ls.findIndex((l, i) => i > start && /^FORECAST POSITIONS AND MAX WINDS/i.test(l.trim()));
  const endAt = ls.findIndex((l, i) => i > start && l.trim() === '$$');
  const body = ls.slice(start + 1, tableAt > 0 ? tableAt : endAt > 0 ? endAt : undefined);

  const paras = paragraphs(body);
  const keyAt = paras.findIndex((p) => /^KEY MESSAGES:?$/i.test(p));
  const discussion = keyAt >= 0 ? paras.slice(0, keyAt) : paras;
  const keyMessages = keyAt >= 0 ? paras.slice(keyAt + 1).filter((p) => /^\d+\./.test(p)).map((p) => p.replace(/^\d+\.\s*/, '')) : [];

  const notes = {};
  for (const l of tableAt > 0 ? ls.slice(tableAt) : []) {
    const m = l.trim().match(/^(INIT|\d+H)\s+\d{2}\/\d{4}Z\s+.*?(?:\.{3}(.+))?$/);
    if (m?.[2]) notes[m[1] === 'INIT' ? 0 : Number(m[1].slice(0, -1))] = TAU_NOTES[m[2].trim()] ?? m[2].trim().toLowerCase();
  }
  return { discussion, keyMessages, tauNotes: notes };
}

// ─── TCM: forecast advisory ──────────────────────────────────────────────────

export function parseTcm(text) {
  const eye = String(text ?? '').match(/EYE DIAMETER\s+(\d+)\s*NM/i);
  return { eyeDiameterNm: eye ? Number(eye[1]) : null };
}

// ─── PWS: wind speed probabilities ───────────────────────────────────────────

const probValue = (v) => (v === 'X' ? 0 : Number(v));

/**
 * Per-location cumulative chances by forecast hour:
 * [{ location, kt, cumulative: { 12: 99, 24: 99, ..., 120: 99 } }].
 * 0 stands for NHC's "X" (less than 1 percent).
 */
export function parsePws(text) {
  const ls = lines(text);
  const hoursLine = ls.find((l) => /^FORECAST HOUR/i.test(l.trim()));
  const hours = [...(hoursLine ?? '').matchAll(/\((\d+)\)/g)].map((m) => Number(m[1]));
  if (hours.length === 0) return [];
  const startAt = ls.findIndex((l) => /^LOCATION\s+KT/i.test(l.trim()));
  const rows = [];
  for (const l of ls.slice(startAt + 1)) {
    if (l.trim() === '$$') break;
    const m = l.match(/^(\S.*?)\s+(34|50|64)\s+(X|\d+)\s+(.*)$/);
    if (!m) continue;
    const later = [...m[4].matchAll(/(X|\d+)\(\s*(X|\d+)\)/g)].map((p) => probValue(p[2]));
    const values = [probValue(m[3]), ...later];
    if (values.length !== hours.length) continue;
    rows.push({
      location: titleCase(m[1].trim()),
      kt: Number(m[2]),
      cumulative: Object.fromEntries(hours.map((h, i) => [h, values[i]])),
    });
  }
  return rows;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

const PARSERS = { TCP: parseTcp, TCD: parseTcd, TCM: parseTcm, PWS: parsePws };

async function fetchProduct(type, slot, atcfId) {
  try {
    const data = await fetchWithCache(`${BASE}/${type}/locations/${slot}/latest`, `nhc-text:${type}:${slot}`, {}, TTL_MS);
    const text = data?.productText;
    if (!text || !text.toUpperCase().includes(atcfId.toUpperCase())) return null;
    return PARSERS[type](text);
  } catch {
    return null;
  }
}

/**
 * The storm's latest TCP/TCD/TCM/PWS, parsed. A product that's missing,
 * fails, or belongs to another storm in the same slot comes back null.
 * Never throws.
 */
export async function fetchNhcTextProducts({ slot, atcfId }) {
  if (!slot || !atcfId) return { tcp: null, tcd: null, tcm: null, pws: null };
  const [tcp, tcd, tcm, pws] = await Promise.all(NHC_TEXT_TYPES.map((t) => fetchProduct(t, slot, atcfId)));
  return { tcp, tcd, tcm, pws };
}
