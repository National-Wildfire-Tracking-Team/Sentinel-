/**
 * NWS alerts. The nationwide list comes from the AWS nws-alerts snapshot (the same normalized
 * api.weather.gov alerts the web's useWeatherAlerts builds); alerts at a tapped point come from
 * api.weather.gov directly, since most alerts are zone-based and carry no polygon of their own.
 */
import { ENV } from '@/config/env';

const SNAPSHOT_URL = `${ENV.dataServicesUrl}/nws-alerts/v1/alerts`;
const NWS_HEADERS = { Accept: 'application/geo+json', 'User-Agent': 'Sentinel iOS (nationalwildfiretrackingteam.org)' };

export interface WeatherAlert {
  id: string;
  event: string;
  headline: string;
  severity: string;
  urgency: string;
  area: string;
  sender: string;
  effective: string | null;
  expires: string | null;
  description: string;
  instruction: string;
}

const SEVERITY_RANK: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

export function sortAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 5) - (SEVERITY_RANK[b.severity] ?? 5) || a.event.localeCompare(b.event),
  );
}

/** Active nationwide alerts, most severe first. */
export async function fetchAlerts(): Promise<WeatherAlert[]> {
  const res = await fetch(SNAPSHOT_URL);
  if (!res.ok) throw new Error(`Alerts unavailable (HTTP ${res.status})`);
  const body = await res.json();
  if (body?.schemaVersion !== 1 || !Array.isArray(body.alerts)) throw new Error('Unexpected alerts format');
  return sortAlerts(
    body.alerts.map((a: any) => ({
      id: a.id,
      event: a.type ?? a.event ?? 'Alert',
      headline: a.headline ?? '',
      severity: a.severity ?? 'Unknown',
      urgency: a.urgency ?? '',
      area: a.affectedArea ?? '',
      sender: a.senderName ?? '',
      effective: a.effective ?? a.sent ?? null,
      expires: a.expires ?? null,
      description: a.description ?? '',
      instruction: a.instruction ?? '',
    })),
  );
}

/** Alerts in effect at a point (api.weather.gov). */
export async function fetchAlertsAtPoint(lat: number, lng: number): Promise<WeatherAlert[]> {
  const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`, { headers: NWS_HEADERS });
  if (!res.ok) return [];
  const body = await res.json();
  return sortAlerts(
    (body?.features ?? []).map((f: any) => {
      const p = f.properties ?? {};
      return {
        id: p.id ?? f.id,
        event: p.event ?? 'Alert',
        headline: p.headline ?? '',
        severity: p.severity ?? 'Unknown',
        urgency: p.urgency ?? '',
        area: p.areaDesc ?? '',
        sender: p.senderName ?? '',
        effective: p.effective ?? p.sent ?? null,
        expires: p.expires ?? p.ends ?? null,
        description: p.description ?? '',
        instruction: p.instruction ?? '',
      };
    }),
  );
}
