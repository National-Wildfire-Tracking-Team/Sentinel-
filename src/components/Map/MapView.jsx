/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with Mapbox GL JS and satellite imagery.
 */

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import Map, { NavigationControl, ScaleControl, Popup, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatFRP } from '../../utils/formatUtils';
import { frpToLabel } from '../../utils/colorUtils';
import * as hrrRateLimiter from '../../utils/hrrRateLimiter';
import { loadHazardMapIcons } from '../../utils/loadHazardMapIcons';

// Data layer components
import FireHotspotsLayer  from './layers/FireHotspotsLayer';
import FirePerimetersLayer from './layers/FirePerimetersLayer';
import FireIncidentsLayer  from './layers/FireIncidentsLayer';
import IncidentLocationsLayer from './layers/IncidentLocationsLayer';
import AQILayer           from './layers/AQILayer';
import WeatherAlertsLayer from './layers/WeatherAlertsLayer';
import SmokeLayer         from './layers/SmokeLayer';
import GOESLayer          from './layers/GOESLayer';
import StormReportsLayer  from './layers/StormReportsLayer';
import UserReportsLayer   from './layers/UserReportsLayer';
import SPCOutlookLayer from './layers/SPCOutlookLayer';
import RadarLayer from './layers/RadarLayer';
import EvacZonesLayer from './layers/EvacZonesLayer';
import ReporterEvacZonesLayer from './layers/ReporterEvacZonesLayer';
import { MeasurementLayer, MeasurementPanel } from './MeasurementTool';
import { PrecipitationRing } from './PrecipitationRing';
import SPCWeatherTabOutlookControls from './SPCWeatherTabOutlookControls';
import FlightLayer from './layers/FlightLayer';
import RAWSLayer from './layers/RAWSLayer';
import AirNowMonitorsLayer from './layers/AirNowMonitorsLayer';
import DroughtOutlookLayer from './layers/DroughtOutlookLayer';
import NdgdSmokeForecastLayer from './layers/NdgdSmokeForecastLayer';
import NdgdSmokeTimeSlider from './NdgdSmokeTimeSlider';
import FireWeatherOutlookLayer from './layers/FireWeatherOutlookLayer';
import FireWeatherOutlookSelector from './FireWeatherOutlookSelector';
import CriticalInfrastructureLayer from './layers/CriticalInfrastructureLayer';
import NationalMapCollegesLayer from './layers/NationalMapCollegesLayer';
import NhcStormsLayer from './layers/NhcStormsLayer';
import NHCTropicalWeatherLayer from './layers/NHCTropicalWeatherLayer';
import HazardCategoryMarkersLayer from './layers/HazardCategoryMarkersLayer';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const HAS_MAPBOX_TOKEN = Boolean(MAPBOX_TOKEN.trim());
const LOCATION_PROMPT_KEY = 'sentinel-live-location-choice';

// Quick helper if you don't already have one exported from utils
const num = (val) => Number(val);

/** NDGD GeoJSON uses epoch ms in `todate` / `Todate` for the valid forecast hour */
function ndgdFeatureToDateMs(feature) {
  const p = feature?.properties;
  if (!p) return null;
  const raw = p.todate ?? p.Todate;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ─── Base map styles ──────────────────────────────────────────────────────────
const MAP_STYLES = {
  satellite: HAS_MAPBOX_TOKEN
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  rendered: HAS_MAPBOX_TOKEN
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

/**
 * Tooltip shown on hover
 */
const OUTLOOK_LAYER_IDS = new Set(['spc-outlook-fill', 'drought-outlook-fill', 'fire-weather-outlook-fill', 'nhc-disturbance-fill', 'nhc-track-circle', 'nhc-obs-circle']);

function HoverTooltip({ feature, lngLat }) {
  if (!feature || !lngLat) return null;
  const p = feature.properties;
  const layerId = feature.layer.id;
  const isOutlookPopup = OUTLOOK_LAYER_IDS.has(layerId);

  let content = null;
  switch (layerId) {
    case 'fire-hotspots-circle': {
      const detections = num(p.detection_count) || 1;
      const isConsolidated = detections > 1;
      content = (
        <>
          <div className="font-semibold text-orange-400">
            {isConsolidated ? `FIRMS Detection (${detections} sensors)` : 'FIRMS Detection'}
          </div>
          <div className="text-gray-300 text-xs mt-0.5">
            FRP: <span className="text-white font-medium">{formatFRP(num(p.frp))}</span>
            {' '}· {frpToLabel(num(p.frp))} intensity
            {isConsolidated && (
              <span className="text-gray-400"> · Combined: {formatFRP(num(p.total_frp))}</span>
            )}
          </div>
          <div className="text-gray-400 text-xs">{p.satellite} · {p.acq_date}</div>
          <div className="text-gray-500 text-[10px] mt-1">
            ({num(p.latitude).toFixed(4)}, {num(p.longitude).toFixed(4)})
          </div>
        </>
      );
      break;
    }
    case 'fire-perimeters-fill':
    case 'fire-perimeter-centroids-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">
            {p.IncidentName}
          </div>
          <div className="text-gray-300 text-xs mt-0.5">
            {formatAcres(num(p.GISAcres))} · {formatContainment(num(p.PercentContained))} contained
          </div>
          <div className="text-gray-400 text-xs">{p.POOState} · {p.POOCounty} County</div>
        </>
      );
      break;
    case 'aqi-stations-circle':
      content = (
        <>
          <div className="font-semibold text-blue-400">{p.reportingArea}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            AQI: <span className="text-white font-medium">{num(p.aqi)}</span>
            {' '}· {p.category}
          </div>
          <div className="text-gray-400 text-xs">PM2.5: {num(p.pm25)} µg/m³</div>
        </>
      );
      break;
    case 'fire-incidents-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.IncidentName}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            {formatAcres(p.GISAcres)} · {formatContainment(p.PercentContained)} contained
          </div>
          <div className="text-gray-400 text-xs">{p.POOState} · {p.POOCounty} County</div>
        </>
      );
      break;
    case 'weather-alerts-fill':
      content = (
        <>
          <div className="font-semibold text-red-400">{p.type}</div>
          <div className="text-gray-300 text-xs mt-0.5 max-w-[200px] line-clamp-2">{p.headline}</div>
        </>
      );
      break;
    case 'nws-lsr-reports-circle':
      content = (
        <>
          <div className="font-semibold text-sky-300">
            {p.reportType} <span className="text-sentinel-300">
              (NWS LSR{p.nwsLsrWindow ? ` · ${p.nwsLsrWindow}` : ''})
            </span>
          </div>
          {p.lsrDescription && (
            <div className="text-gray-300 text-xs mt-0.5 line-clamp-2">{p.lsrDescription}</div>
          )}
          {p.wfo && <div className="text-gray-400 text-xs">{p.wfo}</div>}
          <div className="text-gray-300 text-xs mt-0.5">
            {p.city ? `${p.city}, ` : ''}{p.state}
            {p.county ? ` · ${p.county} County` : ''}
          </div>
          {p.magnitude && <div className="text-gray-300 text-xs">Magnitude: {p.magnitude}</div>}
          {p.reportedAt && (
            <div className="text-gray-400 text-xs">
              {new Date(p.reportedAt).toLocaleString()}
            </div>
          )}
          {p.comments && (
            <div className="text-gray-400 text-xs mt-1 max-w-[220px] line-clamp-3">{p.comments}</div>
          )}
        </>
      );
      break;
    case 'spc-md-fill': {
      const tillStr = p.activeTill ? `Active till ${p.activeTill}` : null;
      content = (
        <>
          <div className="font-semibold text-red-400">
            {p.name || 'Mesoscale Discussion'}
          </div>
          {tillStr && (
            <div className="text-gray-300 text-xs mt-0.5">{tillStr}</div>
          )}
          <div className="text-gray-400 text-xs mt-0.5">SPC Mesoscale Discussion</div>
          {p.url && (
            <div className="text-sky-400 text-xs mt-1">Click for full discussion ↗</div>
          )}
        </>
      );
      break;
    }
    case 'spc-outlook-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      const typeLabel = (() => {
        const t = p.outlookType || 'categorical';
        const map = { categorical: 'Categorical', tornado: 'Tornado Prob.', hail: 'Hail Prob.', wind: 'Wind Prob.', severe: 'Severe Prob.' };
        return map[t] || t;
      })();
      const validStr = p.validTime
        ? (() => {
            const s = String(p.validTime);
            if (s.length === 12) {
              const yr = s.slice(0, 4), mo = s.slice(4, 6), dy = s.slice(6, 8), hr = s.slice(8, 10), mn = s.slice(10, 12);
              const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}Z`);
              return isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
            }
            return null;
          })()
        : null;
      content = (
        <>
          <div className="font-semibold text-yellow-300">
            SPC Day {dayNum} · {typeLabel}
          </div>
          <div className="text-zinc-200 text-xs mt-0.5">
            {p.outlookLabel || p.riskCategory || (p.probPct != null ? `${p.probPct}% probability` : 'Outlook')}
          </div>
          {validStr && (
            <div className="text-zinc-400 text-xs mt-0.5">Valid: {validStr}</div>
          )}
        </>
      );
      break;
    }
    case 'user-reports-circle':
      content = (
        <>
          <div className="font-semibold text-cyan-300">{p.title}</div>
          <div className="text-gray-300 text-xs mt-0.5">Community report</div>
          {p.created_at && (
            <div className="text-gray-400 text-xs">
              {new Date(p.created_at).toLocaleString()}
            </div>
          )}
        </>
      );
      break;
    case 'incident-locations-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.name}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            {formatAcres(num(p.acres))} · {formatContainment(num(p.contained))} contained
          </div>
          <div className="text-gray-400 text-xs">{p.county} Co., {p.state}</div>
        </>
      );
      break;
    case 'flights-symbol': {
      const alt   = p.baro_altitude != null ? `${Math.round(p.baro_altitude).toLocaleString()} m` : 'N/A';
      const spd   = p.velocity      != null ? `${Math.round(p.velocity * 1.94384)} kts` : 'N/A';
      const hdg   = p.true_track    != null ? `${Math.round(p.true_track)}°` : 'N/A';
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.callsign || p.icao24}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            Alt: <span className="text-white font-medium">{alt}</span>
            {' '}· Spd: <span className="text-white font-medium">{spd}</span>
          </div>
          <div className="text-gray-400 text-xs">Hdg: {hdg} · {p.origin_country}</div>
          <div className="text-gray-500 text-[10px] mt-0.5">Click for full details</div>
        </>
      );
      break;
    }
    case 'raws-stations-circle': {
      const fmt  = (v, unit) => v != null ? `${Math.round(v)}${unit}` : '—';
      const fmtD = (v) => v != null ? `${Math.round(v)}°` : '—';
      content = (
        <>
          <div className="font-semibold text-purple-300">{p.stationName}</div>
          <div className="text-gray-400 text-[10px]">
            {[p.county && `${p.county} Co.`, p.state, p.agency].filter(Boolean).join(' · ')}
          </div>
          <div className="text-gray-300 text-xs mt-1.5 space-y-0.5">
            <div>
              Temp: <span className="text-white font-medium">{fmt(p.temp, '°F')}</span>
              {' '}· RH: <span className="text-white font-medium">{fmt(p.relHumidity, '%')}</span>
            </div>
            <div>
              Wind: <span className="text-white font-medium">{fmt(p.windSpeed, ' mph')}</span>
              {' '}@ <span className="text-white font-medium">{fmtD(p.windDir)}</span>
              {p.windSpeedPeak != null && (
                <span className="text-gray-400"> (peak {fmt(p.windSpeedPeak, ' mph')})</span>
              )}
            </div>
            {(p.fuelMoisture != null || p.fuelTemp != null) && (
              <div>
                {p.fuelMoisture != null && <>FM: <span className="text-white font-medium">{fmt(p.fuelMoisture, '%')}</span></>}
                {p.fuelMoisture != null && p.fuelTemp != null && ' · '}
                {p.fuelTemp != null && <>Fuel Temp: <span className="text-white font-medium">{fmt(p.fuelTemp, '°F')}</span></>}
              </div>
            )}
            {p.precip != null && p.precip > 0 && (
              <div>Precip: <span className="text-white font-medium">{p.precip.toFixed(2)}"</span></div>
            )}
          </div>
          <div className="text-gray-500 text-[10px] mt-1 flex justify-between gap-3">
            {p.elevation != null && <span>Elev: {Math.round(p.elevation).toLocaleString()} ft</span>}
            {p.observationTime && <span>{new Date(p.observationTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
          </div>
        </>
      );
      break;
    }
    case 'evac-zones-fill': {
      const isIpaws = p.source === 'ipaws';
      if (isIpaws) {
        content = (
          <>
            <div className="font-semibold text-amber-400">IPAWS / EAS</div>
            <div className="text-white text-xs mt-0.5 font-medium">{p.ipawsHeadline || p.zoneName}</div>
            {p.ipawsAreaDesc && <div className="text-gray-300 text-xs">{p.ipawsAreaDesc}</div>}
            {(p.ipawsSent || p.effectiveDate) && (
              <div className="text-gray-400 text-xs mt-1">
                {new Date(p.ipawsSent || p.effectiveDate).toLocaleString()}
              </div>
            )}
          </>
        );
        break;
      }
      const statusColors = {
        'evacuation order':   'text-red-400',
        'evacuation warning': 'text-orange-400',
        'evacuation watch':   'text-yellow-400',
      };
      const statusKey = (p.warningType || '').toLowerCase();
      const statusClass = statusColors[statusKey] || 'text-orange-400';
      content = (
        <>
          <div className={`font-semibold ${statusClass}`}>{p.warningType || 'Evacuation Zone'}</div>
          {p.zoneName && <div className="text-white text-xs mt-0.5 font-medium">{p.zoneName}</div>}
          {p.county && <div className="text-gray-300 text-xs">{p.county} County</div>}
          {p.agency && <div className="text-gray-400 text-xs">{p.agency}</div>}
          {p.effectiveDate && (
            <div className="text-gray-400 text-xs">
              Effective: {new Date(p.effectiveDate).toLocaleString()}
            </div>
          )}
          {p.instructions && (
            <div className="text-gray-400 text-xs mt-1 max-w-[220px] line-clamp-2">{p.instructions}</div>
          )}
        </>
      );
      break;
    }
    case 'reporter-evac-zones-fill': {
      const zoneTypeColors = {
        'evacuation order':   'text-red-400',
        'evacuation warning': 'text-orange-400',
        'evacuation watch':   'text-yellow-400',
      };
      const ztKey = (p.zone_type || '').toLowerCase();
      const ztClass = zoneTypeColors[ztKey] || 'text-red-400';
      content = (
        <>
          <div className={`font-semibold ${ztClass}`}>{p.zone_type || 'Evacuation Zone'}</div>
          {p.title && <div className="text-white text-xs mt-0.5 font-medium">{p.title}</div>}
          {p.incident_name && (
            <div className="text-orange-300 text-xs mt-0.5">Fire: {p.incident_name}</div>
          )}
          {(p.county || p.state) && (
            <div className="text-gray-300 text-xs">
              {[p.county && `${p.county} County`, p.state].filter(Boolean).join(', ')}
            </div>
          )}
          {p.effective_at && (
            <div className="text-gray-400 text-xs">
              Effective: {new Date(p.effective_at).toLocaleString()}
            </div>
          )}
          <div className="text-[#0096ff] text-[10px] mt-1 uppercase tracking-wider">Reporter Zone</div>
        </>
      );
      break;
    }
    case 'drought-outlook-fill': {
      const outlookLabel = {
        Drought_Develops: 'Drought Likely to Develop',
        Drought_Persists: 'Drought Likely to Persist',
        Drought_Improves: 'Drought Likely to Improve',
        Drought_Removes:  'Drought Likely to End',
        No_Drought:       'No Drought Expected',
      }[p.outlook] || p.outlook || 'Drought Outlook';
      content = (
        <>
          <div className="font-semibold text-amber-400">CPC Drought Outlook</div>
          <div className="text-white text-xs mt-0.5 font-medium">{outlookLabel}</div>
          {p.target && <div className="text-zinc-300 text-xs">Forecast: {p.target}</div>}
          {p.fcst_date && <div className="text-zinc-400 text-xs">Issued: {p.fcst_date}</div>}
        </>
      );
      break;
    }
    case 'ndgd-smoke-forecast-fill': {
      const refMs = typeof p.referencedate === 'number' ? p.referencedate : null;
      const toMs = typeof p.todate === 'number' ? p.todate : null;
      const fmt = (ms) => {
        if (ms == null || !Number.isFinite(ms)) return null;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      };
      const refStr = fmt(refMs);
      const toStr = fmt(toMs);
      const band = p.smoke_classdesc ? `${p.smoke_classdesc} µg/m³` : 'Smoke concentration';
      content = (
        <>
          <div className="font-semibold text-yellow-200">NOAA Smoke Forecast</div>
          <div className="text-white text-xs mt-0.5 font-medium">{band}</div>
          {refStr && <div className="text-gray-300 text-xs">From: {refStr}</div>}
          {toStr && <div className="text-gray-400 text-xs">To: {toStr}</div>}
        </>
      );
      break;
    }
    case 'airnow-monitors-circle': {
      const aqiColor = (aqi) => {
        if (aqi == null) return '#94a3b8';
        if (aqi <= 50)  return '#00e400';
        if (aqi <= 100) return '#ffff00';
        if (aqi <= 150) return '#ff7e00';
        if (aqi <= 200) return '#ff0000';
        if (aqi <= 300) return '#8f3f97';
        return '#7e0023';
      };
      const aqiCategory = (aqi) => {
        if (aqi == null) return 'No Data';
        if (aqi <= 50)  return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
      };
      const primaryAqi = p.aqi != null ? num(p.aqi) : null;
      content = (
        <>
          <div className="font-semibold text-sky-300">{p.siteName || 'AirNow Monitor'}</div>
          {p.stateName && <div className="text-gray-400 text-[10px]">{p.stateName}</div>}
          <div className="mt-1.5 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: aqiColor(primaryAqi) }}
              />
              <span className="text-gray-300 text-xs">
                AQI: <span className="text-white font-medium">{primaryAqi ?? 'ND'}</span>
                {primaryAqi != null && (
                  <span className="text-gray-400"> · {aqiCategory(primaryAqi)}</span>
                )}
              </span>
            </div>
            {p.pm25Aqi != null && (
              <div className="text-gray-300 text-xs">
                PM2.5 AQI: <span className="text-white font-medium">{num(p.pm25Aqi)}</span>
              </div>
            )}
            {p.pm10Aqi != null && (
              <div className="text-gray-300 text-xs">
                PM10 AQI: <span className="text-white font-medium">{num(p.pm10Aqi)}</span>
              </div>
            )}
            {p.ozoneAqi != null && (
              <div className="text-gray-300 text-xs">
                Ozone AQI: <span className="text-white font-medium">{num(p.ozoneAqi)}</span>
              </div>
            )}
          </div>
          {p.localTime && (
            <div className="text-gray-500 text-[10px] mt-1">{p.localTime}</div>
          )}
        </>
      );
      break;
    }
    case 'fire-weather-outlook-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      const typeLabel = p.outlookType === 'dry_thunderstorm' ? 'Dry Lightning' : 'Wind & Low RH';
      const riskColors = {
        ELEVATED: 'text-yellow-300',
        CRITICAL: 'text-red-400',
        EXTREME:  'text-fuchsia-400',
      };
      const riskClass = riskColors[p.riskCategory] || 'text-orange-300';
      content = (
        <>
          <div className="font-semibold text-orange-300">
            SPC Fire Wx Day {dayNum} · {typeLabel}
          </div>
          <div className={`text-xs mt-0.5 font-medium ${riskClass}`}>
            {p.outlookLabel || p.riskCategory || 'Fire Weather Outlook'}
          </div>
        </>
      );
      break;
    }
    case 'nhc-disturbance-fill': {
      const chanceColors = { HIGH: 'text-red-400', MEDIUM: 'text-orange-400', LOW: 'text-yellow-300' };
      const chanceClass  = chanceColors[p.formationChance] || 'text-yellow-300';
      content = (
        <>
          <div className="font-semibold text-sky-300">NHC Tropical Disturbance</div>
          {p.formationChance && (
            <div className={`text-xs mt-0.5 font-medium ${chanceClass}`}>
              {p.formationChance} formation probability
            </div>
          )}
          <div className="text-zinc-400 text-[10px] mt-0.5">2–5 day outlook area</div>
        </>
      );
      break;
    }
    case 'nhc-obs-circle':
    case 'nhc-track-circle': {
      const catColors = {
        'Tropical Depression': 'text-sky-300',
        'Tropical Storm':      'text-cyan-300',
        'Category 1':          'text-yellow-200',
        'Category 2':          'text-yellow-300',
        'Category 3':          'text-orange-300',
        'Category 4':          'text-orange-400',
        'Category 5':          'text-red-400',
      };
      const catClass = catColors[p.category] || 'text-sky-300';
      const isObserved = feature.layer.id === 'nhc-obs-circle';
      content = (
        <>
          <div className="font-semibold text-sky-300">
            {p.stormName ? `${p.stormName} · ` : ''}{isObserved ? 'Observed' : 'Forecast'}
          </div>
          <div className={`text-xs mt-0.5 font-medium ${catClass}`}>
            {p.stormType || p.category}
          </div>
          {p.maxWind > 0 && (
            <div className="text-zinc-300 text-xs mt-0.5">
              Max wind: {p.maxWind} mph · Gusts: {p.gust} mph
            </div>
          )}
          {p.dateLabel && (
            <div className="text-zinc-400 text-[10px] mt-0.5">{p.dateLabel}</div>
          )}
        </>
      );
      break;
    }
    case 'cmra-transmission-lines': {
      const kv = (label, val) => (val != null && String(val).trim() !== '' ? (
        <div className="text-gray-300 text-xs">
          {label}: <span className="text-white font-medium">{String(val)}</span>
        </div>
      ) : null);
      content = (
        <>
          <div className="font-semibold text-amber-300">Transmission line</div>
          {kv('ID', p.ID)}
          {kv('Voltage (kV)', p.VOLTAGE)}
          {kv('Class', p.VOLT_CLASS)}
          {kv('Type', p.TYPE)}
          {kv('Status', p.STATUS)}
          {kv('Owner', p.OWNER)}
          {p.NAICS_DESC && (
            <div className="text-gray-400 text-[10px] mt-1 line-clamp-2">{p.NAICS_DESC}</div>
          )}
          <div className="text-gray-500 text-[10px] mt-1">CMRA · U.S. electric transmission (archive)</div>
        </>
      );
      break;
    }
    case 'eia-gas-pipelines': {
      const k = (label, val) => (val != null && String(val).trim() !== '' ? (
        <div className="text-gray-300 text-xs">
          {label}: <span className="text-white font-medium">{String(val)}</span>
        </div>
      ) : null);
      content = (
        <>
          <div className="font-semibold text-sky-300">Natural gas pipeline</div>
          {k('Interstate / intrastate', p.TYPEPIPE)}
          {k('Operator', p.Operator)}
          {k('Status', p.Status)}
          <div className="text-gray-500 text-[10px] mt-1">EIA U.S. pipeline (public)</div>
        </>
      );
      break;
    }
    case 'nhc-centers-circle': {
      const windMph  = p.intensityMph ? `${p.intensityMph} mph` : null;
      const windKts  = p.intensityKts ? `${p.intensityKts} kt`  : null;
      const pressStr = p.pressure     ? `${p.pressure} mb`      : null;
      content = (
        <>
          <div className="font-semibold text-sky-300">{p.name}</div>
          <div className={`text-xs font-medium mt-0.5 ${
            p.category?.includes('5') ? 'text-fuchsia-400' :
            p.category?.includes('4') ? 'text-red-400' :
            p.category?.includes('3') ? 'text-orange-400' :
            p.category?.includes('2') ? 'text-amber-400' :
            p.category?.includes('1') ? 'text-yellow-300' :
            p.category?.includes('Storm') ? 'text-sky-300' :
            'text-slate-400'
          }`}>{p.category}</div>
          {(windMph || windKts) && (
            <div className="text-gray-300 text-xs mt-0.5">
              Winds: <span className="text-white font-medium">{windMph}</span>
              {windKts && <span className="text-gray-400"> ({windKts})</span>}
            </div>
          )}
          {pressStr && (
            <div className="text-gray-300 text-xs">
              Pressure: <span className="text-white font-medium">{pressStr}</span>
            </div>
          )}
          {p.movement && (
            <div className="text-gray-400 text-xs">Movement: {p.movement}</div>
          )}
          {p.lastUpdate && (
            <div className="text-gray-500 text-[10px] mt-1">{p.lastUpdate}</div>
          )}
          <div className="text-sky-500 text-[10px] mt-0.5 uppercase tracking-wide">NHC · nhc.noaa.gov</div>
        </>
      );
      break;
    }
    case 'national-map-colleges-circle': {
      const name = p.NAME || p.name || 'School / university';
      content = (
        <>
          <div className="font-semibold text-violet-300">USGS National Map</div>
          <div className="text-white text-xs mt-0.5 font-medium line-clamp-2">{name}</div>
          <div className="text-gray-400 text-[10px] mt-1">Colleges &amp; universities (structures)</div>
        </>
      );
      break;
    }
    default:
      return null;
  }

  const popupShell = isOutlookPopup
    ? 'bg-black border border-zinc-700 rounded-lg p-3 shadow-2xl shadow-black/70 text-sm min-w-[160px] ring-1 ring-white/10'
    : 'bg-sentinel-800 border border-sentinel-600 rounded-lg p-2.5 shadow-2xl text-sm min-w-[140px]';

  return (
    <Popup
      longitude={lngLat.lng}
      latitude={lngLat.lat}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={[0, -8]}
      className="sentinel-popup"
    >
      <div className={popupShell}>
        {content}
      </div>
    </Popup>
  );
}

const FLIGHT_FIELDS = [
  { key: 'icao24',        label: 'ICAO24' },
  { key: 'callsign',      label: 'Callsign' },
  { key: 'squawk',        label: 'Squawk' },
  { key: 'true_track',    label: 'Heading', fmt: v => v != null ? `${Math.round(v)}°` : '—' },
  { key: 'baro_altitude', label: 'Altitude', fmt: v => v != null ? `${Math.round(v).toLocaleString()} m` : '—' },
  { key: 'velocity',      label: 'Speed', fmt: v => v != null ? `${Math.round(v * 1.94384)} kts` : '—' },
  { key: 'vertical_rate', label: 'Vert. Rate', fmt: v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)} m/s` : '—' },
  { key: 'category',      label: 'Category' },
];

function FlightDetailPopup({ flight, lngLat, onClose }) {
  return (
    <Popup
      longitude={lngLat.lng}
      latitude={lngLat.lat}
      closeButton={false}
      closeOnClick={false}
      anchor="top"
      offset={[0, 8]}
      className="sentinel-popup"
    >
      <div className="bg-sentinel-800 border border-sentinel-600 rounded-lg shadow-2xl text-sm min-w-[200px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-sentinel-600 bg-sentinel-700/50">
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: '#ff5a00' }}>✈</span>
            <span className="font-semibold text-orange-400">
              {flight.callsign || flight.icao24}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-sentinel-300 hover:text-white transition-colors text-xs leading-none ml-3"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Fields */}
        <div className="px-3 py-2 space-y-1">
          {FLIGHT_FIELDS.map(({ key, label, fmt }) => {
            const raw = flight[key];
            const display = fmt ? fmt(raw) : (raw != null && raw !== '' ? String(raw) : '—');
            return (
              <div key={key} className="flex items-baseline justify-between gap-4">
                <span className="text-sentinel-300 text-[10px] uppercase tracking-wide shrink-0">{label}</span>
                <span className="text-white text-xs font-mono text-right">{display}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Popup>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.hotspotsGeoJSON
 * @param {object|null} props.perimetersGeoJSON
 * @param {object|null} props.incidentsGeoJSON // Fixed naming mismatch
 * @param {object|null} props.incidentDotsGeoJSON
 * @param {object|null} props.aqiGeoJSON
 * @param {object|null} props.alertsGeoJSON
 * @param {object|null} props.stormReportsGeoJSON
 * @param {object|null} props.spcOutlooksGeoJSON
 * @param {string}      [props.spcOutlookType]       - active outlook type key
 * @param {string}      [props.spcActiveDay]         - active day key e.g. 'day1'
 * @param {boolean}     [props.spcOutlooksLoading]
 * @param {string|null} [props.spcValidTime]
 * @param {Function}    [props.onSpcOutlookTypeChange]
 * @param {Function}    [props.onSpcActiveDayChange]
 * @param {object|null} props.spcMdGeoJSON
 * @param {object|null} props.userReportsGeoJSON
 * @param {object|null} props.evacZonesGeoJSON
 * @param {object|null} props.reporterEvacZonesGeoJSON
 * @param {object|null} props.flightsGeoJSON
 * @param {object|null} props.rawsGeoJSON
 * @param {object|null} props.airNowMonitorsGeoJSON
 * @param {object|null} props.droughtOutlookGeoJSON
 * @param {object|null} props.ndgdSmokeForecastGeoJSON
 * @param {object|null} props.criticalInfrastructureTransGeoJSON
 * @param {object|null} props.criticalInfrastructureGasGeoJSON
 * @param {boolean}     [props.criticalInfrastructureVisible]
 * @param {object|null} props.nationalMapCollegesGeoJSON
 * @param {boolean}     [props.nationalMapCollegesVisible]
 * @param {object|null} props.nhcCentersGeoJSON
 * @param {object|null} props.nhcConesGeoJSON
 * @param {object|null} props.nhcTracksGeoJSON
 * @param {object|null} props.fireWeatherOutlooksGeoJSON
 * @param {string}      [props.fireWxOutlookType]
 * @param {string}      [props.fireWxActiveDay]
 * @param {boolean}     [props.fireWeatherOutlooksLoading]
 * @param {string|null} [props.fireWxValidTime]
 * @param {Function}    [props.onFireWxOutlookTypeChange]
 * @param {Function}    [props.onFireWxActiveDayChange]
 * @param {'convective'|'fireWx'} [props.spcWeatherOutlookMode] – weather tab combined SPC layer sub-mode
 * @param {Function}    [props.onSpcWeatherOutlookModeChange]
 * @param {Array}       [props.savedLocations]
 * @param {'wildfire'|'weather'} [props.activeMapTab]
 */
export default function MapView({
  activeMapTab = 'wildfire',
  mapType = 'satellite',
  hotspotsGeoJSON,
  perimetersGeoJSON,
  incidentsGeoJSON, // Renamed to match usage inside
  incidentDotsGeoJSON,
  aqiGeoJSON,
  alertsGeoJSON,
  stormReportsGeoJSON,
  spcOutlooksGeoJSON,
  spcOutlookType = 'categorical',
  spcActiveDay = 'day1',
  spcOutlooksLoading = false,
  spcValidTime = null,
  onSpcOutlookTypeChange,
  onSpcActiveDayChange,
  spcMdGeoJSON,
  userReportsGeoJSON,
  evacZonesGeoJSON,
  reporterEvacZonesGeoJSON,
  flightsGeoJSON,
  rawsGeoJSON,
  airNowMonitorsGeoJSON,
  droughtOutlookGeoJSON,
  ndgdSmokeForecastGeoJSON,
  criticalInfrastructureTransGeoJSON,
  criticalInfrastructureGasGeoJSON,
  criticalInfrastructureVisible = false,
  nationalMapCollegesGeoJSON,
  nationalMapCollegesVisible = false,
  nhcCentersGeoJSON,
  nhcConesGeoJSON,
  nhcTracksGeoJSON,
  fireWeatherOutlooksGeoJSON,
  fireWxOutlookType = 'winds_low_humidity',
  fireWxActiveDay = 'day1',
  fireWeatherOutlooksLoading = false,
  fireWxValidTime = null,
  onFireWxOutlookTypeChange,
  onFireWxActiveDayChange,
  spcWeatherOutlookMode = 'convective',
  onSpcWeatherOutlookModeChange,
  nhcTrackGeoJSON,
  nhcObservedTrackGeoJSON,
  nhcConeGeoJSON,
  nhcDisturbanceGeoJSON,
  nhcStormLabelsGeoJSON,
  savedLocations = [],
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  precipRingActive = false,
}) {
  const { layers, alerts, selectFire, viewport, setViewport, sidebarOpen } = useApp();
  const mapRef = useRef(null);

  // Resize the Mapbox canvas after the sidebar transition completes (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef.current) mapRef.current.resize();
    }, 310);
    return () => clearTimeout(timer);
  }, [sidebarOpen]);
  const isWildfireTab   = activeMapTab === 'wildfire';
  const isWeatherTab    = activeMapTab === 'weather';
  const isAllHazardTab  = activeMapTab === 'allhazard';

  const [hazardIconsLoaded, setHazardIconsLoaded] = useState(false);

  const handleMapLoad = useCallback((evt) => {
    loadHazardMapIcons(evt.target, () => setHazardIconsLoaded(true));
  }, []);

  // Hover tooltip state
  const [hoverFeature, setHoverFeature] = useState(null);
  const [hoverLngLat,  setHoverLngLat]  = useState(null);

  /** NDGD smoke: which forecast hour (index into sorted unique `todate` values) */
  const [ndgdSmokeHourIndex, setNdgdSmokeHourIndex] = useState(0);

  const ndgdForecastHoursMs = useMemo(() => {
    const feats = ndgdSmokeForecastGeoJSON?.features;
    if (!feats?.length) return [];
    const seen = new Set();
    for (const f of feats) {
      const ms = ndgdFeatureToDateMs(f);
      if (ms != null) seen.add(ms);
    }
    return Array.from(seen).sort((a, b) => a - b);
  }, [ndgdSmokeForecastGeoJSON]);

  useEffect(() => {
    if (!ndgdForecastHoursMs.length) return;
    setNdgdSmokeHourIndex((i) => Math.min(i, ndgdForecastHoursMs.length - 1));
  }, [ndgdForecastHoursMs]);

  const ndgdSmokeFilteredGeoJSON = useMemo(() => {
    const feats = ndgdSmokeForecastGeoJSON?.features;
    if (!feats?.length) return { type: 'FeatureCollection', features: [] };
    const hours = ndgdForecastHoursMs;
    if (!hours.length) return ndgdSmokeForecastGeoJSON;
    const idx = Math.min(Math.max(0, ndgdSmokeHourIndex), hours.length - 1);
    const targetMs = hours[idx];
    return {
      type: 'FeatureCollection',
      features: feats.filter((f) => ndgdFeatureToDateMs(f) === targetMs),
    };
  }, [ndgdSmokeForecastGeoJSON, ndgdForecastHoursMs, ndgdSmokeHourIndex]);

  // Selected aircraft popup state
  const [selectedFlight,       setSelectedFlight]       = useState(null);
  const [selectedFlightLngLat, setSelectedFlightLngLat] = useState(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Measurement tool state (active/mode lifted to LiveTrackerPage; points/preview stay local)
  const [measurePoints,  setMeasurePoints]  = useState([]);   // [{lng, lat}, ...]
  const [measurePreview, setMeasurePreview] = useState(null); // {lng, lat} – live cursor

  const activateMeasure = useCallback((mode) => {
    onMeasureActivate?.(mode);
    setMeasurePoints([]);
    setMeasurePreview(null);
  }, [onMeasureActivate]);

  const closeMeasure = useCallback(() => {
    onMeasureClose?.();
    setMeasurePoints([]);
    setMeasurePreview(null);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
  }, [onMeasureClose]);

  const clearMeasure = useCallback(() => {
    setMeasurePoints([]);
    setMeasurePreview(null);
  }, []);

  // ESC key closes measurement mode
  useEffect(() => {
    if (!measureActive) return;
    const onKey = (e) => { if (e.key === 'Escape') closeMeasure(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measureActive, closeMeasure]);

  // Ask for live location once per browser session when map opens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedChoice = window.sessionStorage.getItem(LOCATION_PROMPT_KEY);
    if (!savedChoice) setShowLocationPrompt(true);
    if (savedChoice === 'granted') {
      setShowLocationPrompt(false);
    }
  }, []);

  // Start/stop live location tracking after user choice is made.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const savedChoice = window.sessionStorage.getItem(LOCATION_PROMPT_KEY);
    if (savedChoice !== 'granted' || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setUserLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [showLocationPrompt]);

  const allowLiveLocation = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(LOCATION_PROMPT_KEY, 'granted');
    }
    setShowLocationPrompt(false);
  }, []);

  const cancelLiveLocation = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(LOCATION_PROMPT_KEY, 'denied');
    }
    setUserLocation(null);
    setShowLocationPrompt(false);
  }, []);

  // Only include interactive layer IDs for layers that are currently visible.
  // When the measurement tool is active, disable all layer interactions so
  // clicks and hover tooltips don't compete with the measurement workflow.
  const interactiveLayerIds = useMemo(() => {
    if (measureActive) return [];
    const ids = [];
    if ((isWildfireTab || isAllHazardTab) && layers.fireHotspots && hotspotsGeoJSON)        ids.push('fire-hotspots-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.firePerimeters && perimetersGeoJSON) {
      ids.push('fire-perimeters-fill');
      ids.push('fire-perimeter-centroids-circle');
    }
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations && incidentsGeoJSON)   ids.push('incident-locations-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations && userReportsGeoJSON)  ids.push('user-reports-circle');
    if (layers.aqi && aqiGeoJSON)                                                             ids.push('aqi-stations-circle');
    if ((isWeatherTab || isAllHazardTab) && layers.weatherAlerts && alertsGeoJSON) ids.push('weather-alerts-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'convective' && spcOutlooksGeoJSON) {
      ids.push('spc-outlook-fill');
    }
    if ((isWeatherTab || isAllHazardTab) && layers.weatherAlerts && spcMdGeoJSON) ids.push('spc-md-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.stormReports && stormReportsGeoJSON)     ids.push('nws-lsr-reports-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.evacZones && evacZonesGeoJSON)                        ids.push('evac-zones-fill');
    if ((isWildfireTab || isAllHazardTab) && layers.reporterEvacZones && reporterEvacZonesGeoJSON)        ids.push('reporter-evac-zones-fill');
    if (layers.flights && flightsGeoJSON)                                                                 ids.push('flights-symbol');
    if (layers.rawsStations && rawsGeoJSON)                                                               ids.push('raws-stations-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.airNowMonitors && airNowMonitorsGeoJSON)              ids.push('airnow-monitors-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.droughtOutlook && droughtOutlookGeoJSON)              ids.push('drought-outlook-fill');
    if ((isWildfireTab || isAllHazardTab) && layers.ndgdSmokeForecast && ndgdSmokeFilteredGeoJSON?.features?.length) {
      ids.push('ndgd-smoke-forecast-fill');
    }
    if (criticalInfrastructureVisible && criticalInfrastructureTransGeoJSON?.features?.length) {
      ids.push('cmra-transmission-lines');
    }
    if (criticalInfrastructureVisible && criticalInfrastructureGasGeoJSON?.features?.length) {
      ids.push('eia-gas-pipelines');
    }
    if (nationalMapCollegesVisible && nationalMapCollegesGeoJSON?.features?.length) {
      ids.push('national-map-colleges-circle');
    }
    if (layers.fireWeatherOutlooks && fireWeatherOutlooksGeoJSON) ids.push('fire-weather-outlook-fill');
    if (isWeatherTab && layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx' && fireWeatherOutlooksGeoJSON) {
      ids.push('fire-weather-outlook-fill');
    }
    if ((isWeatherTab || isAllHazardTab) && layers.nhcStorms && nhcCentersGeoJSON?.features?.length) {
      ids.push('nhc-centers-circle');
    }
    if ((isWeatherTab || isAllHazardTab) && layers.nhcTropicalWeather) {
      if (nhcDisturbanceGeoJSON?.features?.length) ids.push('nhc-disturbance-fill');
      if (nhcTrackGeoJSON?.features?.length) ids.push('nhc-track-circle');
      if (nhcObservedTrackGeoJSON?.features?.length) ids.push('nhc-obs-circle');
    }
    return ids;
  }, [measureActive, isWildfireTab, isWeatherTab, isAllHazardTab, layers.fireHotspots, layers.firePerimeters, layers.incidentLocations, layers.aqi,
      layers.weatherAlerts, layers.spcWeatherOutlooks, spcWeatherOutlookMode, layers.stormReports, layers.evacZones, layers.reporterEvacZones, spcMdGeoJSON,
      layers.flights, layers.rawsStations, layers.airNowMonitors, layers.droughtOutlook, layers.ndgdSmokeForecast, layers.fireWeatherOutlooks,
      layers.nhcTropicalWeather,
      hotspotsGeoJSON, perimetersGeoJSON, incidentsGeoJSON, aqiGeoJSON, alertsGeoJSON, spcOutlooksGeoJSON,
      stormReportsGeoJSON, userReportsGeoJSON, evacZonesGeoJSON, reporterEvacZonesGeoJSON,
      flightsGeoJSON, rawsGeoJSON, airNowMonitorsGeoJSON, droughtOutlookGeoJSON, ndgdSmokeFilteredGeoJSON, fireWeatherOutlooksGeoJSON,
      nhcTrackGeoJSON, nhcObservedTrackGeoJSON, nhcDisturbanceGeoJSON,
      criticalInfrastructureVisible, criticalInfrastructureTransGeoJSON, criticalInfrastructureGasGeoJSON,
      nationalMapCollegesVisible, nationalMapCollegesGeoJSON,
      layers.nhcStorms, nhcCentersGeoJSON]);

  // Clear stale hover when layers change
  useEffect(() => {
    setHoverFeature(null);
    setHoverLngLat(null);
  }, [layers]);

  // Handle map click – add measurement point OR select fire for detail panel
  const handleClick = useCallback((evt) => {
    if (measureActive) {
      const { lng, lat } = evt.lngLat;
      setMeasurePoints(prev => [...prev, { lng, lat }]);
      return;
    }

    const features = evt.features;
    if (!features?.length) {
      selectFire(null);
      setSelectedFlight(null);
      setSelectedFlightLngLat(null);
      return;
    }

    const feature = features[0];
    const p = feature.properties;

    if (feature.layer.id === 'flights-symbol') {
      setSelectedFlight(feature.properties);
      setSelectedFlightLngLat(evt.lngLat);
      return;
    }

    if (feature.layer.id === 'cmra-transmission-lines') {
      setSelectedFlight(null);
      setSelectedFlightLngLat(null);
      selectFire({
        type: 'transmission-line',
        id: p.OBJECTID ?? p.ID ?? `${evt.lngLat.lng},${evt.lngLat.lat}`,
        name: p.ID || 'Transmission line',
        lat: evt.lngLat.lat,
        lng: evt.lngLat.lng,
        lineId: p.ID,
        voltage: p.VOLTAGE,
        voltClass: p.VOLT_CLASS,
        lineType: p.TYPE,
        status: p.STATUS,
        owner: p.OWNER,
        naicsDesc: p.NAICS_DESC,
        source: p.SOURCE,
      });
      return;
    }

    if (feature.layer.id === 'eia-gas-pipelines') {
      setSelectedFlight(null);
      setSelectedFlightLngLat(null);
      selectFire({
        type: 'gas-pipeline',
        id: p.FID ?? p.OBJECTID ?? `${evt.lngLat.lng},${evt.lngLat.lat}`,
        name: p.Operator || 'Natural gas pipeline',
        lat: evt.lngLat.lat,
        lng: evt.lngLat.lng,
        pipeType: p.TYPEPIPE,
        operator: p.Operator,
        status: p.Status,
        shapeLeng: p.Shape_Leng,
        shapeLength: p.Shape__Length,
      });
      return;
    }

    if (feature.layer.id === 'national-map-colleges-circle') {
      setSelectedFlight(null);
      setSelectedFlightLngLat(null);
      selectFire({
        type: 'national-map-college',
        id: p.OBJECTID ?? p.FID ?? `${evt.lngLat.lng},${evt.lngLat.lat}`,
        name: p.NAME || p.name || 'School / university',
        lat: evt.lngLat.lat,
        lng: evt.lngLat.lng,
        ftype: p.FTYPE,
        properties: p,
      });
      return;
    }

    // Clicking any non-flight feature closes the flight popup
    setSelectedFlight(null);
    setSelectedFlightLngLat(null);

    if (feature.layer.id === 'fire-hotspots-circle') {
      selectFire({
        type: 'hotspot',
        id:   p.id,
        lat:  num(p.latitude) || evt.lngLat.lat,
        lng:  num(p.longitude) || evt.lngLat.lng,
        frp:  num(p.frp),
        total_frp:       num(p.total_frp) || num(p.frp),
        brightness:      num(p.brightness),
        confidence:      p.confidence,
        satellite:       p.satellite,
        source:          p.source,
        acq_date:        p.acq_date,
        acq_time:        p.acq_time,
        detection_count: num(p.detection_count) || 1,
      });
    } else if (feature.layer.id === 'fire-perimeters-fill' || feature.layer.id === 'fire-perimeter-centroids-circle') {
      selectFire({
        type:        'perimeter',
        id:          p.UniqueFireIdentifier,
        name:        p.IncidentName,
        lat:         evt.lngLat.lat,
        lng:         evt.lngLat.lng,
        acres:       num(p.GISAcres),
        contained:   num(p.PercentContained),
        state:       p.POOState,
        county:      p.POOCounty,
        personnel:   num(p.TotalIncidentPersonnel),
        destroyed:   num(p.StructuresDestroyed),
        damaged:     num(p.StructuresDamaged),
        discovered:  p.FireDiscoveryDateTime,
        updated:     p.ModifiedOnDateTime,
        orgType:     p.IncidentManagementOrganization,
        cause:       p.FireCause || null,
        source:      p.Source || null,
      });
    } else if (feature.layer.id === 'fire-incidents-circle') {
      selectFire({
        type:       'incident',
        id:         p.UniqueFireIdentifier,
        name:       p.IncidentName,
        lat:        evt.lngLat.lat,
        lng:        evt.lngLat.lng,
        acres:      p.GISAcres,
        contained:  p.PercentContained,
        state:      p.POOState,
        county:     p.POOCounty,
        personnel:  p.TotalIncidentPersonnel,
        cause:      p.FireCause,
        started:    p.FireDiscoveryDateTime
                      ? new Date(p.FireDiscoveryDateTime).toISOString()
                      : null,
        updated:    p.ModifiedOnDateTime
                      ? new Date(p.ModifiedOnDateTime).toISOString()
                      : null,
      });
    } else if (feature.layer.id === 'incident-locations-circle') {
      let updates = [];
      let evacuationLines = [];
      try {
        updates = p.updates_json ? JSON.parse(p.updates_json) : [];
      } catch {
        updates = [];
      }
      try {
        evacuationLines = p.evacuation_order_lines_json ? JSON.parse(p.evacuation_order_lines_json) : [];
      } catch {
        evacuationLines = [];
      }
      selectFire({
        type:      'incident',
        id:        p.id,
        name:      p.name,
        lat:       evt.lngLat.lat,
        lng:       evt.lngLat.lng,
        acres:     num(p.acres),
        contained: num(p.contained),
        state:     p.state,
        county:    p.county,
        personnel: num(p.personnel),
        status:    p.status,
        cause:     p.cause || 'Under Investigation',
        source:    p.source,
        started:   p.started,
        updated:   p.updated,
        url:       p.url,
        created_by: p.created_by,
        createdAt: p.createdAt,
        location_description: p.location_description,
        evacuation_title: p.evacuation_title,
        evacuation_summary: p.evacuation_summary,
        evacuation_orders: num(p.evacuation_orders) || 0,
        evacuation_warnings: num(p.evacuation_warnings) || 0,
        evacuation_order_lines: evacuationLines,
        updates,
      });
    } else if (feature.layer.id === 'user-reports-circle') {
      selectFire({
        type:        'user-report',
        id:          p.id,
        name:        p.title,
        title:       p.title,
        description: p.description,
        lat:         evt.lngLat.lat,
        lng:         evt.lngLat.lng,
        created_at:  p.created_at,
        user_id:     p.user_id,
      });
    } else if (feature.layer.id === 'evac-zones-fill') {
      const isIpaws = p.source === 'ipaws';
      selectFire({
        type:           'evacuation-zone',
        id:             p.id || null,
        name:           p.zoneName || 'Evacuation Zone',
        warningType:    p.warningType,
        zoneName:       p.zoneName,
        county:         p.county,
        agency:         p.agency         || null,
        jurisdiction:   p.jurisdiction   || null,
        instructions:   p.instructions   || null,
        comments:       p.comments       || null,
        externalURL:    p.externalURL,
        effectiveDate:  p.effectiveDate,
        expirationDate: p.expirationDate,
        source:         p.source         || null,
        lat:            evt.lngLat.lat,
        lng:            evt.lngLat.lng,
        ...(isIpaws && {
          ipawsIdentifier: p.ipawsIdentifier,
          ipawsHeadline: p.ipawsHeadline,
          ipawsDescription: p.ipawsDescription,
          ipawsEvent: p.ipawsEvent,
          ipawsSent: p.ipawsSent,
          ipawsExpires: p.ipawsExpires,
          ipawsSenderName: p.ipawsSenderName,
          ipawsInstruction: p.ipawsInstruction,
          ipawsAreaDesc: p.ipawsAreaDesc,
        }),
      });
    } else if (feature.layer.id === 'reporter-evac-zones-fill') {
      selectFire({
        type:          'reporter-evacuation-zone',
        id:            p.id || null,
        name:          p.title || 'Reporter Evacuation Zone',
        title:         p.title,
        zone_type:     p.zone_type,
        incident_name: p.incident_name,
        description:   p.description,
        county:        p.county,
        state:         p.state,
        effective_at:  p.effective_at,
        expires_at:    p.expires_at,
        source:        'reporter',
        lat:           evt.lngLat.lat,
        lng:           evt.lngLat.lng,
      });
    } else if (feature.layer.id === 'aqi-stations-circle') {
      selectFire({
        type:    'aqi',
        id:      p.id,
        name:    p.reportingArea,
        lat:     evt.lngLat.lat,
        lng:     evt.lngLat.lng,
        aqi:     num(p.aqi),
        category: p.category,
        pm25:    num(p.pm25),
      });
    } else if (feature.layer.id === 'weather-alerts-fill') {
      // Look up the full alert object from context so we get description, instruction, etc.
      // We spread full alert but override `type` with the routing key 'weather-alert',
      // preserving the NOAA event name as `eventType` (e.g. "Flood Advisory").
      const full = alerts?.find(a => a.id === p.id);
      if (full) {
        selectFire({ ...full, type: 'weather-alert', eventType: full.type });
      } else {
        selectFire({
          type:      'weather-alert',
          eventType: p.type,
          id:        p.id,
          headline:  p.headline,
          severity:  p.severity,
          expires:   p.expires,
        });
      }
    } else if (feature.layer.id === 'spc-md-fill') {
      // Open the SPC MD page in a new tab when the user clicks a polygon
      if (p.url) {
        window.open(p.url, '_blank', 'noopener,noreferrer');
      }
    }
  }, [measureActive, alerts, selectFire]);

  // Handle mouse move – update hover tooltip OR measurement preview
  const handleMouseMove = useCallback((evt) => {
    if (measureActive) {
      setMeasurePreview({ lng: evt.lngLat.lng, lat: evt.lngLat.lat });
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
      return;
    }
    const features = evt.features;
    if (features?.length) {
      setHoverFeature(features[0]);
      setHoverLngLat(evt.lngLat);
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = 'pointer';
      }
    } else {
      setHoverFeature(null);
      setHoverLngLat(null);
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = '';
      }
    }
  }, [measureActive]);

  const handleMouseLeave = useCallback(() => {
    setMeasurePreview(null);
    setHoverFeature(null);
    setHoverLngLat(null);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = '';
    }
  }, []);

  // Rate-limit HRRR WMS tile requests (9 999 / day)
  const TRANSPARENT_TILE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  const transformRequest = useCallback((url, resourceType) => {
    if (resourceType === 'Tile' && url.includes('nomads.ncep.noaa.gov')) {
      if (hrrRateLimiter.tryAcquire()) {
        return { url };
      }
      console.warn('[HRRR rate-limiter] 9 999 daily requests reached – serving blank tile');
      return { url: TRANSPARENT_TILE };
    }
  }, []);

  // Sync viewport to context
  const handleMove = useCallback((evt) => {
    setViewport(evt.viewState);
  }, [setViewport]);

  return (
    <div className="absolute inset-0 bg-sentinel-900">
      {/* Wildfire tab: fire weather outlook selector only (convective uses combined control on weather tab) */}
      {isWildfireTab && layers.fireWeatherOutlooks && (
        <FireWeatherOutlookSelector
          outlookType={fireWxOutlookType}
          onOutlookTypeChange={onFireWxOutlookTypeChange}
          activeDay={fireWxActiveDay}
          onActiveDayChange={onFireWxActiveDayChange}
          loading={fireWeatherOutlooksLoading}
          validTime={fireWxValidTime}
        />
      )}

      {isWildfireTab && layers.ndgdSmokeForecast && (
        <NdgdSmokeTimeSlider
          forecastHoursMs={ndgdForecastHoursMs}
          valueIndex={ndgdSmokeHourIndex}
          onIndexChange={setNdgdSmokeHourIndex}
        />
      )}

      {/* Weather tab: one control for convective + fire-weather SPC outlooks */}
      {isWeatherTab && layers.spcWeatherOutlooks && (
        <SPCWeatherTabOutlookControls
          mode={spcWeatherOutlookMode}
          onModeChange={onSpcWeatherOutlookModeChange}
          spcOutlookType={spcOutlookType}
          onSpcOutlookTypeChange={onSpcOutlookTypeChange}
          spcActiveDay={spcActiveDay}
          onSpcActiveDayChange={onSpcActiveDayChange}
          spcLoading={spcWeatherOutlookMode === 'convective' && spcOutlooksLoading}
          spcValidTime={spcValidTime}
          fireWxOutlookType={fireWxOutlookType}
          onFireWxOutlookTypeChange={onFireWxOutlookTypeChange}
          fireWxActiveDay={fireWxActiveDay}
          onFireWxActiveDayChange={onFireWxActiveDayChange}
          fireWxLoading={spcWeatherOutlookMode === 'fireWx' && fireWeatherOutlooksLoading}
          fireWxValidTime={fireWxValidTime}
        />
      )}

      <Map
        ref={mapRef}
        {...viewport}
        mapboxAccessToken={HAS_MAPBOX_TOKEN ? MAPBOX_TOKEN : undefined}
        mapStyle={MAP_STYLES[mapType] ?? MAP_STYLES.satellite}
        style={{ width: '100%', height: '100%', background: '#0a0c0e' }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMove={handleMove}
        onLoad={handleMapLoad}
        transformRequest={transformRequest}
        attributionControl={false}
        maxTileCacheSize={150}
        fadeDuration={150}
        projection="mercator"
      >
        {/* Navigation controls */}
        <NavigationControl position="bottom-right" style={{ marginBottom: '6rem' }} />
        <ScaleControl position="bottom-left" style={{ marginLeft: '1rem', marginBottom: '1rem' }} />

        {/* ── Data Layers (ordered back-to-front, each independently controlled via visibility) ── */}



        {/* GOES satellite imagery – visible/weather bands on weather tab;
            ABI-L2-MCMIP Day Land Cloud Fire RGB on wildfire tab */}
        <GOESLayer
          eastVisible={(isWeatherTab || isAllHazardTab) && layers.goesEast}
          westVisible={(isWeatherTab || isAllHazardTab) && layers.goesWest}
          fire16Visible={(isWildfireTab || isAllHazardTab) && layers.goesFire16}
          fire18Visible={(isWildfireTab || isAllHazardTab) && layers.goesFire18}
        />

        {/* NEXRAD radar reflectivity */}
        <RadarLayer visible={(isWeatherTab || isAllHazardTab) && layers.radar} />

        {/* Smoke forecast */}
        <SmokeLayer visible={(isWeatherTab || isAllHazardTab) && layers.smoke} />

        {/* Weather alert zones */}
        <WeatherAlertsLayer
          geoJSON={alertsGeoJSON}
          spcMdGeoJSON={spcMdGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.weatherAlerts}
        />

        {/* NHC tropical storm / hurricane centres, forecast cone, and track */}
        <NhcStormsLayer
          centersGeoJSON={nhcCentersGeoJSON}
          conesGeoJSON={nhcConesGeoJSON}
          tracksGeoJSON={nhcTracksGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.nhcStorms}
        />

        {/* SPC convective outlook polygons */}
        <SPCOutlookLayer
          geoJSON={spcOutlooksGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'convective'}
        />

        {/* Fire perimeter polygons */}
        <FirePerimetersLayer
          geoJSON={perimetersGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.firePerimeters}
        />

        {/* WFIGS incident location markers */}
        <IncidentLocationsLayer
          geoJSON={incidentsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.incidentLocations}
          useIconMarkers={hazardIconsLoaded}
        />

        {/* Incident dot markers – fires with no matching perimeter */}
        <FireIncidentsLayer
          geoJSON={incidentDotsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.incidentLocations}
          useIconMarkers={hazardIconsLoaded}
        />

        {/* AQI heatmap + stations — available on both wildfire and weather tabs */}
        <AQILayer
          geoJSON={aqiGeoJSON}
          visible={layers.aqi}
        />

        <StormReportsLayer
          idPrefix="nws-lsr"
          geoJSON={stormReportsGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.stormReports}
          opacity={0.9}
        />

        {/* California evacuation zones (official Cal OES feed) */}
        <EvacZonesLayer
          geoJSON={evacZonesGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.evacZones}
        />

        {/* Reporter-drawn evacuation zones */}
        <ReporterEvacZonesLayer
          geoJSON={reporterEvacZonesGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.reporterEvacZones}
        />

        <CriticalInfrastructureLayer
          transmissionGeoJSON={criticalInfrastructureTransGeoJSON}
          gasPipelinesGeoJSON={criticalInfrastructureGasGeoJSON}
          visible={criticalInfrastructureVisible}
        />

        <NationalMapCollegesLayer
          geoJSON={nationalMapCollegesGeoJSON}
          visible={nationalMapCollegesVisible}
        />

        {/* RAWS weather stations – visible on both wildfire and weather tabs */}
        <RAWSLayer
          geoJSON={rawsGeoJSON}
          visible={layers.rawsStations}
        />

        {/* AirNow monitor stations – individual sensor readings (wildfire tab) */}
        <AirNowMonitorsLayer
          geoJSON={airNowMonitorsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.airNowMonitors}
        />

        {/* NOAA CPC Monthly Drought Outlook polygons */}
        <DroughtOutlookLayer
          geoJSON={droughtOutlookGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.droughtOutlook}
        />

        {/* NOAA NDGD hourly smoke concentration (48h CONUS) */}
        <NdgdSmokeForecastLayer
          geoJSON={ndgdSmokeFilteredGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.ndgdSmokeForecast}
        />

        {/* SPC Fire Weather Outlook polygons – visible on wildfire tab */}
        <FireWeatherOutlookLayer
          geoJSON={fireWeatherOutlooksGeoJSON}
          visible={layers.fireWeatherOutlooks || ((isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx')}
          outlookType={fireWxOutlookType}
        />

        {/* NHC hurricane tracks + disturbance outlook – weather tab */}
        <NHCTropicalWeatherLayer
          trackGeoJSON={nhcTrackGeoJSON}
          observedTrackGeoJSON={nhcObservedTrackGeoJSON}
          coneGeoJSON={nhcConeGeoJSON}
          disturbanceGeoJSON={nhcDisturbanceGeoJSON}
          stormLabelsGeoJSON={nhcStormLabelsGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.nhcTropicalWeather}
        />

        {/* Fire hotspot points – rendered last (top) */}
        <FireHotspotsLayer
          geoJSON={hotspotsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.fireHotspots}
        />

        {/* Community-submitted reports (rendered on top of official data) */}
        <UserReportsLayer
          geoJSON={userReportsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.incidentLocations}
        />

        {/* Hazard category pin icons – wildfire + flood/weather on all-hazards tab */}
        <HazardCategoryMarkersLayer
          iconsLoaded={hazardIconsLoaded}
          fireVisible={(isWildfireTab || isAllHazardTab) && layers.incidentLocations}
          weatherVisible={(isWeatherTab || isAllHazardTab) && layers.weatherAlerts}
        />

        {/* Live flight tracking – always on top of all fire/weather layers */}
        <FlightLayer
          geoJSON={flightsGeoJSON}
          visible={layers.flights}
        />

        {/* User live location marker */}
        {userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="center"
          >
            <div className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-80" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white/80" />
            </div>
          </Marker>
        )}

        {/* Saved address markers – black map pins visible on wildfire and weather tabs */}
        {savedLocations.map(loc => (
          loc.latitude && loc.longitude ? (
            <Marker
              key={loc.id}
              longitude={Number(loc.longitude)}
              latitude={Number(loc.latitude)}
              anchor="bottom"
            >
              <div
                className="flex flex-col items-center cursor-default group"
                title={loc.address || loc.name}
              >
                <div className="relative">
                  <div className="w-7 h-7 rounded-full bg-black border-2 border-white flex items-center justify-center shadow-lg group-hover:bg-gray-900 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-black" />
                </div>
                {/* Label on hover */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block pointer-events-none z-10">
                  <div className="bg-sentinel-800 border border-sentinel-600 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap max-w-[200px]">
                    <p className="text-xs font-medium text-white truncate">{loc.address || loc.name}</p>
                    <p className="text-[10px] text-sentinel-400">Saved Address</p>
                  </div>
                </div>
              </div>
            </Marker>
          ) : null
        ))}

        {/* Measurement geometry – rendered last so it's always on top */}
        {measureActive && (
          <MeasurementLayer
            points={measurePoints}
            previewPoint={measurePoints.length > 0 ? measurePreview : null}
            mode={measureMode}
          />
        )}

        {/* Hover tooltip */}
        <HoverTooltip feature={hoverFeature} lngLat={hoverLngLat} />

        {/* Flight detail popup – shown on aircraft click */}
        {selectedFlight && selectedFlightLngLat && (
          <FlightDetailPopup
            flight={selectedFlight}
            lngLat={selectedFlightLngLat}
            onClose={() => { setSelectedFlight(null); setSelectedFlightLngLat(null); }}
          />
        )}
      </Map>

      {/* Measurement results panel – visible while tool is active */}
      {measureActive && (
        <MeasurementPanel
          mode={measureMode}
          points={measurePoints}
          onClear={clearMeasure}
          onClose={closeMeasure}
        />
      )}

      {/* Precipitation ring – center-locked dBZ sampler */}
      <PrecipitationRing
        active={precipRingActive}
        lat={viewport?.latitude}
        lng={viewport?.longitude}
      />

      {showLocationPrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-xl border border-sentinel-600 bg-sentinel-800 p-5 shadow-2xl">
            <h3 className="text-white text-base font-semibold">Use live location?</h3>
            <p className="mt-2 text-sm text-sentinel-300">
              Allow live location to place your current position on the map.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelLiveLocation}
                className="rounded-md border border-sentinel-500 px-3 py-1.5 text-sm text-sentinel-200 hover:bg-sentinel-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={allowLiveLocation}
                className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-400 transition-colors"
              >
                Use Live Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
