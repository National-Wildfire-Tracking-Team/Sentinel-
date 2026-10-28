/**
 * Sentinel design tokens, mirrored from the web app: tailwind.config.js (fire) and the dark-theme
 * CSS variables in src/index.css (sentinel surface and text shades). Names follow the Tailwind
 * classes the web uses, so `bg-sentinel-800` is `sentinel[800]` and `text-sentinel-200` is
 * `sentinelText[200]`.
 */
export const fire = {
  50: '#fff8ed',
  100: '#ffefd4',
  200: '#ffdba8',
  300: '#ffc171',
  400: '#ff9938',
  500: '#ff7410',
  600: '#ff5a00',
  700: '#cc3d02',
  800: '#a13109',
  900: '#822a0c',
};

/** Surface grays (bg-/border-sentinel-*). */
export const sentinel = {
  100: '#c0cad6',
  200: '#8a9ab0',
  300: '#5a6a7a',
  400: '#3d4a58',
  500: '#2d3540',
  600: '#222830',
  700: '#1a1f26',
  800: '#111418',
  850: '#0d1013',
  900: '#0a0c0e',
};

/** Text grays (text-sentinel-*), lighter than the surface shades of the same number. */
export const sentinelText = {
  100: '#d4dce5',
  200: '#a9b6c8',
  300: '#8695a6',
  400: '#66758a',
  500: '#4f5b6b',
};

/** Tailwind accent shades the web uses for status. */
export const accent = {
  red400: '#f87171',
  red600: '#dc2626',
  amber400: '#fbbf24',
  orange400: '#fb923c',
  emerald400: '#34d399',
  sky400: '#38bdf8',
  sky600: '#0284c7',
  indigo600: '#4f46e5',
  yellow300: '#fde047',
  slate100: '#f1f5f9',
  white: '#ffffff',
};

export const colors = {
  fire50: fire[50],
  fire300: fire[300],
  fire400: fire[400],
  fire500: fire[500],
  fire600: fire[600],
  fire700: fire[700],

  bg: sentinel[900],
  surface: sentinel[850],
  surfaceRaised: sentinel[800],
  border: sentinel[700],
  borderStrong: sentinel[600],
  muted: sentinel[400],

  text: sentinelText[100],
  textMuted: sentinelText[200],
  textFaint: sentinelText[400],

  // Containment ramp from IncidentLocationsLayer.jsx
  uncontained: '#c8102e',
  containment25: '#e8801a',
  containment50: '#eab308',
  containment75: '#84cc16',
  contained: '#6b7280',
  clusterContained: '#9ca3af',

  perimeter: '#ff6600',
  report: '#ff4500',
  danger: '#ef4444',
  success: '#22c55e',
};

/** Floating chrome: `bg-sentinel-900/90 border border-sentinel-600 rounded-2xl`. */
export const chrome = {
  backgroundColor: 'rgba(10,12,14,0.9)',
  borderColor: sentinel[600],
  borderWidth: 1,
};

export const radius = { sm: 6, md: 10, lg: 12, xl: 16, xxl: 22 };

export const font = {
  mono: 'Menlo',
};

/** Same thresholds as the web map's CONTAINMENT_COLOR expression. */
export function containmentColor(contained: number | null | undefined): string {
  const c = contained ?? 0;
  if (c >= 100) return colors.contained;
  if (c < 1) return colors.uncontained;
  if (c < 50) return colors.containment25;
  if (c < 75) return colors.containment50;
  return colors.containment75;
}
