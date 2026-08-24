// Source: https://fsapps.nwcg.gov/psp/npsg/forecast/home/downloads

// REST service: https://fsapps.nwcg.gov/psp/arcgis/rest/services/npsg/outlook

import { useEffect } from 'react';

const BASE_URL = 
  'https://fsapps.nwcg.gov/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer';

const SOURCE_ID = 'sentinel-fire-risk-course';
const FILL_LAYER_ID = 'sentinel-fire-risk-fill';
const OUTLINE_LAYER_ID = 'sentinel-fire-risk-outline';

const REFRESH_MS = 15 * 60 * 1000;

// Risk colors: gray = little/no significant potential, green = low, yellow = moderate, orange = critical, red = ignition / high potential

const RSIK_COLORS = {
  NONE = '#9c9c9c',
  LOW: '#5fb336',
  MODERATE: '#ffff40',
  CRITICAL: '#ff8c00',
  IGNITION: '#ff0000',
  UNKNOWN: '#cccccc',

  function getLayer(day) {
    return Number(day) - 1;
  }

function getRiskCategory(properties = {}) {
  const type = String(
    properties.type ?? ''
  ).toUpperCase();

  const drynessCode = Number(
    properties.drynesscode
  );

  if (type === 'IGNITION') {
    return 'IGNITION';
  }

  if (type === 'CRITICAL') {
    return 'CRITICAL';
  }

  if (
    drynessCode === 3 &&
    !type
  ) {
    return 'IGNITION';
  }

  if (drynessCode === 2) {
    return 'MODERATE';
  }

  if (drynessCode === 1) {
    return 'LOW';
  }

  if (drynessCode === 0) {
    return 'NONE';
  }

  return "UNKNOWN';
}

async funtion fetchFireRisk(day, signal) {
  const layerId = getLayerId(day);

  const params = new URLSearchParams({
    where: '1=1',

    outFields: [
      'drynesscode',
      'symbol',
      'type',
      'timestampdate',
      'forecastdatapointid',
      'isvalid',
      'nat_code',
      'gacc',
      ].join(','),

    returnGeometry: 'true',

    f: 'geojson',

    outSR: '4326',
  });

  const url = 
    '${BASE_URL}/${layerId}/query?${params.toString()}';

  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/geo+json, application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      'NIFC Fire Request Failed: ${response.status}'
      );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      data.error.message ||
      'NIFC Fire Risk API returned an error.'
      );
  }

  return data;
}

function normalizeGeoJSON(data, day) {
  if (!data?.features) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  return {
    type: 'FeatureCollection',

    features: data.features
      .filters((feature) => feature.geometry)
      .map((feature) => {
        const properties = feature.properties || {};

        return {
          ...feature,

          properties: {
            ...properties,

            fireRiskDay: day,

            riskCategory:
              getRiskCategory(properties),

            riskType: 
              properties.type ?? null,

            drynessCode:
              properties.drynesscode ?? null,

            valid:
              properties.isvalid ?? null,

            gacc:
              properties.gacc ?? null,

            nationalCode:
              properties.nat_code ?? null,

            forecastTimeStamp:
              properties.timestampdate ?? null,
          },
        };
      }),
  };
}

export default funtion FireRiskOutlook({
  map,
  selectedDay = 1,
  visible = true,
  opacity = 0.38,
  onFeatureClick,
  onError,
}) {

  const day = Math.min(
    7,
    Math.max(
      1,
      Number(selectedDay) || 1
    )
  );

  useEffect(() => {
    if (!map) {
      return undefined;
    }

    const controller = 
      new AbortController();

    let destroyed = false;

    const cleanup = () => {
      if (
        map.getLayer(OUTLINE_LAYER_ID)
      ) {
        map.removeLayer(
          OUTLINE_LAYER_ID
        );
      }

      if (
        map.getLayer(FILL_LAYER_ID)
      ) {
        map.removeLayer(
          FILL_LAYER_ID
        );
      }

      if (
        map.getSource(SOURCE_ID)
      ) {
        map.removeSource(
          SOURCE_ID
        );
      }

    const addMapLayers= (
      geojson
    ) => {
      if (destroyed) {
        return;
      }

      cleanup();

      map.addSource(
        SOURCE_ID,
        {
          type: 'geojson',
          data: geojson,
        }
      );

      map.addLayer({
        id: FILL_LAYER_ID,

        type: 'fill',
        source: SOURCE_ID,

        layout: {
          visibility: visible
            ? 'visible'
            : 'none',
        },

        paint: {
          'fill-color': [
            'match',

            ['get', 'riskCategory']

            'IGNITION',
            RISK_COLORS.IGNITION,

            'CRITICAL',
            RISK_COLORS.CRITICAL,

            'MODERATE',
            RISK_COLORS.MODERATE,

            'LOW',
            RISK_COLORS.LOW,

            'NONE',
            RISK_COLORS.NONE,

            RISK_COLORS.UNKNOWN,
          ],

          'fill-opacity': opacity,
        },
      });

      map.addLayer({
        id: OUTLINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,

        layout: {
          visibility: visible 
            ? 'visible'
            : 'none',
        },

        paint {
          'line-color': [
            'match',

            ['get', 'riskCategory'],

            'IGNITION',
            RISK_COLORS.IGNITION,

            'CRITICAL',
            RISK_COLORS.CRITICAL,

            'MODERATE',
            RISK_COLORS.MODERATE,

            'LOW',
            RISK_COLORS.LOW,

            'NONE',
            RISK_COLORS.NONE,

            RISK_COLORS.UNKNOWN,
          ],

          'line-width': 1,
          'line-opacity': 0.65,
        },
      });
    };

    const handleClick = (
      event
      ) => {
        const features = 
          map.queryRenderedFeatures(
            event.point,
            {
              layers: [
                FILL_LAYER_ID,
              ],
            }
          );

        if (
          !features.length
        ) {
          return;
        }

        const feature = 
          features[0];

        if (
          typeof onFeatureClick ===
          'function'
        ) {
          onFeatureClick({
            feature,
            day,
            properties:
              feature.properties || {},
          });
        }
      };

      const load = async () => {
        try {
          const data =
            await fetchFireRisk(
              day,
              controller.signal
            );

          if (destroyed) {
            return;
          }

          const geojson = 
            normalizeGeoJSON(
              data,
              day
            );

          addMapLayers(
            geojson
          );

        } catch (error) {
          if (
            error.name ===
            'AbortError'
          ) {
            return;
          }

          console.error(
            'FireRiskOutlook:',
            error
          );

          if (
            typeof onError ===
            'function'
          ) {
            onError(error);
          }
        }
      };

      load();

      const refreshInterval = 
        setInterval(
          load,
          REFRSH_MS
        );

      map.on(
        'click',
        FILL_LAYER_ID,
        handleClick
      );

      map.on(
        'mouseenter',
        FILL_LAYER_ID,
        () => {
          map.getCanvas().style.cursor = 
            'pointer';
        }
      );

      map.on(
        'mouseleave',
        FILL_LAYER_ID,
        () => {
          map.getCanvas().style.cursor = 
            '';
        }
      );

      return () => {
        destroyed = true;

        controller.abort();

        clearInterval(
          refreshInterval
        );

        if (
          map.getLayer(
            FILL_LAYER_ID
          )
        ) { 
          map.off(
            'click',
            FILL_LAYER_ID,
            handleClick
          );
        }

        cleanup();

        map.getCanvas().style.cursor = 
          '';
      }
    }, [
      map,
      day,
      visible,
      opacity,
      onFeatureClick,
      onError,
    ]);

    return null;
  }
    
