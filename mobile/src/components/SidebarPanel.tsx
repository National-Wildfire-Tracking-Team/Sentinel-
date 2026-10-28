/**
 * The incident / alerts sidebar, laid out like the web's Sidebar/Sidebar.jsx at phone width: a
 * full-width `bg-sentinel-900/95` panel under the header, padded on the left to clear the corner
 * buttons, with the tab's stat pills, the dashed "Set up Home" prompt, feed tabs, then the feed.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CloudSun, Flame, Gauge, ShieldAlert, TrendingUp, Wind } from 'lucide-react-native';

import { useHomeSetup } from '@/context/HomeSetupContext';
import type { Incident } from '@/data/incidents';
import type { WeatherAlert } from '@/data/weatherAlerts';
import type { MapTab } from '@/map/catalog';
import { accent, fire, sentinel, sentinelText } from '@/theme';
import { AlertsList } from './AlertsList';
import { IncidentList } from './IncidentList';

export type FeedTab = 'fires' | 'alerts';

interface Props {
  tab: MapTab;
  feedTab: FeedTab;
  onFeedTab: (t: FeedTab) => void;
  incidents: Incident[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  selectedId: string | null;
  onSelectIncident: (incident: Incident) => void;
  alerts: { value: WeatherAlert[]; error: string | null; updatedAt: number | null };
  top: number;
}

function compactAcres(acres: number): string {
  if (acres >= 1_000_000) return `${(acres / 1_000_000).toFixed(1)}M`;
  if (acres >= 1000) return `${Math.round(acres / 1000)}k`;
  return String(Math.round(acres));
}

export function SidebarPanel(props: Props) {
  const { tab, feedTab, onFeedTab, incidents, alerts, top } = props;
  const { home } = useHomeSetup();

  const fireCount = incidents.length;
  const acres = incidents.reduce((sum, i) => sum + (i.acres ?? 0), 0);
  const redFlags = alerts.value.filter(a => a.event === 'Red Flag Warning').length;
  const severe = alerts.value.filter(a => a.severity === 'Severe' || a.severity === 'Extreme').length;
  const warnings = alerts.value.filter(a => a.event.endsWith('Warning')).length;
  const isWeather = tab === 'weather';
  const isAllHazard = tab === 'allhazard';

  const stats = isWeather
    ? [
        { Icon: CloudSun, label: 'Active Alerts', value: alerts.value.length, color: '#7dd3fc' },
        { Icon: ShieldAlert, label: 'Severe', value: severe, color: '#fca5a5' },
        { Icon: Wind, label: 'Warnings', value: warnings, color: '#fcd34d' },
      ]
    : isAllHazard
      ? [
          { Icon: Flame, label: 'Fires', value: fireCount, color: fire[400] },
          { Icon: TrendingUp, label: 'Acres', value: compactAcres(acres), color: accent.orange400 },
          { Icon: CloudSun, label: 'Alerts', value: alerts.value.length, color: '#7dd3fc' },
          { Icon: ShieldAlert, label: 'Severe', value: severe, color: '#fca5a5' },
        ]
      : [
          { Icon: Flame, label: 'Fires', value: fireCount, color: fire[400] },
          { Icon: TrendingUp, label: 'Acres', value: compactAcres(acres), color: accent.orange400 },
          { Icon: Wind, label: 'Red Flags', value: redFlags, color: accent.red400 },
        ];

  const tabs: { id: FeedTab | 'danger'; label: string; Icon: typeof Flame }[] = isWeather
    ? [{ id: 'alerts', label: 'Alerts', Icon: CloudSun }]
    : isAllHazard
      ? [
          { id: 'fires', label: `Fires (${fireCount})`, Icon: Flame },
          { id: 'alerts', label: 'Alerts', Icon: CloudSun },
        ]
      : [
          { id: 'fires', label: `Incidents (${fireCount})`, Icon: Flame },
          { id: 'danger', label: 'Fire Danger', Icon: Gauge },
        ];
  const activeFeed: FeedTab = isWeather ? 'alerts' : feedTab;

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{isWeather ? 'Weather Alerts' : isAllHazard ? 'All Hazards' : 'Active Incidents'}</Text>
      </View>
      <View style={styles.statsRow}>
        {stats.map(({ Icon, label, value, color }) => (
          <View key={label} style={styles.stat}>
            <Icon size={14} color={color} />
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
      {!home ? (
        <View style={styles.homeWrap}>
          <Pressable onPress={() => router.push('/places')} style={({ pressed }) => [styles.homeButton, pressed && { backgroundColor: sentinel[800] }]}>
            <Text style={styles.homeText}>Set up Home for incidents & alerts near you</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.tabsWrap}>
        <View style={styles.tabs}>
          {tabs.map(({ id, label, Icon }) => {
            const disabled = id === 'danger';
            const active = id === activeFeed;
            return (
              <Pressable
                key={id}
                disabled={disabled}
                onPress={() => onFeedTab(id as FeedTab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active, disabled }}
                accessibilityLabel={disabled ? `${label}, coming soon` : label}
                style={[styles.tab, active && styles.tabActive, disabled && { opacity: 0.45 }]}
              >
                <Icon size={13} color={active ? accent.white : sentinelText[300]} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.panel, { top }]}>
      {activeFeed === 'alerts' ? (
        <AlertsList
          alerts={alerts.value}
          loading={alerts.updatedAt === null && !alerts.error}
          error={alerts.error}
          only={tab === 'wildfire' ? ['Red Flag Warning'] : undefined}
          header={header}
        />
      ) : (
        <IncidentList
          incidents={incidents}
          loading={props.loading}
          refreshing={props.refreshing}
          error={props.error}
          selectedId={props.selectedId}
          onRefresh={props.onRefresh}
          onSelect={props.onSelectIncident}
          header={header}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,12,14,0.95)',
  },
  titleRow: { paddingLeft: 80, paddingRight: 64, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  title: { color: accent.white, fontSize: 14, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 80,
    paddingRight: 64,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: sentinel[700],
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: sentinel[700],
    backgroundColor: sentinel[800],
  },
  statValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: sentinelText[300], fontSize: 12, textAlign: 'center', lineHeight: 15 },
  homeWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  homeButton: {
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: sentinel[500],
    alignItems: 'center',
  },
  homeText: { color: sentinelText[100], fontSize: 12, fontWeight: '500' },
  tabsWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  tabs: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: sentinel[700],
    backgroundColor: 'rgba(17,20,24,0.7)',
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: 6 },
  tabActive: { backgroundColor: 'rgba(255,90,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.5)' },
  tabText: { color: sentinelText[300], fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: accent.white },
});
