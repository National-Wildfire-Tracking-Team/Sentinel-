import { useEffect, useState } from 'react';

const WUI_QUERY_URL =

'https://services5.arcgis.com/nPtzMLkb4jZLRdvG/ArcGIS/rest/services/CAL_FIRE_FHSZ_and_WUI_2024_2025/FeatureServer/2/query';

// The service's max page size.
const PAGE_SIZE = 2000;

// The WUI is a 30 m grid: a statewide view is ~36k cells. Below this zoom
// the layer is cleared instead of paging through all of them.
const MIN_ZOOM = 8;

const EMPTY_GEOJSON = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Fetches CAL FIRE WUI polygons for the current viewport, refetching on pan/zoom.
 * @param {object|null} map  maplibre/mapbox map instance (from the map's onLoad event)
 * @param {boolean} enabled
 */
export function useWUIData(map, enabled) {
  const [wuiGeoJSON, setWuiGeoJSON] = useState(EMPTY_GEOJSON);
  const [wuiLoading, setWuiLoading] = useState(false);
  const [wuiError, setWuiError] = useState(null);

  useEffect(() => {
    if (!enabled || !map) {
      setWuiGeoJSON(EMPTY_GEOJSON);
      setWuiError(null);
      setWuiLoading(false);
      return;
    }

    let cancelled = false;
    let controller = null;
    let requestId = 0;
    let debounceTimer;

    async function loadWUI() {
      const currentRequest = ++requestId;

      controller?.abort();
      controller = new AbortController();

      if (map.getZoom() < MIN_ZOOM) {
        setWuiGeoJSON(EMPTY_GEOJSON);
        setWuiLoading(false);
        return;
      }

      const bounds = map.getBounds();

      const params = {
        where: '1=1',
        geometry: [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
          ].join(','),
          geometryType: 'esriGeometryEnvelope',
          inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: '*',
          returnGeometry: 'true',
          outSR: '4326',
          f: 'geojson',
          resultRecordCount: String(PAGE_SIZE),
      };

      setWuiLoading(true);
      setWuiError(null);

      try {
        const features = [];
        let offset = 0;

        while (true) {
          const queryParams = new URLSearchParams({
            ...params,
            resultOffset: String(offset),
          });

          const response = await fetch(
            `${WUI_QUERY_URL}?${queryParams}`,
            { signal: controller.signal }
          );

          if (!response.ok) {
            throw new Error(`CAL Fire returned HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(
              data.error.message || 'CAL Fire WUI query failed.'
            );
          }

          if (!Array.isArray(data.features)) {
            throw new Error('The WUI service did not return GeoJSON features.');
          }

          features.push(...data.features);

          if (
            data.exceededTransferLimit === true ||
            data.features.length === PAGE_SIZE
            ) {
              offset += data.features.length;
          } else {
            break;
          }

          if (cancelled || currentRequest !== requestId) return;
        }

        if (cancelled || currentRequest !== requestId) return;

        setWuiGeoJSON({
          type: 'FeatureCollection',
          features,
        });
      } catch (error) {
        if (error.name !== 'AbortError' && !cancelled) {
          console.error('Failed to load CAL Fire WUI data:', error);
          setWuiError(error.message);
        }
      } finally { 
        if (!cancelled && currentRequest === requestId) {
          setWuiLoading(false);
        }
      }
    }

    function scheduleLoad() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadWUI, 350);
    }

    // The instance is only handed over after the map's 'load' event, so
    // fetch the initial viewport right away and then follow pan/zoom.
    map.on('moveend', scheduleLoad);
    scheduleLoad();

    return () => {
      cancelled = true;
      requestId++;
      clearTimeout(debounceTimer);
      controller?.abort();
      map.off('moveend', scheduleLoad);
    };
  }, [map, enabled]);

  return { wuiGeoJSON, wuiLoading, wuiError };
}
