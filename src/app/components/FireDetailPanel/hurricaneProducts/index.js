/**
 * hurricaneProducts
 * The NHC products in the hurricane panel's rail, in order: key, label, the
 * square's color (from the map palettes), the map layer selecting it turns
 * on, and the view.
 */

import AffectedAreas from './AffectedAreas';
import ArrivalTime from './ArrivalTime';
import CurrentStats from './CurrentStats';
import ForecastDiscussion from './ForecastDiscussion';
import Rainfall from './Rainfall';
import StormSurge from './StormSurge';
import WatchesWarnings from './WatchesWarnings';
import WindProbabilities from './WindProbabilities';

export const HURRICANE_PRODUCTS = [
  { key: 'current', label: 'Current stats', color: null, layer: 'nhcWindRadii', View: CurrentStats },
  { key: 'watches', label: 'Watches & warnings', color: '#FF0000', layer: 'nhcWatchWarning', View: WatchesWarnings },
  { key: 'discussion', label: 'Forecast discussion', color: '#cbd5e1', layer: null, View: ForecastDiscussion },
  { key: 'windProb', label: 'Wind speed probabilities', color: '#e69800', layer: 'nhcWindProb', View: WindProbabilities },
  { key: 'arrival', label: 'Time of arrival', color: '#ffffff', layer: 'nhcArrival', View: ArrivalTime },
  { key: 'surge', label: 'Storm surge', color: '#0070ff', layer: 'nhcSurge', View: StormSurge },
  { key: 'rainfall', label: 'Rainfall', color: '#38bdf8', layer: null, View: Rainfall },
  { key: 'affected', label: 'Affected areas', color: '#a78bfa', layer: 'weatherAlerts', View: AffectedAreas },
];
