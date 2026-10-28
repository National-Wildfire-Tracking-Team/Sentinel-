/**
 * Active NWS alerts, like the web's Sidebar WeatherAlertsFeed: searchable, most severe first,
 * colored with the official NWS palette. Tapping an alert expands its full text.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { useAlertSettings } from '@/context/AlertSettingsContext';
import { alertCode } from '@/data/alertStyles';
import { nwsAlertColor } from '@/data/nwsColors';
import type { WeatherAlert } from '@/data/weatherAlerts';
import { accent, radius, sentinel, sentinelText } from '@/theme';
import { formatDateTime } from '@/utils/format';
import { EmptyState, ErrorState, LoadingState } from './ui';

interface Props {
  alerts: WeatherAlert[];
  loading: boolean;
  error: string | null;
  /** Only these events (e.g. Red Flag Warnings on the Wildfire tab). */
  only?: string[];
  /** Rendered above the search box and scrolls with the list. */
  header?: React.ReactElement;
}

export function AlertsList({ alerts, loading, error, only, header }: Props) {
  const [query, setQuery] = useState('');
  const { settingsFor, overrides } = useAlertSettings();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter(a => {
      if (only && !only.includes(a.event)) return false;
      // Types turned off in Alert settings are hidden here too.
      const code = alertCode(null, null, a.event);
      if (code && !settingsFor(code).enabled) return false;
      if (!q) return true;
      return a.event.toLowerCase().includes(q) || a.area.toLowerCase().includes(q) || a.sender.toLowerCase().includes(q);
    });
  }, [alerts, query, only, settingsFor, overrides]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && alerts.length === 0) return <LoadingState message="Loading NWS alerts…" />;
  if (error && alerts.length === 0) return <ErrorState message={error} />;

  return (
    <FlatList
      data={filtered}
      keyExtractor={a => a.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.searchBox}>
          <Search size={16} color={sentinelText[300]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search alerts, area or office"
            placeholderTextColor={sentinelText[400]}
            style={styles.search}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search alerts"
          />
          </View>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title={only ? 'No Red Flag Warnings' : 'No matching alerts'}
          message={only ? 'There are no active Red Flag Warnings right now.' : undefined}
        />
      }
      renderItem={({ item }) => <AlertCard alert={item} />}
    />
  );
}

export function AlertCard({ alert }: { alert: WeatherAlert }) {
  const [open, setOpen] = useState(false);
  // The colour from Alert settings, as on the map; the NWS palette for types it doesn't list.
  const { settingsFor } = useAlertSettings();
  const code = alertCode(null, null, alert.event);
  const color = code ? settingsFor(code).color : nwsAlertColor(alert.event);
  return (
    <Pressable
      onPress={() => setOpen(o => !o)}
      style={({ pressed }) => [styles.card, { borderLeftColor: color }, pressed && { backgroundColor: sentinel[700] }]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.event} numberOfLines={1}>
          {alert.event}
        </Text>
        <Text style={styles.pill}>{alert.severity}</Text>
      </View>
      <Text style={styles.area} numberOfLines={open ? undefined : 2}>
        {alert.area}
      </Text>
      <Text style={styles.meta}>
        {alert.sender}
        {alert.expires ? ` · until ${formatDateTime(alert.expires)}` : ''}
      </Text>
      {open ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          {alert.headline ? <Text style={styles.headline}>{alert.headline}</Text> : null}
          {alert.description ? <Text style={styles.body}>{alert.description.trim()}</Text> : null}
          {alert.instruction ? (
            <>
              <Text style={styles.label}>What to do</Text>
              <Text style={styles.body}>{alert.instruction.trim()}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 120, gap: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: radius.md,
    backgroundColor: sentinel[900],
    borderWidth: 1,
    borderColor: sentinel[600],
  },
  search: { flex: 1, color: accent.slate100, fontSize: 16, paddingVertical: 10 },
  card: {
    marginHorizontal: 8,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: sentinel[700],
    backgroundColor: sentinel[800],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  event: { flex: 1, color: accent.white, fontSize: 14, fontWeight: '600' },
  pill: {
    color: sentinelText[100],
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  area: { color: sentinelText[100], fontSize: 13, lineHeight: 18 },
  meta: { color: sentinelText[400], fontSize: 12, marginTop: 4 },
  headline: { color: accent.slate100, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  label: { color: sentinelText[200], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  body: { color: sentinelText[100], fontSize: 14, lineHeight: 21 },
});
