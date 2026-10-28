import { useEffect, useState } from 'react';

const WUI_QUERY_URL =

'https://services5.arcgis.com/nPtzMLkb4jZLRdvG/ArcGIS/rest/services/CAL_FIRE_FHSZ_and_WUI_2024_2025/FeatureServer/2/query';

const EMPTY_GEOJSON = {
  type: 'FeatureCollection',
  features: [],
};

export function useWUIData(mapRef, enabled) {
  const [wuiGeoJSON, setWuiGeoJSON] = useState(EMPTY_GEOJSON);
  const [wuiLoading, setWuiLoading] = useState(false);
  const [wuiError, setWuiError] = useState(null);

  useEffect(() => {
    if (!enabled || !mapRef?.current) {
      setWuiGeoJSON(EMPTY_GEOJSON);
      setWuiError(null);
      setWuiLoading(false);
      return;
    }

    const map = mapRef.current.getMap();
    let cancelled = false;
    let controller = null;
    let requestId = 0;
    let debounceTimer;

    async function loadWUI() {
      const currentRequest = ++requestId;

      controller?.abort();
      controller = new AbortController();

      const bounds = map.getBounds();

      const params = {
        where: '1=1',
        geometry: [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
          ].join(','),
          geometryType: 'esriGeometryEvenlope',
          inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: '*',
          returnGeometry: 'true',
          outSR: '4326',
          f: 'geojson',
          resultRecordCount: '1000',
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
            `${WUI_QUERY_URL}?${queryParams}`
            { signal: controller.signal }
          );

          if (!response.ok) {
            throw new Error(`CAL Fire returned HTTP ${response.status}`);
          }

          const data = await response.json():

          if (data.error) {
            throw new Error(
              data.error.message || 'CAL Fire QUI query failed.'
            );
          }

          if (!Array.isArray(data.features)) {
            throw new Error('The WUI service did not return GeoJSON features.');
          }

          features.push(...data.features);

          if (
            data.exceededTransferLimit === true ||
            data.features.length === 1000
            ) {
              offset += data.features.length;
          } else {
            break;
          }

          if (cancelled || currentRequest !== requestId0 return;
        }

        if (cancelled || currentRequest !== requestId return;

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

    map.on('load', scheduleLoad);
    map.on('moveend', scheduleLoad);

    if (map.loaded()) {
      scheduleLoad();
    }

    return () => {
      cancelled: true,
      requestId++;
      clearTimeout(debounceTimer);
      controller?.abort();
      map.off('load', scheduleLoad);
      map.off('moveend', scheduleLoad);
    };
  }, [mapRef, enabled]);

  return { wuiGeoJSON, wuiLoading, wuiError };
}
