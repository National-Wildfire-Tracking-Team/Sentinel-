/**
 * MapDockSheet.jsx
 * The live map's pull-up controls sheet (DockSheet): every layer control that
 * docks on the bottom bar lives here, one tab per layer that is on. Several
 * can be on at once; each keeps its own tab. (The Models tab's forecast time
 * isn't a drawer: it stays docked open on the bar, see LiveTrackerPage.) Lives inside the layer providers so a tab's grabber can pulse while
 * that layer is loading.
 *
 * To give another layer slider controls, add its tab here.
 */

import { memo } from 'react';
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
  const isWildfire = activeMapTab === 'wildfire';
  const isWeatherish = activeMapTab === 'weather' || activeMapTab === 'allhazard';

  const tabs = [];
  if (mrms?.active) {
    tabs.push({ id: 'mrms', label: 'MRMS Radar', loading: Boolean(mrms.loading && !mrms.manifest), content: <MrmsPanel /> });
  }
  if (radarSite?.active) {
    tabs.push({ id: 'radarSite', label: 'Radar Site', loading: radarSiteLoading(radarSite), content: <RadarSitePanel /> });
  }
  if (satellite?.active) {
    tabs.push({
      id: 'satellite', label: 'Satellite', loading: Boolean(satellite.loading),
      content: <SatellitePanel overlays={satelliteOverlays} />,
    });
  }
  if (isWeatherish && layers.nhcTropical) {
    tabs.push({ id: 'nhcTropical', label: 'NHC Tropical', content: <NhcTropicalControls /> });
  }
  if (isWeatherish && layers.spcWeatherOutlooks) {
    tabs.push({ id: 'spcOutlooks', label: 'SPC Outlook', loading: Boolean(spc.loading), content: <SPCOutlookSelector {...spc} /> });
  }
  if (fireDanger?.anyOn) {
    tabs.push({ id: 'fireDanger', label: 'Fire Danger', loading: Boolean(fireDanger.sfp.loading), content: <FireDangerPanel /> });
  }
  if (isWildfire && layers.fireWeatherOutlooks) {
    tabs.push({ id: 'fireWxOutlooks', label: 'Fire Weather', content: <FireWeatherOutlookSelector {...fireWx} /> });
  }
  if (isWildfire && layers.ndgdSmokeForecast && smoke.forecastHoursMs.length >= 2) {
    tabs.push({ id: 'smoke', label: 'Smoke', content: <NdgdSmokeTimeSlider {...smoke} /> });
  }

  return (
    <DockSheet
      tabs={tabs}
      bottomOffset={bottomOffset}
      bottomBarWidth={bottomBarWidth}
      onSettledHeight={onSettledHeight}
    />
  );
});

export default MapDockSheet;
