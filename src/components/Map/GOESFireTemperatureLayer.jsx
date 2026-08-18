import { useEffect } from 'react';

const SOURCE_ID = 'goes-fire-temperature-source';
const LAYER_ID = 'goes-fire-temperature';

const REFRESH_MS = 5 * 60 * 1000;

// [long, lat]
const CONUS_COORDINATES = [
  [-125, 60], // top left
  [-60, 60], // top right
  [-60, 14], // bottom right
  [-125, 14], // bottom left
];

function getGOESTimeStamp() {
  const date = new Date(Date.now() - 5 * 60 * 1000);

  date.setUTCSeconds(0, 0);

  const minutes = date.getUTCMinutes();

  date.setUTCMinutes(minutes - (minutes % 5));

  const year = date.getUTCFullYear();

  const startOfYear = new Date(Date.UTC(year, 0, 1));

  const dayOfYear =
    Math.floor((date.getTime() - startOfYear.getTime()) / 86400000) + 1;

  const yyyy = String(year);

  const ddd = String(dayOfYear).padStart(3, '0');

  const hh = String(date.getUTCHours()).padStart(2, '0');

  const mm = String(date.getUTCMinutes()).padStart(2, '0');

  return `${yyyy}${ddd}${hh}${mm}`;
}

function getGOESImageUrl() {
  const timestamp = getGOESTimeStamp();

  return (
    'https://cdn.star.nesdis.noaa.gov/' +
    'GOES19/ABI/CONUS/FireTemperature/' +
    `${timestamp}_GOES19-ABI-CONUS-FireTemperature-5000x3000.jpg`
  );
}

export default function GOESFireTemperatureLayer({
  mapRef,
  visible = false,
  opacity = 0.65,
}) {
  useEffect(() => {
    const map = mapRef?.current;

    if (!map) {
      return undefined;
    }

    const addGOESLayer = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'image',
          url: getGOESImageUrl(),
          coordinates: CONUS_COORDINATES,
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: {
            'raster-opacity': opacity,
            'raster-fade-duration': 300,
          },
          layout: {
            visibility: visible ? 'visible' : 'none',
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      addGOESLayer();
    } else {
      map.once('load', addGOESLayer);
    }

    return undefined;
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef?.current;

    if (!map) {
      return;
    }

    if (!map.getLayer(LAYER_ID)) {
      return;
    }

    map.setLayoutProperty(
      LAYER_ID,
      'visibility',
      visible ? 'visible' : 'none'
    );
  }, [mapRef, visible]);

  useEffect(() => {
    const map = mapRef?.current;

    if (!map) {
      return;
    }

    if (!map.getLayer(LAYER_ID)) {
      return;
    }

    map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
  }, [mapRef, opacity]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const refreshGOESImage = () => {
      const map = mapRef?.current;

      if (!map) {
        return;
      }

      const source = map.getSource(SOURCE_ID);

      if (!source || !source.updateImage) {
        return;
      }

      source.updateImage({
        url: getGOESImageUrl(),
        coordinates: CONUS_COORDINATES,
      });
    };

    refreshGOESImage();

    const interval = setInterval(refreshGOESImage, REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [mapRef, visible]);

  return null;
}
