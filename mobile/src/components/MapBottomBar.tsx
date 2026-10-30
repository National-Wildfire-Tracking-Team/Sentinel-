/**
 * Floating bottom toolbar, as on the web (src/app/components/BottomBar/MapBottomBar.jsx): the layers
 * button, then the All Hazards / Wildfire / Weather / Models switcher. Like the web below the `sm`
 * breakpoint, tabs lead with icons; each keeps the web's active color. A short label sits under each
 * icon (the web relies on hover titles, which a phone doesn't have), and the layers button shows how
 * many layers are on.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, CloudSun, Flame, Layers, Wind } from 'lucide-react-native';

import type { MapTab } from '@/map/catalog';
import { accent, chrome, radius, sentinel, sentinelText } from '@/theme';
import { CountBadge } from './MapChrome';

interface Props {
  tab: MapTab;
  onTabChange: (tab: MapTab) => void;
  layersOpen: boolean;
  onLayersPress: () => void;
  /** Layers currently on, shown as a badge on the layers button. */
  layerCount?: number;
}

const TABS: { id: MapTab; label: string; short: string; Icon: typeof Flame }[] = [
  { id: 'allhazard', label: 'All Hazards', short: 'Hazards', Icon: AlertTriangle },
  { id: 'wildfire', label: 'Wildfire', short: 'Wildfire', Icon: Flame },
  { id: 'weather', label: 'Weather', short: 'Weather', Icon: CloudSun },
  { id: 'models', label: 'Models', short: 'Models', Icon: Wind },
];

const ACTIVE_STYLE: Record<MapTab, object> = {
  allhazard: { backgroundColor: accent.red600 },
  wildfire: { backgroundColor: 'rgba(255,90,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.5)' },
  weather: { backgroundColor: accent.sky600 },
  models: { backgroundColor: accent.indigo600 },
};

export function MapBottomBar({ tab, onTabChange, layersOpen, onLayersPress, layerCount = 0 }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onLayersPress}
        accessibilityRole="button"
        accessibilityLabel={layerCount ? `Map layers, ${layerCount} on` : 'Map layers'}
        accessibilityState={{ expanded: layersOpen }}
        style={({ pressed }) => [styles.button, layersOpen && styles.layersActive, pressed && styles.pressed]}
      >
        <Layers size={18} color={accent.slate100} />
        <Text style={styles.label}>Layers</Text>
        <CountBadge count={layerCount} />
      </Pressable>
      <View style={styles.divider} />
      {TABS.map(({ id, label, short, Icon }) => {
        const active = tab === id;
        // Web: inactive tabs are text-sentinel-200; the All Hazards triangle is sentinel-300 until active (yellow-300).
        const iconColor = active ? (id === 'allhazard' ? accent.yellow300 : accent.white) : id === 'allhazard' ? sentinelText[300] : sentinelText[200];
        return (
          <Pressable
            key={id}
            onPress={() => onTabChange(id)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.button, active && ACTIVE_STYLE[id], pressed && !active && styles.pressed]}
          >
            <Icon size={18} color={iconColor} />
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    ...chrome,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  button: {
    minWidth: 52,
    height: 48,
    paddingHorizontal: 6,
    gap: 2,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: sentinelText[300], fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },
  labelActive: { color: accent.white },
  layersActive: { backgroundColor: sentinel[700] },
  pressed: { backgroundColor: sentinel[700] },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 4, backgroundColor: sentinel[600] },
});
