/**
 * Floating map controls with the web's exact look:
 *   - CornerButton: MapCornerButtons.jsx / AccountButton.jsx — `w-11 h-11 rounded-full border`,
 *     `bg-sentinel-900/90 border-sentinel-600` at rest, the solid fire tint `#47200b` with
 *     `border-fire-500` when its panel is open.
 *   - ZoomControl: MapZoomControl.jsx — a `w-9 rounded-lg` column of +, −, reset-north.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Compass, Minus, Plus } from 'lucide-react-native';

import { fire, sentinel } from '@/theme';

/** fire-600 at 25% over sentinel-900, made solid (AccountButton.jsx). */
export const FIRE_TINT_SOLID = '#47200b';

export function CornerButton({
  label,
  onPress,
  active,
  children,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: active }}
      hitSlop={4}
      style={({ pressed }) => [styles.corner, active && styles.cornerActive, pressed && !active && { backgroundColor: sentinel[700] }]}
    >
      {children}
    </Pressable>
  );
}

export function ZoomControl({ onZoomIn, onZoomOut, onResetNorth }: { onZoomIn: () => void; onZoomOut: () => void; onResetNorth: () => void }) {
  const items = [
    { label: 'Zoom in', onPress: onZoomIn, Icon: Plus },
    { label: 'Zoom out', onPress: onZoomOut, Icon: Minus },
    { label: 'Reset map orientation to north', onPress: onResetNorth, Icon: Compass },
  ];
  return (
    <View style={styles.zoom}>
      {items.map(({ label, onPress, Icon }, i) => (
        <Pressable
          key={label}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.zoomButton, i < items.length - 1 && styles.zoomDivider, pressed && { backgroundColor: sentinel[700] }]}
        >
          <Icon size={18} color="#ffffff" />
        </Pressable>
      ))}
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } };

const styles = StyleSheet.create({
  corner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: 'rgba(10,12,14,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  cornerActive: { backgroundColor: FIRE_TINT_SOLID, borderColor: fire[500] },
  zoom: {
    width: 36,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: 'rgba(10,12,14,0.9)',
  },
  zoomButton: { height: 36, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { borderBottomWidth: 1, borderBottomColor: sentinel[600] },
});
