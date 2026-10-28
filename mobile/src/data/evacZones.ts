/**
 * Evacuation zones, as on the web's Evacuation Zones layer (src/app/hooks/useCombinedEvacZones.js):
 *   - Cal OES active zones (api/caEvacZones.js), via the web's /api/arcgis/ca-evac proxy
 *   - FEMA IPAWS CAP alerts with polygon geometry (utils/ipawsEvacGeoJSON.js), via /api/fema
 *   - reporter-drawn zones from Supabase `reporter_evac_zones` (hooks/useReporterEvacZones.js)
 * Every source degrades to "no zones" on error so one outage never blanks the others.
 */
import { WEB_API_URL } from '@/config/env';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type WarningType = 'Evacuation Order' | 'Evacuation Warning' | 'Evacuation Watch';

export interface EvacZoneProps {
  id: string;
  warningType: WarningType;
  zoneName: string;
  county: string;
  externalURL: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  instructions: string;
  source: 'hosted' | 'ipaws' | 'reporter';
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function pick(props: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function normalizeWarningType(raw: unknown): WarningType {
  if (!raw) return 'Evacuation Warning';
  const s = String(raw).trim().toLowerCase();
  if (s.includes('order') || s.includes('mandatory') || s === 'eo') return 'Evacuation Order';
  if (s.includes('watch')) return 'Evacuation Watch';
  return 'Evacuation Warning';
}

function arcgisTimestamp(date: Date): string {
  return `TIMESTAMP '${date.toISOString().replace('T', ' ').substring(0, 19)}'`;
}

async function fetchCalOesZones(): Promise<GeoJSON.Feature[]> {
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const params = [
    ['where', `EDIT_DATE > ${arcgisTimestamp(cutoff)}`],
    ['outFields', '*'],
    ['f', 'geojson'],
    ['outSR', '4326'],
    ['resultRecordCount', '2000'],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`${WEB_API_URL}/arcgis/ca-evac/0/query?${params}`);
  if (!res.ok) throw new Error(`Cal OES HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error || !Array.isArray(data?.features)) throw new Error('Cal OES error');
  return data.features
    .filter((f: any) => f?.geometry)
    .map((f: any, i: number) => {
      const p = f.properties || {};
      const props: EvacZoneProps = {
        id: String(pick(p, 'OBJECTID', 'ObjectID', 'GlobalID', 'globalid') ?? `hosted-${i}`),
        zoneName: pick(p, 'ZONE_NAME', 'ZoneName', 'zone_name', 'Name', 'name', 'ExZoneName') || pick(p, 'ZONE_ID', 'ZoneID') || 'Evacuation Zone',
        warningType: normalizeWarningType(
          pick(p, 'STATUS', 'Status', 'status', 'WarningType', 'warning_type', 'EvacStatus', 'evac_status', 'Type', 'type', 'ExZoneStatus'),
        ),
        county: pick(p, 'COUNTY', 'County', 'county', 'CountyName', 'county_name') || '',
        externalURL: pick(p, 'ExternalURL', 'external_url', 'URL', 'url', 'MoreInfo') || '',
        effectiveDate: pick(p, 'EditDate', 'EDIT_DATE', 'EffectiveDate', 'effective_date', 'DateEffective') || null,
        expirationDate: pick(p, 'ExpirationDate', 'expiration_date', 'DateExpires') || null,
        instructions: '',
        source: 'hosted',
      };
      return { type: 'Feature', id: `hosted-${props.id}`, geometry: f.geometry, properties: props };
    });
}

function classifyIpawsSeverity(event: string | null, headline: string | null): WarningType {
  const combined = [event, headline].filter(Boolean).join(' ').toLowerCase();
  if (/\border\b|\bmandatory\b|\bimmediate\b|\bleave now\b/i.test(combined)) return 'Evacuation Order';
  if (/\bwatch\b|\bpotential\b/i.test(combined)) return 'Evacuation Watch';
  return 'Evacuation Warning';
}

async function fetchIpawsZones(): Promise<GeoJSON.Feature[]> {
  const res = await fetch(`${WEB_API_URL}/fema`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`IPAWS HTTP ${res.status}`);
  const data = await res.json();
  const now = Date.now();
  const features: GeoJSON.Feature[] = [];
  for (const alert of data?.alerts ?? []) {
    if (!alert?.identifier) continue;
    const msgType = String(alert.msgType ?? alert.messageType ?? '').toLowerCase();
    const status = String(alert.status ?? '').toLowerCase();
    if (msgType === 'cancel' || ['cancelled', 'canceled', 'test', 'exercise', 'draft'].includes(status)) continue;
    const infos: any[] = Array.isArray(alert.infos) ? alert.infos : [];
    const expires = Date.parse(infos[0]?.expires || alert.expires || '');
    if (Number.isFinite(expires) && expires <= now) continue;
    infos.forEach((info, i) => {
      (Array.isArray(info.areas) ? info.areas : []).forEach((area: any, j: number) => {
        const geom = area?.geometry;
        if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') || !geom.coordinates?.length) return;
        const headline = info.headline || info.event || 'IPAWS alert';
        const props: EvacZoneProps = {
          id: `ipaws-${alert.identifier}-${i}-${j}`,
          warningType: classifyIpawsSeverity(info.event, info.headline),
          zoneName: area.areaDesc ? `${headline} — ${area.areaDesc}` : headline,
          county: area.areaDesc || '',
          externalURL: '',
          effectiveDate: info.sent || alert.sent || null,
          expirationDate: info.expires || null,
          instructions: info.instruction || '',
          source: 'ipaws',
        };
        features.push({ type: 'Feature', id: props.id, geometry: geom, properties: props });
      });
    });
  }
  return features;
}

async function fetchReporterZones(): Promise<GeoJSON.Feature[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('reporter_evac_zones')
    .select('id, title, description, zone_type, geometry, county, effective_at, expires_at')
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter(z => z.geometry?.type)
    .map(z => {
      const props: EvacZoneProps = {
        id: String(z.id),
        warningType: normalizeWarningType(z.zone_type),
        zoneName: z.title || 'Evacuation Zone',
        county: z.county || '',
        externalURL: '',
        effectiveDate: z.effective_at,
        expirationDate: z.expires_at,
        instructions: z.description || '',
        source: 'reporter',
      };
      return { type: 'Feature', id: `reporter-${z.id}`, geometry: z.geometry, properties: props };
    });
}

export async function loadEvacZones(): Promise<GeoJSON.FeatureCollection> {
  const results = await Promise.allSettled([fetchCalOesZones(), fetchIpawsZones(), fetchReporterZones()]);
  const features = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  return features.length ? { type: 'FeatureCollection', features } : EMPTY;
}
