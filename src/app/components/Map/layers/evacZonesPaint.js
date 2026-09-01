/**
 * Evacuation zone map paint constants (fill opacity/colors, line opacity).
 * Kept separate from the layer component for tests and fast-refresh hygiene.
 */

/** Severity fill colors — exported for paint contract tests. */
export const EVAC_ZONE_FILL_COLORS = {
  'Evacuation Order': '#ef4444',
  'Evacuation Warning': '#f97316',
  'Evacuation Watch': '#eab308',
  default: '#f97316',
};

/**
 * Translucent fill opacities so basemap and fire markers remain visible under zones.
 * Contract: 0.05–0.15, Order ≥ Warning ≥ Watch.
 */
export const EVAC_ZONE_FILL_OPACITY = {
  'Evacuation Order': 0.10,
  'Evacuation Warning': 0.08,
  'Evacuation Watch': 0.06,
  default: 0.07,
};

/** Outline line opacity for official and reporter boundaries. */
export const EVAC_ZONE_LINE_OPACITY = 0.9;
