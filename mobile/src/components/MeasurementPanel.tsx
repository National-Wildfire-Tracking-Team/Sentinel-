/**
 * Distance and area measurement, after the web's MeasurementTool.jsx: taps on the map place
 * points, and this floating panel shows the path length, or for an area the acres, square miles,
 * square kilometres and perimeter. Adds Undo for mis-taps, which are easy on a phone.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Hexagon, Ruler, Trash2, Undo2, X } from 'lucide-react-native';

import { accent, sentinel, sentinelText } from '@/theme';

export type MeasureMode = 'distance' | 'polygon';
export interface MeasureState {
  mode: MeasureMode;
  points: [number, number][];
}

const ORANGE_400 = '#fb923c';

/** Haversine great-circle distance between two [lng, lat] points, in km. */
function haversineKm([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Polygon area in km² (local equirectangular projection + shoelace), as on the web. */
function polygonAreaKm2(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const lat0 = (coords[0][1] * Math.PI) / 180;
  const lng0 = (coords[0][0] * Math.PI) / 180;
  const pts = coords.map(([lng, lat]) => [((lng * Math.PI) / 180 - lng0) * 6371 * Math.cos(lat0), ((lat * Math.PI) / 180 - lat0) * 6371]);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(area / 2);
}

function formatDistance(km: number): string {
  const mi = km * 0.621371;
  if (mi < 0.1) return `${(mi * 5280).toFixed(0)} ft  /  ${(km * 1000).toFixed(0)} m`;
  return `${mi.toFixed(2)} mi  /  ${km.toFixed(2)} km`;
}

/** The line, fill and vertices to draw on the map. */
export function measureShape({ mode, points }: MeasureState): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (mode === 'polygon' && points.length >= 3) {
    features.push({ type: 'Feature', properties: { kind: 'area' }, geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } });
  }
  if (points.length >= 2) {
    const line = mode === 'polygon' && points.length >= 3 ? [...points, points[0]] : points;
    features.push({ type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: line } });
  }
  points.forEach((p, i) => features.push({ type: 'Feature', properties: { kind: 'vertex', index: i }, geometry: { type: 'Point', coordinates: p } }));
  return { type: 'FeatureCollection', features };
}

export function MeasurementPanel({
  measure,
  onUndo,
  onClear,
  onClose,
}: {
  measure: MeasureState;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { mode, points } = measure;
  let totalKm = 0;
  for (let i = 1; i < points.length; i++) totalKm += haversineKm(points[i - 1], points[i]);
  const areaKm2 = mode === 'polygon' ? polygonAreaKm2(points) : 0;
  const perimeterKm = mode === 'polygon' && points.length >= 3 ? totalKm + haversineKm(points[points.length - 1], points[0]) : 0;
  const Icon = mode === 'polygon' ? Hexagon : Ruler;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Icon size={15} color={ORANGE_400} />
        <Text style={styles.title}>{mode === 'polygon' ? 'Area Measurement' : 'Distance Measurement'}</Text>
        <Pressable onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close measurement tool">
          <X size={16} color={sentinelText[300]} />
        </Pressable>
      </View>

      {points.length === 0 ? <Text style={styles.hint}>Tap the map to place points.</Text> : null}
      {mode === 'distance' && points.length === 1 ? <Text style={styles.hint}>Tap to add another point.</Text> : null}
      {mode === 'distance' && points.length >= 2 ? (
        <View>
          <Text style={styles.value}>{formatDistance(totalKm)}</Text>
          <Text style={styles.hint}>
            {points.length} points · {points.length - 1} segment{points.length > 2 ? 's' : ''}
          </Text>
        </View>
      ) : null}
      {mode === 'polygon' && points.length > 0 && points.length < 3 ? (
        <Text style={styles.hint}>
          Add {3 - points.length} more point{3 - points.length > 1 ? 's' : ''} to measure area.
        </Text>
      ) : null}
      {mode === 'polygon' && points.length >= 3 ? (
        <View style={{ gap: 8 }}>
          <View>
            <Text style={styles.label}>Area</Text>
            <Text style={styles.value}>{(areaKm2 * 247.105).toLocaleString(undefined, { maximumFractionDigits: 1 })} acres</Text>
            <Text style={styles.hint}>
              {(areaKm2 * 0.386102).toFixed(3)} mi²  ·  {areaKm2.toFixed(4)} km²
            </Text>
          </View>
          <View style={styles.divider}>
            <Text style={styles.label}>Perimeter</Text>
            <Text style={styles.body}>{formatDistance(perimeterKm)}</Text>
          </View>
          <Text style={styles.small}>{points.length} vertices</Text>
        </View>
      ) : null}

      {points.length > 0 ? (
        <View style={styles.footer}>
          <Pressable onPress={onUndo} hitSlop={6} style={styles.action} accessibilityRole="button">
            <Undo2 size={13} color={sentinelText[300]} />
            <Text style={styles.actionText}>Undo</Text>
          </Pressable>
          <Pressable onPress={onClear} hitSlop={6} style={styles.action} accessibilityRole="button">
            <Trash2 size={13} color={sentinelText[300]} />
            <Text style={styles.actionText}>Clear</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: 'rgba(10,12,14,0.95)',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { flex: 1, color: ORANGE_400, fontSize: 14, fontWeight: '600' },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  hint: { color: sentinelText[300], fontSize: 12, marginTop: 2 },
  label: { color: sentinelText[300], fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  value: { color: accent.white, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  body: { color: accent.white, fontSize: 14, fontVariant: ['tabular-nums'] },
  small: { color: sentinelText[400], fontSize: 12 },
  divider: { borderTopWidth: 1, borderTopColor: sentinel[700], paddingTop: 8 },
  footer: { flexDirection: 'row', gap: 18, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: sentinel[700] },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  actionText: { color: sentinelText[300], fontSize: 12 },
});
