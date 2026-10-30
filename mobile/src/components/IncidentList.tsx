/**
 * The incident feed, matching the web's Sidebar/IncidentFeed.jsx and IncidentCard.jsx: search,
 * Size / Recent / Containment sort chips with the fire count, All Fires / Active Fires, then cards
 * (flame chip, name, ACTIVE pill, county, acres · % contained, containment bar, personnel, age).
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDownWideNarrow, Flame, MapPin, Radio, Search, Users } from 'lucide-react-native';

import type { Incident } from '@/data/incidents';
import { accent, fire, sentinel, sentinelText } from '@/theme';
import { formatAcres, formatRelative } from '@/utils/format';
import { EmptyState, ErrorState, LoadingState } from './ui';

interface Props {
  incidents: Incident[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  selectedId?: string | null;
  onRefresh: () => void;
  onSelect: (incident: Incident) => void;
  header?: React.ReactElement;
}

type Sort = 'size' | 'recent' | 'containment';
type Filter = 'all' | 'active';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'size', label: 'Size' },
  { id: 'recent', label: 'Recent' },
  { id: 'containment', label: 'Containment' },
];

/** utils/colorUtils.js containmentToColor (the card's text and bar). */
function containmentToColor(pct: number): string {
  if (pct >= 75) return '#22c55e';
  if (pct >= 50) return '#84cc16';
  if (pct >= 25) return '#f59e0b';
  return '#ef4444';
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);

export function IncidentList({ incidents, loading, refreshing, error, selectedId, onRefresh, onSelect, header }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('size');
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = incidents.filter(i => {
      if (filter === 'active' && (i.contained ?? 0) >= 100) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.state.toLowerCase() === q || i.county.toLowerCase().includes(q);
    });
    return list.sort((a, b) => {
      if (sort === 'recent') return time(b.updated) - time(a.updated);
      if (sort === 'containment') return (a.contained ?? 0) - (b.contained ?? 0);
      return (b.acres ?? 0) - (a.acres ?? 0);
    });
  }, [incidents, query, sort, filter]);

  if (loading && incidents.length === 0) return <LoadingState message="Loading incidents…" />;
  if (error && incidents.length === 0) return <ErrorState message={error} onRetry={onRefresh} />;

  return (
    <FlatList
      data={sorted}
      keyExtractor={i => i.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={fire[500]} />}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.controls}>
            <View style={styles.searchBox}>
              <Search size={14} color={sentinelText[200]} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search fires..."
                placeholderTextColor={sentinelText[300]}
                style={styles.search}
                returnKeyType="search"
                autoCorrect={false}
                clearButtonMode="while-editing"
                accessibilityLabel="Search fires"
              />
            </View>
            <View style={styles.sortRow}>
              <ArrowDownWideNarrow size={12} color={sentinelText[200]} />
              {SORTS.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => setSort(s.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sort === s.id }}
                  style={[styles.sortChip, sort === s.id && styles.sortChipActive]}
                >
                  <Text style={[styles.sortText, sort === s.id && styles.sortTextActive]}>{s.label}</Text>
                </Pressable>
              ))}
              <Text style={styles.count}>{sorted.length} fires</Text>
            </View>
            <View style={styles.filterRow}>
              {(['all', 'active'] as const).map(f => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === f }}
                  style={[styles.filter, filter === f ? styles.filterActive : styles.filterIdle]}
                >
                  <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f === 'all' ? 'All Fires' : 'Active Fires'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      }
      ListEmptyComponent={
        <EmptyState title={query ? 'No matches' : 'No incidents'} message={query ? `No fires match “${query}”.` : 'No wildfires in the feeds right now.'} />
      }
      renderItem={({ item }) => <IncidentCard incident={item} selected={item.id === selectedId} onPress={() => onSelect(item)} />}
    />
  );
}

function IncidentCard({ incident, selected, onPress }: { incident: Incident; selected: boolean; onPress: () => void }) {
  const active = (incident.contained ?? 0) < 100;
  const pct = Math.max(0, Math.min(100, incident.contained ?? 0));
  const color = containmentToColor(pct);
  const place = [incident.county && `${incident.county} Co.`, incident.state].filter(Boolean).join(', ');
  // Posted by an NWTT reporter and not in an official feed yet.
  const fieldReport = incident.source === 'NWTT_REPORT';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected ? styles.cardSelected : pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${incident.name}${fieldReport ? ', field report' : ''}, ${formatAcres(incident.acres)}, ${Math.round(pct)}% contained`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.chip, { backgroundColor: active ? 'rgba(255,90,0,0.2)' : sentinel[700] }]}>
          <Flame size={14} color={active ? fire[400] : sentinelText[400]} />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {incident.name}
        </Text>
        <Text style={[styles.pill, active ? styles.pillActive : styles.pillContained]}>{active ? 'Active' : 'Contained'}</Text>
      </View>
      {place || fieldReport ? (
        <View style={styles.placeRow}>
          {place ? (
            <>
              <MapPin size={12} color={sentinelText[400]} />
              <Text style={styles.place}>{place}</Text>
            </>
          ) : null}
          {fieldReport ? (
            <View style={styles.reportTag}>
              <Radio size={10} color={fire[300]} />
              <Text style={styles.reportText}>Field report</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.stats}>
        <Text style={styles.acres}>{formatAcres(incident.acres)}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={[styles.contained, { color }]}>{Math.round(pct)}% contained</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.footer}>
        {incident.personnel ? (
          <View style={styles.personnel}>
            <Users size={12} color={sentinelText[400]} />
            <Text style={styles.meta}>{incident.personnel.toLocaleString('en-US')}</Text>
          </View>
        ) : (
          <View />
        )}
        <Text style={styles.age}>{incident.updated ? formatRelative(incident.updated) : ''}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 120 },
  controls: { padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: sentinel[700], marginBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: sentinel[700],
    borderWidth: 1,
    borderColor: sentinel[600],
  },
  search: { flex: 1, color: accent.white, fontSize: 15, paddingVertical: 8 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  sortChipActive: { backgroundColor: 'rgba(255,90,0,0.25)', borderColor: 'rgba(204,61,2,0.5)' },
  sortText: { color: sentinelText[200], fontSize: 12, fontWeight: '500' },
  sortTextActive: { color: fire[400] },
  count: { marginLeft: 'auto', color: sentinelText[300], fontSize: 12 },
  filterRow: { flexDirection: 'row', gap: 4 },
  filter: { flex: 1, paddingVertical: 6, borderRadius: 4, borderWidth: 1, alignItems: 'center' },
  filterActive: { backgroundColor: 'rgba(255,90,0,0.25)', borderColor: 'rgba(204,61,2,0.5)' },
  filterIdle: { backgroundColor: sentinel[800], borderColor: sentinel[600] },
  filterText: { color: sentinelText[100], fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: fire[400] },
  card: {
    marginHorizontal: 8,
    marginBottom: 6,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: sentinel[700],
    backgroundColor: 'rgba(17,20,24,0.6)',
  },
  cardPressed: { backgroundColor: 'rgba(26,31,38,0.6)', borderColor: sentinel[600] },
  cardSelected: { backgroundColor: 'rgba(255,90,0,0.15)', borderColor: 'rgba(255,90,0,0.5)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chip: { padding: 6, borderRadius: 6 },
  name: { flex: 1, color: accent.white, fontSize: 14, fontWeight: '600' },
  pill: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pillActive: { color: accent.red400, backgroundColor: 'rgba(127,29,29,0.6)' },
  pillContained: { color: sentinelText[200], backgroundColor: sentinel[700] },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  place: { color: sentinelText[400], fontSize: 12 },
  reportTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,90,0,0.15)',
  },
  reportText: { color: fire[300], fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  acres: { color: accent.white, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dot: { color: sentinelText[500], fontSize: 12 },
  contained: { fontSize: 12, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, backgroundColor: sentinel[700], overflow: 'hidden', marginBottom: 8 },
  barFill: { height: 6, borderRadius: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  personnel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { color: sentinelText[400], fontSize: 12 },
  age: { color: sentinelText[500], fontSize: 12 },
});
