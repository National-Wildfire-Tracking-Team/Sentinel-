/**
 * Individual Radar Site controls, after the web's RadarSitePanel drawer: the selected station and
 * scan, the product (Radar, Velocity, Correlation Coefficient, Differential Reflectivity; TDWRs
 * have no dual-pol), the "Reflectivity Gates" range and opacity. The web's sliders are steps here.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Radar, SlidersHorizontal, X } from 'lucide-react-native';

import { DBZ_MAX, RADAR_KINDS, siteProduct } from '@/data/radarSites';
import type { RadarSiteState } from '@/hooks/useRadarSite';
import { accent, fire, sentinel, sentinelText } from '@/theme';
import { formatClockTime, formatRelative } from '@/utils/format';

const LOW_STEPS = [0, 10, 20, 30];
const HIGH_STEPS = [40, 50, 60, DBZ_MAX];
const OPACITY_STEPS = [0.4, 0.7, 1];
const SKY_600 = '#0284c7';

export function RadarSitePanel({ radar }: { radar: RadarSiteState }) {
  const [open, setOpen] = useState(false);
  const { site, load, info } = radar;

  let detail: React.ReactNode;
  if (!site) detail = <Text style={styles.detail}>Tap a station pill on the map to load its radar</Text>;
  else if (load.status === 'loading' || load.status === 'idle')
    detail = (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={fire[500]} />
        <Text style={styles.detail}>Loading the latest scan…</Text>
      </View>
    );
  else if (load.status === 'empty') detail = <Text style={styles.detail}>No scans in the last 3 hours{radar.siteDown ? ' · NWS reports this radar down' : ''}</Text>;
  else if (load.status === 'error')
    detail = (
      <Pressable onPress={radar.retry} accessibilityRole="button">
        <Text style={[styles.detail, { color: accent.amber400 }]}>Couldn’t load this radar. Tap to retry.</Text>
      </Pressable>
    );
  else if (info) {
    const iso = new Date(info.time).toISOString();
    detail = (
      <Text style={styles.detail}>
        {radar.product?.label} {info.elevation.toFixed(1)}° · {formatClockTime(iso)} ({formatRelative(iso)})
        {radar.stale ? <Text style={{ color: accent.amber400 }}> · radar is delayed</Text> : null}
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Radar size={18} color={site ? '#38bdf8' : sentinelText[300]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {site ? `${site.id} · ${site.place}, ${site.state}` : 'No radar site selected'}
          </Text>
          {detail}
        </View>
        <Pressable
          onPress={() => setOpen(o => !o)}
          hitSlop={6}
          style={[styles.iconButton, open && { backgroundColor: sentinel[700] }]}
          accessibilityRole="button"
          accessibilityLabel="Radar options"
          accessibilityState={{ expanded: open }}
        >
          <SlidersHorizontal size={16} color={sentinelText[100]} />
        </Pressable>
        {site ? (
          <Pressable onPress={radar.clearSite} hitSlop={6} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Turn off this radar">
            <X size={16} color={sentinelText[100]} />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={styles.options}>
          <Text style={styles.label}>Product</Text>
          <View style={styles.chips}>
            {RADAR_KINDS.map(k => {
              const available = !site || Boolean(siteProduct(site, k.id));
              return (
                <Chip
                  key={k.id}
                  label={k.label}
                  active={radar.kind === k.id}
                  disabled={!available}
                  onPress={() => radar.setKind(k.id)}
                />
              );
            })}
          </View>
          {radar.kind === 'reflectivity' ? (
            <>
              <Text style={styles.label}>Reflectivity Gates · recommended minimum of 10 dBZ</Text>
              <View style={styles.chips}>
                {LOW_STEPS.map(v => (
                  <Chip key={`l${v}`} label={`From ${v}`} active={radar.dbzLow === v} onPress={() => radar.setDbzLow(Math.min(v, radar.dbzHigh - 10))} />
                ))}
              </View>
              <View style={styles.chips}>
                {HIGH_STEPS.map(v => (
                  <Chip
                    key={`h${v}`}
                    label={v === DBZ_MAX ? 'To 70+' : `To ${v}`}
                    active={radar.dbzHigh === v}
                    onPress={() => radar.setDbzHigh(Math.max(v, radar.dbzLow + 10))}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.label}>Opacity</Text>
          <View style={styles.chips}>
            {OPACITY_STEPS.map(v => (
              <Chip key={v} label={`${Math.round(v * 100)}%`} active={radar.opacity === v} onPress={() => radar.setOpacity(v)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, active, disabled, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={[styles.chip, active && styles.chipActive, disabled && { opacity: 0.35 }]}
    >
      <Text style={[styles.chipText, active && { color: accent.white }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: 'rgba(10,12,14,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: accent.white, fontSize: 14, fontWeight: '600' },
  detail: { color: sentinelText[200], fontSize: 12, marginTop: 2 },
  iconButton: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  options: { gap: 6, borderTopWidth: 1, borderTopColor: sentinel[700], paddingTop: 8 },
  label: { color: sentinelText[300], fontSize: 11, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: sentinel[600], backgroundColor: sentinel[800] },
  chipActive: { backgroundColor: SKY_600, borderColor: '#38bdf8' },
  chipText: { color: sentinelText[200], fontSize: 12, fontWeight: '600' },
});
