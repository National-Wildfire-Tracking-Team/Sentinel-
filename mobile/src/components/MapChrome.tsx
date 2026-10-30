/**
 * Floating map controls with the web's exact look:
 *   - CornerButton: MapCornerButtons.jsx / AccountButton.jsx — `w-11 h-11 rounded-full border`,
 *     `bg-sentinel-900/90 border-sentinel-600` at rest, the solid fire tint `#47200b` with
 *     `border-fire-500` when its panel is open.
 *   - ZoomControl: MapZoomControl.jsx — a `w-9 rounded-lg` column of +, −, reset-north.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Compass, Minus, Plus, RefreshCw } from 'lucide-react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { fire, sentinel, sentinelText } from '@/theme';

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

/** The header's refresh button; the arrows spin while a refresh is in flight. */
export function RefreshButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (busy) {
      rotation.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false));
    } else {
      cancelAnimation(rotation);
      rotation.set(withTiming(Math.ceil(rotation.get() / 360) * 360, { duration: 250 }, () => rotation.set(0)));
    }
  }, [busy, rotation]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Refresh data"
      accessibilityState={{ busy }}
      hitSlop={8}
      style={({ pressed }) => [styles.refresh, pressed && { backgroundColor: sentinel[700] }]}
    >
      <Animated.View style={spin}>
        <RefreshCw size={18} color={busy ? fire[400] : sentinelText[200]} />
      </Animated.View>
    </Pressable>
  );
}

/** A small count in the corner of a button (e.g. how many layers are on). */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
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
  refresh: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: fire[600],
    borderWidth: 2,
    borderColor: sentinel[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
