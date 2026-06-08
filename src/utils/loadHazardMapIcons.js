const ICONS = [
  { id: 'pin-wildfire',      src: '/icons/pin-wildfire.svg' },
  { id: 'pin-flood-weather', src: '/icons/pin-flood-weather.svg' },
  { id: 'pin-usar',          src: '/icons/pin-usar.svg' },
];

export function loadHazardMapIcons(map, onAllLoaded) {
  let remaining = ICONS.length;

  ICONS.forEach(({ id, src }) => {
    if (map.hasImage(id)) {
      remaining -= 1;
      if (remaining === 0) onAllLoaded?.();
      return;
    }
    const img = new Image(60, 80);
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 1 });
      remaining -= 1;
      if (remaining === 0) onAllLoaded?.();
    };
    img.onerror = () => {
      remaining -= 1;
      if (remaining === 0) onAllLoaded?.();
    };
    img.src = src;
  });
}
