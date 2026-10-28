/**
 * What's at a tapped point on the weather layers (the web's MapFeaturePopup chooser): NWS alerts in
 * effect there, plus features from each active NOAA layer (outlook category, storm report, etc.).
 */
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import type { IdentifyResult } from '@/data/arcgisLayers';
import type { WeatherAlert } from '@/data/weatherAlerts';
import { accent, fire, radius, sentinel, sentinelText } from '@/theme';
import { AlertCard } from './AlertsList';

export interface PointInfo {
  lat: number;
  lng: number;
  loading: boolean;
  alerts: WeatherAlert[];
  features: IdentifyResult[];
}

function prettyField(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function PointInfoSheet({ info, onClose }: { info: PointInfo; onClose: () => void }) {
  const empty = !info.loading && info.alerts.length === 0 && info.features.length === 0;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            At this spot
          </Text>
          <Text style={styles.coords}>
            {info.lat.toFixed(3)}°, {info.lng.toFixed(3)}°
          </Text>
        </View>
        {info.loading ? <ActivityIndicator color={fire[500]} /> : null}
        <Pressable onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <X size={18} color={sentinelText[200]} />
        </Pressable>
      </View>

      {info.alerts.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NWS alerts here</Text>
          {info.alerts.map(a => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </View>
      ) : null}

      {info.features.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Map layers</Text>
          {info.features.map((f, i) => (
            <View key={`${f.title}-${i}`} style={styles.card}>
              <Text style={styles.cardTitle}>{f.title}</Text>
              {f.layerName ? <Text style={styles.cardSub}>{f.layerName}</Text> : null}
              {Object.entries(f.attributes)
                .slice(0, 10)
                .map(([k, v]) => (
                  <View key={k} style={styles.row}>
                    <Text style={styles.rowLabel}>{prettyField(k)}</Text>
                    <Text style={styles.rowValue}>{v}</Text>
                  </View>
                ))}
            </View>
          ))}
        </View>
      ) : null}

      {empty ? <Text style={styles.empty}>No alerts or weather features at this spot on the layers you have on.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: accent.white, fontSize: 22, fontWeight: '700' },
  coords: { color: sentinelText[300], fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 8 },
  sectionTitle: { color: sentinelText[200], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 },
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: sentinel[700], backgroundColor: sentinel[800], gap: 4 },
  cardTitle: { color: accent.white, fontSize: 15, fontWeight: '600' },
  cardSub: { color: sentinelText[300], fontSize: 12, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 3 },
  rowLabel: { width: 120, color: sentinelText[200], fontSize: 13 },
  rowValue: { flex: 1, color: accent.slate100, fontSize: 13 },
  empty: { color: sentinelText[200], fontSize: 15, lineHeight: 21 },
});
