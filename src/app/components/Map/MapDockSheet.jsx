/**
 * MapDockSheet.jsx
 * The live map's pull-up controls sheet (DockSheet): every layer control that
 * docks on the bottom bar lives here, one tab per layer that is on. Several
 * can be on at once; each keeps its own tab. (The Models tab's forecast time
 * isn't a drawer: it stays docked open on the bar, see LiveTrackerPage.) Lives inside the layer providers so a tab's grabber can pulse while
 * that layer is loading.
 *
 * To give another layer slider controls, add its tab here, with the layer
 * switches its × turns off (`layers`).
 */

import { memo } from 'react';
import { useApp } from '../../context/AppContext';
import { STATION_LAYER_FIELDS } from '../../api/fireDanger/stations';
import { useMrmsContext } from '../../context/MrmsContext';
import { useFireDangerContext } from '../../context/FireDangerContext';
import { useRadarSiteContext } from '../../context/RadarSiteContext';
import { useSatelliteContext } from '../../context/SatelliteContext';
import DockSheet from './DockSheet';
import MrmsPanel from './MrmsPanel';
import FireDangerPanel from './FireDangerPanel';
import RadarSitePanel from './RadarSitePanel';
import SatellitePanel from './SatellitePanel';
import SPCOutlookSelector from './SPCOutlookSelector';
import FireWeatherOutlookSelector from './FireWeatherOutlookSelector';
import NdgdSmokeTimeSlider from './NdgdSmokeTimeSlider';
import NhcTropicalControls from '../LayerControl/NhcTropicalControls';
import AwcControls from '../LayerControl/AwcControls';
import { useAwcContext } from '../../context/AwcContext';

// Every switch behind the Fire Danger tab: turning the tab off clears them all.
const FIRE_DANGER_LAYERS = ['fireRiskOutlook', 'fuelModels', 'wfpi', 'lfmSamples', ...Object.keys(STATION_LAYER_FIELDS)];

/** A station's scan is loading. */
const radarSiteLoading = (r) => Boolean(r.site) && (r.status === 'idle' || (r.status === 'loading' && !r.scan));

/**
 * @param {{
 *   activeMapTab: string, layers: object,
 *   satelliteOverlays?: object|null,
 *   spc: { outlookType, onOutlookTypeChange, activeDay, onActiveDayChange, loading, validTime },
 *   fireWx: { outlookType, onOutlookTypeChange, activeDay, onActiveDayChange },
 *   smoke: { forecastHoursMs: number[], valueIndex: number, onIndexChange: (i: number) => void },
 *   bottomOffset: number, bottomBarWidth?: number, onSettledHeight?: (px: number) => void,
 * }} props
 */
const MapDockSheet = memo(function MapDockSheet({
  activeMapTab, layers, satelliteOverlays, spc, fireWx, smoke, bottomOffset, bottomBarWidth, onSettledHeight,
}) {
  const mrms = useMrmsContext();
  const radarSite = useRadarSiteContext();
  const satellite = useSatelliteContext();
  const fireDanger = useFireDangerContext();
  const awc = useAwcContext();
  const { setLayer } = useApp();
  const isWildfire = activeMapTab === 'wildfire';
  const isWeatherish = activeMapTab === 'weather' || activeMapTab === 'allhazard';

  const tabs = [];
  if (mrms?.active) {
    tabs.push({ id: 'mrms', layers: ['mrms'], label: 'Composite Radar', loading: Boolean(mrms.loading && !mrms.manifest), content: <MrmsPanel /> });
  }
  if (radarSite?.active) {
    tabs.push({ id: 'radarSite', layers: ['radarSites'], label: 'Individual Radar Site', loading: radarSiteLoading(radarSite), content: <RadarSitePanel /> });
  }
  if (satellite?.active) {
    tabs.push({
      id: 'satellite', layers: ['satellite'], label: 'Satellite Imagery', loading: Boolean(satellite.loading),
      content: <SatellitePanel overlays={satelliteOverlays} />,
    });
  }
  if (isWeatherish && layers.nhcTropical) {
    tabs.push({ id: 'nhcTropical', layers: ['nhcTropical'], label: 'NHC Tropical', content: <NhcTropicalControls /> });
  }
  if (isWeatherish && layers.awc) {
    const awcLoading = Boolean(awc && Object.values(awc.status).some((s) => s.loading));
    // Many more switches than the other drawers: may reach 3/8 of the way up the screen instead of a third.
    tabs.push({ id: 'awc', layers: ['awc'], label: 'Aviation Weather', loading: awcLoading, maxShare: 3 / 8, content: <AwcControls /> });
  }
  if (isWeatherish && layers.spcWeatherOutlooks) {
    tabs.push({ id: 'spcOutlooks', layers: ['spcWeatherOutlooks'], label: 'SPC Outlook', loading: Boolean(spc.loading), content: <SPCOutlookSelector {...spc} /> });
  }
  if (fireDanger?.anyOn) {
    tabs.push({ id: 'fireDanger', layers: FIRE_DANGER_LAYERS, label: 'Fire Danger', loading: Boolean(fireDanger.sfp.loading), content: <FireDangerPanel /> });
  }
  if (isWildfire && layers.fireWeatherOutlooks) {
    tabs.push({ id: 'fireWxOutlooks', layers: ['fireWeatherOutlooks'], label: 'Fire Weather', content: <FireWeatherOutlookSelector {...fireWx} /> });
  }
  if (isWildfire && layers.ndgdSmokeForecast && smoke.forecastHoursMs.length >= 2) {
    tabs.push({ id: 'smoke', layers: ['ndgdSmokeForecast'], label: 'Smoke', content: <NdgdSmokeTimeSlider {...smoke} /> });
  }

  // A tab's ×: the same as switching its layer off in the layer panel.
  const closeTab = (id) => tabs.find((t) => t.id === id)?.layers.forEach((key) => setLayer(key, false));

  return (
    <DockSheet
      tabs={tabs}
      onCloseTab={closeTab}
      bottomOffset={bottomOffset}
      bottomBarWidth={bottomBarWidth}
      onSettledHeight={onSettledHeight}
    />
  );
});

export default MapDockSheet;
