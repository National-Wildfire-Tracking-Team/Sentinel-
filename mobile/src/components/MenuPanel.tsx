/**
 * The app menu, matching the web's slide-in menu (MapControls/FutureFeaturesPanel.jsx) at phone width:
 * a full-width panel under the header, padded to clear the corner buttons, listing Home, Map style,
 * Legend (expandable), Support Our Mission → Donate, Settings → Places / Account, and Preferences.
 */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { useAuth } from '@/auth/AuthContext';
import { usePlan } from '@/auth/usePlan';
import { usePreferences } from '@/context/PreferencesContext';
import { BASEMAPS, type BasemapId } from '@/map/layers';
import { accent, colors, sentinel, sentinelText } from '@/theme';
import { FIRE_TINT_SOLID } from './MapChrome';

const DONATE_URL = 'https://givebutter.com/national-wildfire-tracking-team-dvi6jx';

const CONTAINMENT_LEGEND = [
  { color: colors.uncontained, label: 'Uncontained (0%)' },
  { color: colors.containment25, label: '1–49% contained' },
  { color: colors.containment50, label: '50–74% contained' },
  { color: colors.containment75, label: '75–99% contained' },
  { color: colors.contained, label: 'Fully contained' },
];

const CLUSTER_LEGEND = [
  { image: require('@/assets/map/flame-red.png'), label: 'A third or more uncontained' },
  { image: require('@/assets/map/flame-active.png'), label: 'Some fires active' },
  { image: require('@/assets/map/flame-contained.png'), label: 'All fires contained' },
];

const EVAC_LEGEND = [
  { color: '#ef4444', label: 'Evacuation Order' },
  { color: '#f97316', label: 'Evacuation Warning' },
  { color: '#eab308', label: 'Evacuation Watch' },
];

interface Props {
  basemap: BasemapId;
  onBasemapChange: (b: BasemapId) => void;
  onOpenPlaces: () => void;
  top: number;
}

export function MenuPanel({ basemap, onBasemapChange, onOpenPlaces, top }: Props) {
  const { user } = useAuth();
  const plan = usePlan();
  const { timeFormat, setTimeFormat } = usePreferences();
  const [legendOpen, setLegendOpen] = useState(false);
  const nextBasemap: BasemapId = basemap === 'satellite' ? 'dark' : 'satellite';

  return (
    <View style={[styles.panel, { top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Row title="Home" onPress={onOpenPlaces} />
        <Row
          title="Map"
          subtitle={basemap === 'satellite' ? 'Satellite view' : 'Rendered view'}
          onPress={() => onBasemapChange(nextBasemap)}
          accessibilityHint={`Switches to the ${BASEMAPS[nextBasemap].label.toLowerCase()} map`}
        />
        <Row
          title="Legend"
          subtitle="Colors and symbols for the layers on the map"
          onPress={() => setLegendOpen(o => !o)}
          trailing={legendOpen ? <ChevronUp size={18} color={sentinelText[300]} /> : <ChevronDown size={18} color={sentinelText[300]} />}
          last={legendOpen}
        />
        {legendOpen ? <Legend /> : null}

        <Text style={styles.groupLabel}>Support Our Mission</Text>
        <Row title="Donate" onPress={() => Linking.openURL(DONATE_URL)} />

        <Text style={styles.groupLabel}>Settings</Text>
        <Row title="Places" subtitle="Home, saved locations and followed fires" onPress={onOpenPlaces} />
        <Row title="Account" subtitle={user ? `${user.email} · ${plan.planLabel}` : 'Sign in'} onPress={() => router.push('/account')} />

        <Text style={styles.groupLabel}>Preferences</Text>
        <View style={styles.prefRow}>
          <Text style={styles.rowTitle}>Time Format</Text>
          <View style={styles.segment}>
            {(['12h', '24h'] as const).map(f => (
              <Pressable
                key={f}
                onPress={() => setTimeFormat(f)}
                accessibilityRole="button"
                accessibilityState={{ selected: timeFormat === f }}
                style={[styles.segmentButton, timeFormat === f && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, timeFormat === f && styles.segmentTextActive]}>{f === '12h' ? '12h' : '24h'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  title,
  subtitle,
  onPress,
  trailing,
  last,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      <Text style={styles.legendHeading}>Active fires</Text>
      {CONTAINMENT_LEGEND.map(item => (
        <View key={item.label} style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
      <Text style={styles.legendHeading}>Fire groups</Text>
      {CLUSTER_LEGEND.map(item => (
        <View key={item.label} style={styles.legendRow}>
          <Image source={item.image} style={styles.legendFlame} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
      <View style={styles.legendRow}>
        <View style={[styles.legendSwatch, { backgroundColor: 'rgba(255,102,0,0.3)', borderColor: colors.perimeter }]} />
        <Text style={styles.legendText}>Fire perimeter</Text>
      </View>
      <Text style={styles.legendHeading}>Evacuation zones</Text>
      {EVAC_LEGEND.map(item => (
        <View key={item.label} style={styles.legendRow}>
          <View style={[styles.legendSwatch, { backgroundColor: `${item.color}33`, borderColor: item.color }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: sentinel[900] },
  content: { paddingLeft: 80, paddingRight: 16, paddingTop: 4, paddingBottom: 140 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  rowTitle: { color: accent.white, fontSize: 17, fontWeight: '600' },
  rowSubtitle: { color: sentinelText[300], fontSize: 13, marginTop: 4, lineHeight: 18 },
  groupLabel: { color: sentinelText[400], fontSize: 13, fontWeight: '500', marginTop: 20, marginBottom: 2 },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  segment: { flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: sentinel[800] },
  segmentButton: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  segmentActive: { backgroundColor: FIRE_TINT_SOLID, borderColor: '#ff7410' },
  segmentText: { color: sentinelText[300], fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: accent.white },
  legend: { gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  legendHeading: { color: sentinelText[300], fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  legendFlame: { width: 22, height: 22 },
  legendSwatch: { width: 18, height: 12, borderRadius: 2, borderWidth: 1.5 },
  legendText: { color: sentinelText[100], fontSize: 14 },
});
