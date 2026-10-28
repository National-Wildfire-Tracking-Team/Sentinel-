/**
 * Evacuation zone detail (the web FireDetailPanel's evacuation-zone block): level, zone, county,
 * timing, source and instructions.
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { accent, fire, sentinel, sentinelText } from '@/theme';
import { formatDateTime } from '@/utils/format';

const LEVEL_META: Record<string, { color: string; label: string }> = {
  'Evacuation Order': { color: '#ef4444', label: 'Evacuation Order · Level 3 · Go' },
  'Evacuation Warning': { color: '#f97316', label: 'Evacuation Warning · Level 2 · Set' },
  'Evacuation Watch': { color: '#eab308', label: 'Evacuation Watch · Level 1 · Ready' },
};

const SOURCE_LABEL: Record<string, string> = {
  hosted: 'Cal OES',
  ipaws: 'FEMA IPAWS',
  reporter: 'NWTT field reporter',
};

export function EvacZoneSheet({ zone, onClose }: { zone: Record<string, any>; onClose: () => void }) {
  const meta = LEVEL_META[zone.warningType] ?? LEVEL_META['Evacuation Warning'];
  const rows: [string, string | null][] = [
    ['County', zone.county || null],
    ['Effective', zone.effectiveDate ? formatDateTime(zone.effectiveDate) : null],
    ['Expires', zone.expirationDate ? formatDateTime(zone.expirationDate) : null],
    ['Source', SOURCE_LABEL[zone.source] ?? null],
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {zone.zoneName}
        </Text>
        <Pressable onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close zone details">
          <X size={18} color={sentinelText[200]} />
        </Pressable>
      </View>
      <View style={[styles.levelCard, { backgroundColor: `${meta.color}24` }]}>
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
        <Text style={styles.levelText}>{meta.label}</Text>
      </View>
      <View>
        {rows
          .filter((r): r is [string, string] => Boolean(r[1]))
          .map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
      </View>
      {zone.instructions ? <Text style={styles.body}>{zone.instructions}</Text> : null}
      {zone.source === 'reporter' ? (
        <Text style={styles.note}>Drawn by an NWTT field reporter. Verify with official sources before taking action.</Text>
      ) : null}
      {zone.externalURL ? (
        <Pressable onPress={() => Linking.openURL(zone.externalURL)} style={styles.linkRow}>
          <Text style={styles.link}>More information</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, color: accent.white, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  levelText: { color: accent.white, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: sentinel[700] },
  rowLabel: { width: 110, color: sentinelText[200], fontSize: 14 },
  rowValue: { flex: 1, color: accent.slate100, fontSize: 14 },
  body: { color: sentinelText[100], fontSize: 15, lineHeight: 22 },
  note: { color: accent.amber400, fontSize: 13, lineHeight: 19 },
  linkRow: { minHeight: 44, justifyContent: 'center' },
  link: { color: fire[400], fontSize: 15, fontWeight: '600' },
});
