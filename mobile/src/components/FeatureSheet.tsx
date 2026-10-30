/**
 * Detail for a tapped map feature, after the web's panels (HotspotDetail, CameraPanel,
 * WaterGaugePanel, TfrDetail, AwcDetail, the Fire Danger point inspection and the MapFeaturePopup
 * records). Layers the web leaves without a popup (GOES detections, historical perimeters, smoke,
 * RAWS, AirNow monitors, land ownership) get a short reading here.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';

import { SFP_CLASSES, type FuelSample } from '@/data/fireDanger';
import { AQI_CATEGORIES, FIRMS_FEED_LABEL, FRAP_CAUSES, frpIntensity } from '@/data/fireLayers';
import {
  AWC_HAZARD_LABEL,
  FLOOD_CATEGORY_LABEL,
  aqiCategory,
  fetchGaugeDetail,
  fetchMetarDetail,
  fetchTfrDetail,
  type GaugeDetail,
  type MetarDetail,
  type TfrDetail,
} from '@/data/monitoringLayers';
import { HAZARD_CATEGORY_LABELS } from '@/hooks/useHazardEvents';
import { FLIGHT_CATEGORY_COLORS, FLOOD_COLORS } from '@/map/featureStyles';
import { accent, fire, radius, sentinel, sentinelText } from '@/theme';
import { formatDateTime, formatRelative } from '@/utils/format';
import { GaugeChart, THRESHOLD_COLORS } from './GaugeChart';

export interface FeatureSelection {
  sourceKey: string;
  properties: Record<string, any>;
  lng: number;
  lat: number;
}

type Rows = [string, string | number | null | undefined][];

export function FeatureSheet({ selection, onClose }: { selection: FeatureSelection; onClose: () => void }) {
  const p = selection.properties;
  const [now] = useState(() => Date.now());
  let body: React.ReactNode;
  let title = '';
  let subtitle: string | null = null;

  switch (selection.sourceKey) {
    case 'hazardEvents':
      title = p.title || 'Event report';
      subtitle = `Event report · ${HAZARD_CATEGORY_LABELS[p.category] ?? 'Hazard'} · NWTT field reporter`;
      body = (
        <>
          <RowList
            rows={[
              ['Severity', p.severity ? String(p.severity).replace(/^\w/, (c: string) => c.toUpperCase()) : null],
              ['Reported', p.created_at ? `${formatDateTime(p.created_at)} (${formatRelative(p.created_at)})` : null],
            ]}
          />
          {p.description ? <Text style={styles.body}>{p.description}</Text> : null}
          <Text style={styles.note}>Posted by an NWTT field reporter. Verify with official sources before taking action.</Text>
        </>
      );
      break;

    case 'fireHotspots': {
      const frp = Number(p.frp) || 0;
      title = 'Fire Hotspot Detection';
      subtitle = `NASA FIRMS · ${p.satellite ?? ''} · Feed: ${FIRMS_FEED_LABEL[p.source] ?? p.source}`;
      body = (
        <>
          <View style={styles.cards}>
            <Stat label="Peak FRP" value={`${frp.toFixed(1)} MW`} color={frp >= 200 ? '#f87171' : frp >= 100 ? '#fb923c' : '#facc15'} />
            <Stat label="Intensity" value={frpIntensity(frp)} />
          </View>
          <View style={styles.cards}>
            <Stat label="Brightness" value={p.brightness != null ? `${Number(p.brightness).toFixed(1)} K` : '–'} />
            <Stat label="Confidence" value={String(p.confidence ?? 'nominal').replace(/^\w/, c => c.toUpperCase())} />
          </View>
          <RowList
            rows={[
              ['Detected', p.acq_date ? `${p.acq_date} at ${String(p.acq_time).slice(0, 2)}:${String(p.acq_time).slice(2)} UTC` : null],
              ['Pass', p.daynight === 'N' ? 'Nighttime detection' : p.daynight === 'D' ? 'Daytime detection' : null],
            ]}
          />
          <Text style={styles.footnote}>
            Fire Radiative Power (FRP) measures the radiant heat output of a fire in megawatts. Higher FRP indicates more intense burning and
            larger smoke production.
          </Text>
        </>
      );
      break;
    }

    case 'ngfsDetections':
      title = p.known_incident_name || 'GOES Fire Detection';
      subtitle = ['NOAA NESDIS NGFS', p.satellite].filter(Boolean).join(' · ');
      body = (
        <RowList
          rows={[
            ['Type', p.type_description],
            ['FRP', p.frp != null ? `${Number(p.frp).toFixed(1)} MW` : null],
            ['Confidence', p.confidence],
            ['Detected', p.acq_date_time ? formatDateTime(p.acq_date_time) : null],
            ['Pass', p.daynight === 'N' ? 'Nighttime' : p.daynight === 'D' ? 'Daytime' : null],
            ['Location', [p.county, p.state].filter(Boolean).join(', ')],
          ]}
        />
      );
      break;

    case 'calFireHistoricalPerimeters':
      title = `${p.FireName}${p.FireYear ? ` (${p.FireYear})` : ''}`;
      subtitle = 'Historical fire perimeter · CAL FIRE FRAP';
      body = (
        <RowList
          rows={[
            ['Acres', p.GISAcres != null ? Math.round(p.GISAcres).toLocaleString() : null],
            ['Started', p.AlarmDate ? new Date(p.AlarmDate).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null],
            ['Contained', p.ContainedDate ? new Date(p.ContainedDate).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null],
            ['Cause', p.Cause != null ? (FRAP_CAUSES[Number(p.Cause)] ?? String(p.Cause)) : null],
            ['Agency', [p.Agency, p.UnitId].filter(Boolean).join(' · ')],
            ['Incident number', p.IncidentNum],
          ]}
        />
      );
      break;

    case 'ndgdSmokeForecast':
      title = 'Smoke concentration';
      subtitle = 'NOAA NDGD hourly smoke forecast';
      body = (
        <RowList
          rows={[
            ['Near-surface smoke', p.smoke_classdesc ? `${p.smoke_classdesc} µg/m³` : null],
            ['Valid', p.todate ? new Date(Number(p.todate)).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null],
          ]}
        />
      );
      break;

    case 'aqi': {
      const cat = AQI_CATEGORIES[Number(p.gridcode) - 1];
      title = cat?.label ?? 'Air quality';
      subtitle = 'EPA AirNow · latest AQI contours';
      body = (
        <>
          {cat ? (
            <View style={[styles.levelCard, { backgroundColor: `${cat.color}2e` }]}>
              <View style={[styles.pillDot, { backgroundColor: cat.color, width: 14, height: 14, borderRadius: 7 }]} />
              <Text style={styles.levelText}>{cat.label}</Text>
            </View>
          ) : null}
          <RowList rows={[['Updated', p.Timestamp ? formatRelative(new Date(p.Timestamp)) : null]]} />
        </>
      );
      break;
    }

    case 'fireRiskOutlook': {
      const cls = p.sfpClass ? SFP_CLASSES[p.sfpClass as keyof typeof SFP_CLASSES] : null;
      title = '7-day significant fire potential';
      subtitle = 'NWCG Predictive Services · official forecast';
      body = (
        <>
          <View style={[styles.levelCard, { backgroundColor: `${p.sfpColor}2e` }]}>
            <View style={[styles.pillDot, { backgroundColor: p.sfpColor, width: 14, height: 14, borderRadius: 7 }]} />
            <Text style={[styles.levelText, { flex: 1 }]}>{p.sfpLabel}</Text>
          </View>
          {cls?.detail ? <Text style={styles.body}>{cls.detail}</Text> : null}
          <RowList
            rows={[
              ['Forecast day', `Day ${p.day}${p.forecastDate ? ` · ${p.forecastDate}` : ''}`],
              ['Predictive Service Area', p.psa],
              ['Geographic area', p.gacc],
            ]}
          />
          <LinkRow label="NWCG Predictive Services outlooks" url="https://www.nifc.gov/nicc/predictive-services/outlooks" />
        </>
      );
      break;
    }

    case 'fireDangerStations':
      title = [p.name, p.state].filter(Boolean).join(', ');
      subtitle = `NFDRS station${p.observedDate ? ` · observed ${p.observedDate}` : ''}${p.qa && p.qa !== '0' ? ` · FEMS QA flag ${p.qa}` : ''}`;
      body = p.stale ? (
        <Text style={styles.body}>This station has no observed day in the last few days, so its values aren’t shown.</Text>
      ) : (
        <>
          <RowList
            rows={[
              ['Energy Release Component', fmt1(p.erc)],
              ['Burning Index', fmt1(p.bi)],
              ['Spread Component', fmt1(p.sc)],
              ['Ignition Component', p.ic != null ? `${fmt1(p.ic)}%` : null],
              ['1-hour dead fuel moisture', pct(p.fm1)],
              ['10-hour dead fuel moisture', pct(p.fm10)],
              ['100-hour dead fuel moisture', pct(p.fm100)],
              ['1000-hour dead fuel moisture', pct(p.fm1000)],
              ['Keetch-Byram Drought Index', fmt1(p.kbdi)],
              ['ERC change, past 7 days', signed(p.ercChange7d)],
              ['100-h moisture change, 7 days', p.fm100Change7d != null ? `${signed(p.fm100Change7d)}%` : null],
              ['Forecast peak ERC, next 7 days', fmt1(p.forecastPeakErc)],
            ]}
          />
          <Text style={styles.sectionTitle}>Live fuel moisture · modelled, not measured</Text>
          <RowList
            rows={[
              ['Herbaceous', pct(p.herbFM)],
              ['Woody', pct(p.woodyFM)],
            ]}
          />
          <LinkRow label="USDA Forest Service FEMS" url="https://fems.fs2c.usda.gov" />
        </>
      );
      break;

    case 'lfmSamples': {
      let fuels: FuelSample[] = [];
      try {
        fuels = JSON.parse(p.fuels ?? '[]');
      } catch {
        fuels = [];
      }
      title = [p.name, p.state].filter(Boolean).join(', ');
      subtitle = `Live fuel moisture samples · measured${p.elevation ? ` · ${Math.round(p.elevation).toLocaleString()} ft` : ''}`;
      body = (
        <>
          <RowList
            rows={fuels.map(f => [
              `${f.fuel}${f.part ? ` (${f.part})` : ''} · ${f.date} (${Math.max(0, Math.round((now - Date.parse(f.date)) / 86_400_000))} d ago)`,
              `${Math.round(f.value)}%${f.implausible ? ' ⚠' : ''}`,
            ])}
          />
          <LinkRow label="FEMS fuel moisture samples · NWCC" url="https://gacc.nifc.gov/nwcc/" />
        </>
      );
      break;
    }

    case 'rawsStations':
      title = p.stationName;
      subtitle = ['RAWS', p.stationId, p.agency].filter(Boolean).join(' · ');
      body = (
        <>
          <RowList
            rows={[
              ['Temperature', p.temp != null ? `${Math.round(p.temp)}°F` : null],
              ['Humidity', p.relHumidity != null ? `${Math.round(p.relHumidity)}%` : null],
              ['Wind', p.windSpeed != null ? `${Math.round(p.windSpeed)} mph${p.windDir != null ? ` from ${compass(p.windDir)}` : ''}` : null],
              ['Peak gust', p.windSpeedPeak != null ? `${Math.round(p.windSpeedPeak)} mph` : null],
              ['Fuel moisture', p.fuelMoisture != null ? `${p.fuelMoisture}%` : null],
              ['Fuel temperature', p.fuelTemp != null ? `${Math.round(p.fuelTemp)}°F` : null],
              ['Rain (accum.)', p.precip != null ? `${p.precip} in` : null],
              ['Elevation', p.elevation != null ? `${Math.round(p.elevation).toLocaleString()} ft` : null],
              ['Location', [p.county, p.state].filter(Boolean).join(', ')],
              ['Observed', p.observationTime ? formatRelative(new Date(p.observationTime)) : null],
            ]}
          />
          {p.noaaUrl ? <LinkRow label="Station page" url={p.noaaUrl} /> : null}
        </>
      );
      break;

    case 'airNowMonitors': {
      title = p.siteName;
      subtitle = ['EPA AirNow', p.stateName].filter(Boolean).join(' · ');
      const aqi = typeof p.aqi === 'number' ? p.aqi : null;
      body = (
        <>
          <View style={[styles.levelCard, { backgroundColor: `${aqiColor(aqi)}2e` }]}>
            <Text style={styles.bigValue}>{aqi ?? '–'}</Text>
            <View>
              <Text style={styles.levelText}>Air Quality Index</Text>
              <Text style={styles.levelSub}>{aqiCategory(aqi)}</Text>
            </View>
          </View>
          <RowList
            rows={[
              ['PM2.5 AQI', p.pm25Aqi],
              ['PM10 AQI', p.pm10Aqi],
              ['Ozone AQI', p.ozoneAqi],
              ['Monitor', p.monitorType],
              ['Updated', p.localTime],
            ]}
          />
        </>
      );
      break;
    }

    case 'wildfireCameras':
      title = p.name;
      subtitle = [p.route, p.direction].filter(Boolean).join(' · ') || p.nearbyPlace;
      body = <CameraView camera={p} />;
      break;

    case 'waterGauges':
      title = p.name + (p.datum ? ` (in ${p.datum})` : '');
      subtitle = [p.state, p.hsa ? `HSA ${p.hsa}` : null].filter(Boolean).join(' · ');
      body = <GaugeView gauge={p} />;
      break;

    case 'tfrs':
      title = `FDC ${p.notam}`;
      subtitle = `${p.typeLabel} TFR`;
      body = <TfrView tfr={p} />;
      break;

    case 'awcMetars':
      title = p.id;
      subtitle = 'METAR · TAF';
      body = <MetarView id={p.id} />;
      break;

    case 'awcAdvisories':
      title = `${p.kind === 'CWA' ? 'Center Weather Advisory' : 'SIGMET'} · ${AWC_HAZARD_LABEL[p.hz] ?? p.hazard ?? 'Advisory'}`;
      subtitle = p.issuer;
      body = (
        <>
          <RowList
            rows={[
              ['Valid from', p.validFrom ? formatDateTime(p.validFrom) : null],
              ['Valid until', p.validTo ? formatDateTime(p.validTo) : null],
              ['Altitudes', p.base != null || p.top != null ? `${p.base ?? 'SFC'} – ${p.top ?? '?'} ft` : null],
              ['Qualifier', p.qualifier],
            ]}
          />
          {p.raw ? <Text style={styles.mono}>{p.raw}</Text> : null}
        </>
      );
      break;

    case 'schoolsUniversities':
      title = p.name || 'School / University';
      subtitle = 'School / University · USGS National Map';
      body = <RowList rows={[['Address', [p.address, p.city, p.state, p.zipcode].filter(Boolean).join(', ')]]} />;
      break;

    case 'criticalInfrastructure':
      if (p.kind === 'power') {
        title = p.ID ? `Line ${p.ID}` : 'Transmission line';
        subtitle = 'Electric power transmission · CMRA';
        body = (
          <RowList
            rows={[
              ['Voltage', p.VOLTAGE != null && p.VOLTAGE > 0 ? `${p.VOLTAGE} kV` : null],
              ['Voltage class', p.VOLT_CLASS],
              ['Line type', p.TYPE],
              ['Status', p.STATUS],
              ['Owner', p.OWNER],
              ['Source', p.SOURCE],
            ]}
          />
        );
      } else {
        title = p.Operator || 'Natural gas pipeline';
        subtitle = 'Natural gas pipeline · EIA';
        body = (
          <RowList
            rows={[
              ['Interstate / intrastate', p.TYPEPIPE],
              ['Operator', p.Operator],
              ['Status', p.Status],
            ]}
          />
        );
      }
      break;

    case 'landOwnership':
      title = p.Own_Agency || p.Own_Level || 'Public land';
      subtitle = 'Land ownership · CAL FIRE FRAP';
      body = (
        <RowList
          rows={[
            ['Ownership', p.Own_Level],
            ['Agency', p.Own_Agency],
            ['Group', p.Own_Group],
          ]}
        />
      );
      break;

    default:
      title = 'Map feature';
      body = null;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <X size={18} color={sentinelText[200]} />
        </Pressable>
      </View>
      {body}
      <Text style={styles.coords}>
        {selection.lat.toFixed(4)}°, {selection.lng.toFixed(4)}°
      </Text>
    </ScrollView>
  );
}

function RowList({ rows }: { rows: Rows }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (visible.length === 0) return null;
  return (
    <View>
      {visible.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

const fmt1 = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : null);
const pct = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 10) / 10}%` : null);
const signed = (v: unknown) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}` : null);

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)} style={styles.linkRow} accessibilityRole="link">
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}33`, borderColor: `${color}88` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

function aqiColor(aqi: number | null): string {
  if (aqi == null) return '#9ca3af';
  if (aqi <= 50) return '#00e400';
  if (aqi <= 100) return '#ffff00';
  if (aqi <= 150) return '#ff7e00';
  if (aqi <= 200) return '#ff0000';
  if (aqi <= 300) return '#8f3f97';
  return '#7e0023';
}

/** Fetch once per id; keeps the last value and error. */
function useDetail<T>(id: string, load: (id: string) => Promise<T>) {
  const [state, setState] = useState<{ id: string; value: T | null; error: string | null }>({ id, value: null, error: null });
  useEffect(() => {
    let cancelled = false;
    load(id)
      .then(value => !cancelled && setState({ id, value, error: null }))
      .catch(err => !cancelled && setState({ id, value: null, error: err?.message || 'Unavailable' }));
    return () => {
      cancelled = true;
    };
  }, [id, load]);
  return state.id === id ? state : { id, value: null, error: null };
}

function Loading({ message }: { message: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={fire[500]} />
      <Text style={styles.subtitle}>{message}</Text>
    </View>
  );
}

function CameraView({ camera }: { camera: Record<string, any> }) {
  // Refresh the still on the camera's own cadence (at least every 15 s), like CameraPanel.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const ms = Math.max(15_000, (camera.updateFrequencyMin || 1) * 60_000);
    const timer = setInterval(() => setTick(Date.now()), ms);
    return () => clearInterval(timer);
  }, [camera.updateFrequencyMin, camera.imageUrl]);
  const url = camera.imageUrl ? `${camera.imageUrl}${camera.imageUrl.includes('?') ? '&' : '?'}t=${tick}` : null;
  return (
    <>
      {url ? (
        <Image source={{ uri: url }} style={styles.cameraImage} contentFit="cover" transition={200} accessibilityLabel={`Live image from ${camera.name}`} />
      ) : (
        <Text style={styles.subtitle}>Live image unavailable for this camera.</Text>
      )}
      {!camera.inService ? <Text style={styles.note}>Caltrans lists this camera as out of service.</Text> : null}
      <RowList rows={[['County', camera.county ? `${camera.county} Co.` : null], ['Near', camera.nearbyPlace]]} />
      {camera.streamUrl ? <LinkRow label="Raw stream" url={camera.streamUrl} /> : null}
      <Text style={styles.footnote}>Caltrans District CCTV · updates periodically</Text>
    </>
  );
}

function GaugeView({ gauge }: { gauge: Record<string, any> }) {
  const { value: detail, error } = useDetail<GaugeDetail>(gauge.lid, fetchGaugeDetail);
  const category = detail?.category ?? gauge.floodCategory;
  const stage = detail?.stage ?? gauge.currentStage;
  const thresholds = detail?.thresholds ?? {
    action: gauge.actionStage ?? undefined,
    minor: gauge.minorStage ?? undefined,
    moderate: gauge.moderateStage ?? undefined,
    major: gauge.majorStage ?? undefined,
  };
  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        <Pill label={FLOOD_CATEGORY_LABEL[category] ?? String(category ?? 'Unknown').replace(/_/g, ' ')} color={FLOOD_COLORS[category] ?? '#9ca3af'} />
      </View>
      {detail ? <GaugeChart detail={detail} /> : error ? null : <Loading message="Loading hydrograph…" />}
      <View style={styles.cards}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current Stage</Text>
          <Text style={styles.cardValue}>{stage != null ? `${Number(stage).toFixed(2)} ft` : '–'}</Text>
        </View>
        {thresholds.action != null ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Action Stage</Text>
            <Text style={styles.cardValue}>{thresholds.action} ft</Text>
          </View>
        ) : null}
      </View>
      <RowList
        rows={(['minor', 'moderate', 'major'] as const).map(k => [
          `${k[0].toUpperCase()}${k.slice(1)} flood`,
          thresholds[k] != null ? `${thresholds[k]} ft` : null,
        ])}
      />
      {detail?.impacts.length ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Flood impacts</Text>
          {detail.impacts
            .slice()
            .sort((a, b) => a.stage - b.stage)
            .slice(0, 6)
            .map(i => (
              <View key={`${i.stage}-${i.statement.slice(0, 20)}`} style={styles.impact}>
                <Text style={[styles.impactStage, { color: impactColor(i.stage, thresholds) }]}>{i.stage} ft</Text>
                <Text style={styles.impactText}>{i.statement}</Text>
              </View>
            ))}
        </View>
      ) : null}
      <LinkRow label="Source: NOAA" url={`https://water.noaa.gov/gauges/${gauge.lid}`} />
      <Text style={styles.footnote}>Gauge ID: {gauge.lid}</Text>
    </>
  );
}

function impactColor(stage: number, t: Partial<Record<string, number>>): string {
  for (const k of ['major', 'moderate', 'minor', 'action']) if (t[k] != null && stage >= (t[k] as number)) return THRESHOLD_COLORS[k];
  return sentinelText[200];
}

function TfrView({ tfr }: { tfr: Record<string, any> }) {
  const { value: d, error } = useDetail<TfrDetail>(tfr.notam, fetchTfrDetail);
  return (
    <>
      <Text style={styles.body}>{tfr.title}</Text>
      {!d && !error ? <Loading message="Loading NOTAM…" /> : null}
      <RowList
        rows={[
          ['Effective', d?.effective],
          ['Expires', d ? (d.expires ?? 'Until further notice') : null],
          ['Regulation', d?.regulation],
          ['Location', d?.location],
          ['Facility', tfr.facility],
          ['Updated', tfr.modified ? formatRelative(tfr.modified) : null],
        ]}
      />
      {d?.airspace.length ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.sectionTitle}>Airspace</Text>
          <RowList rows={d.airspace.map(a => [a.name, a.range])} />
        </View>
      ) : null}
      {d?.text ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.sectionTitle}>NOTAM text</Text>
          <Text style={styles.mono}>{d.text}</Text>
        </View>
      ) : null}
      <LinkRow label="Open on tfr.faa.gov" url={`https://tfr.faa.gov/tfr3/?page=detail_${String(tfr.notam).replace('/', '_')}`} />
      <Text style={styles.note}>For situational awareness only. Pilots: get an official briefing (1800wxbrief.com) before flight.</Text>
    </>
  );
}

function MetarView({ id }: { id: string }) {
  const { value: d, error } = useDetail<MetarDetail>(id, fetchMetarDetail);
  if (!d) return error ? <Text style={styles.subtitle}>Couldn’t load this station’s report.</Text> : <Loading message="Loading METAR…" />;
  return (
    <>
      {d.name ? <Text style={styles.body}>{d.name}</Text> : null}
      {d.fltCat ? (
        <View style={{ flexDirection: 'row' }}>
          <Pill label={d.fltCat} color={FLIGHT_CATEGORY_COLORS[d.fltCat] ?? '#9ca3af'} />
        </View>
      ) : null}
      {d.raw ? <Text style={styles.mono}>{d.raw}</Text> : null}
      <RowList rows={d.rows} />
      {d.taf ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.sectionTitle}>TAF</Text>
          <Text style={styles.mono}>{d.taf}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { color: accent.white, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  subtitle: { color: sentinelText[300], fontSize: 13, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: sentinel[700] },
  rowLabel: { width: 130, color: sentinelText[200], fontSize: 14 },
  rowValue: { flex: 1, color: accent.slate100, fontSize: 14 },
  body: { color: sentinelText[100], fontSize: 15, lineHeight: 22 },
  mono: {
    color: sentinelText[100],
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Menlo',
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: sentinel[800],
    borderWidth: 1,
    borderColor: sentinel[700],
    overflow: 'hidden',
  },
  sectionTitle: { color: sentinelText[200], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 },
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  bigValue: { color: accent.white, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  levelText: { color: accent.white, fontSize: 15, fontWeight: '600' },
  levelSub: { color: sentinelText[100], fontSize: 13, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: accent.white, fontSize: 12, fontWeight: '700' },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, padding: 12, borderRadius: radius.md, backgroundColor: sentinel[800], borderWidth: 1, borderColor: sentinel[700] },
  cardLabel: { color: sentinelText[300], fontSize: 12 },
  cardValue: { color: accent.white, fontSize: 18, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  impact: { flexDirection: 'row', gap: 10 },
  impactStage: { width: 56, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  impactText: { flex: 1, color: sentinelText[100], fontSize: 13, lineHeight: 19 },
  cameraImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: sentinel[800] },
  note: { color: accent.amber400, fontSize: 13, lineHeight: 19 },
  footnote: { color: sentinelText[400], fontSize: 12 },
  linkRow: { minHeight: 44, justifyContent: 'center' },
  link: { color: fire[400], fontSize: 15, fontWeight: '600' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  coords: { color: sentinelText[400], fontSize: 12, fontVariant: ['tabular-nums'] },
});
