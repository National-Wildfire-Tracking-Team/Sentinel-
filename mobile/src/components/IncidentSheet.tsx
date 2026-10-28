/**
 * Incident detail, laid out like the web's IncidentSidebar (src/app/components/FireDetailPanel/):
 * name, status and "Updated …", location, large Acres / Containment, the source line, the current
 * situation and evacuation cards, then sticky Updates / Shelters / Info tabs, with Share and Follow
 * pinned at the bottom. Updates, evacuations and shelters stay live over Supabase realtime.
 */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BadgeCheck, Check, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WEB_APP_URL } from '@/config/env';
import type { Incident } from '@/data/incidents';
import {
  SHELTER_KIND_LABELS,
  buildEvacuations,
  deriveSituation,
  directionsUrl,
  incidentSummary,
  updateMessage,
  updateTypeLabel,
  type Evacuations,
  type IncidentUpdate,
  type ShelterRow,
  type SituationTone,
} from '@/data/incidentDetailModel';
import {
  useIncidentEvacuations,
  useIncidentFollow,
  useIncidentShelters,
  useIncidentUpdates,
} from '@/hooks/useIncidentDetails';
import { accent, fire, radius, sentinel, sentinelText } from '@/theme';
import { formatAcres, formatClockTime, formatDateTime, formatRelative } from '@/utils/format';

type Tab = 'updates' | 'shelters' | 'info';

const TONE_COLOR: Record<SituationTone, string> = {
  red: accent.red400,
  amber: accent.amber400,
  orange: accent.orange400,
};

export function IncidentSheet({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const summary = incidentSummary(incident);
  const feed = useIncidentUpdates(incident.fireId, incident.aliasIds);
  const evacuationRows = useIncidentEvacuations(incident.fireId, incident.aliasIds);
  const shelters = useIncidentShelters(incident.fireId, incident.aliasIds);
  const follow = useIncidentFollow(incident.fireId, summary.name, incident.aliasIds);
  const [tab, setTab] = useState<Tab>('updates');
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const evacuations = buildEvacuations(evacuationRows);
  const situation = deriveSituation(feed.updates, evacuations);
  const latestUpdateAt = feed.updates[0]?.created_at;
  const updatedAt = [summary.updatedAt, latestUpdateAt]
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const activeTab: Tab = tab === 'shelters' && shelters.length === 0 ? 'updates' : tab;
  const hasFresh = feed.freshIds.size > 0;
  const relative = updatedAt ? formatRelative(updatedAt) : null;

  const onShare = async () => {
    const url = `${WEB_APP_URL}/?incident=${encodeURIComponent(incident.fireId || incident.id)}`;
    try {
      const result = await Share.share({ message: `${summary.name} on Sentinel`, url });
      if (result.action === Share.sharedAction) setShareStatus('Shared');
    } catch {
      setShareStatus('Could not share');
    }
    setTimeout(() => setShareStatus(null), 2000);
  };

  const onFollow = () => {
    if (!follow.canFollow) {
      router.push('/account');
      return;
    }
    follow.toggle();
  };

  return (
    <View style={styles.root}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 16 }}>
        {/* Header, situation and evacuations (the sheet's peek region) */}
        <View>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title} accessibilityRole="header">
                {summary.name}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel="Close incident details"
              >
                <X size={18} color={sentinelText[200]} />
              </Pressable>
            </View>
            <View style={styles.statusLine}>
              <View style={[styles.statusDot, summary.isActive ? styles.dotActive : styles.dotContained]} />
              <Text style={[styles.statusText, { color: summary.isActive ? accent.red400 : accent.emerald400 }]}>
                {summary.statusLabel}
              </Text>
              {relative ? (
                <>
                  <Text style={styles.muted}>·</Text>
                  <Text style={[styles.muted, hasFresh && { color: fire[400] }]}>
                    Updated {relative === 'Just now' ? 'just now' : relative}
                  </Text>
                </>
              ) : null}
            </View>
            {summary.locality ? <Text style={styles.address}>{summary.locality}</Text> : null}
            <View style={styles.metrics}>
              <Metric label="Acres" value={summary.acres != null ? summary.acres.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'} highlight={hasFresh} />
              <Metric label="Containment" value={summary.containment != null ? `${Math.round(summary.containment)}%` : '—'} />
            </View>
            <Text style={styles.sourceLine}>
              Reported by <Text style={styles.sourceName}>{summary.sourceLabel}</Text>
              {summary.createdAt ? ` · ${formatDateTime(summary.createdAt)}` : ''}
            </Text>
          </View>
          {(situation || evacuations) && (
            <View style={styles.situation}>
              {situation ? (
                <Text style={[styles.situationText, { color: TONE_COLOR[situation.tone] }]}>{situation.text}</Text>
              ) : null}
              {evacuations ? <EvacuationCards evacuations={evacuations} /> : null}
            </View>
          )}
        </View>

        {/* Sticky tabs */}
        <View style={styles.tabs} accessibilityRole="tablist">
          <TabButton label="Updates" active={activeTab === 'updates'} onPress={() => setTab('updates')} />
          {shelters.length > 0 && (
            <TabButton label="Shelters" count={shelters.length} active={activeTab === 'shelters'} onPress={() => setTab('shelters')} />
          )}
          <TabButton label="Info" active={activeTab === 'info'} onPress={() => setTab('info')} />
        </View>

        <View>
          {activeTab === 'updates' && <Timeline updates={feed.updates} freshIds={feed.freshIds} sourceLabel={summary.sourceLabel} />}
          {activeTab === 'shelters' && <ShelterList shelters={shelters} />}
          {activeTab === 'info' && <InfoTab incident={incident} summary={summary} updatedAt={updatedAt} />}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <Pressable onPress={onShare} style={({ pressed }) => [styles.footerButton, styles.shareButton, pressed && styles.pressed]}>
          <Text style={styles.footerText}>{shareStatus || 'Share Incident'}</Text>
        </Pressable>
        <Pressable
          onPress={onFollow}
          disabled={follow.pending}
          accessibilityState={{ selected: follow.following }}
          style={({ pressed }) => [
            styles.footerButton,
            follow.following ? styles.followingButton : styles.followButton,
            pressed && styles.pressed,
            follow.pending && { opacity: 0.6 },
          ]}
        >
          {follow.following ? <Check size={16} color={sentinelText[200]} /> : null}
          <Text style={[styles.footerText, follow.following && { color: sentinelText[200] }]}>
            {follow.following ? 'Following' : 'Follow Incident'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, highlight && { color: fire[400] }]}>{value}</Text>
    </View>
  );
}

const EVAC_LEVELS = {
  order: { title: 'Evacuation Order · Level 3 · Go', bg: 'rgba(248,113,113,0.14)', dot: accent.red400 },
  warning: { title: 'Evacuation Warning · Level 2 · Set', bg: 'rgba(251,191,36,0.11)', dot: accent.amber400 },
};

function EvacuationCards({ evacuations }: { evacuations: Evacuations }) {
  return (
    <View style={{ gap: 10 }}>
      {(['order', 'warning'] as const).map(level => {
        const data = evacuations[level];
        if (!data) return null;
        const meta = EVAC_LEVELS[level];
        return (
          <View key={level} style={[styles.evacCard, { backgroundColor: meta.bg }]}>
            <View style={styles.evacTitleRow}>
              <View style={[styles.evacDot, { backgroundColor: meta.dot }]} />
              <Text style={styles.evacTitle}>{meta.title}</Text>
            </View>
            {data.zones.length > 0 ? <Text style={styles.evacZones}>{data.zones.join(', ')}</Text> : null}
          </View>
        );
      })}
      {evacuations.notes || evacuations.links.length > 0 ? (
        <View style={[styles.evacCard, { backgroundColor: '#161a20' }]}>
          <Text style={styles.evacTitle}>Evacuation notes</Text>
          {evacuations.notes ? <Text style={styles.evacZones}>{evacuations.notes}</Text> : null}
          {evacuations.links.map(link => (
            <Pressable key={link.url} onPress={() => Linking.openURL(link.url)} style={styles.linkRow}>
              <Text style={styles.link}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TabButton({ label, active, count, onPress }: { label: string; active: boolean; count?: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {count != null ? <Text style={styles.tabCount}>{count}</Text> : null}
    </Pressable>
  );
}

function Timeline({ updates, freshIds, sourceLabel }: { updates: IncidentUpdate[]; freshIds: Set<string>; sourceLabel: string }) {
  if (updates.length === 0) {
    return (
      <Text style={styles.emptyTab}>
        No updates yet. Changes from {sourceLabel} and posts from NWTT reporters will appear here as they happen.
      </Text>
    );
  }
  return (
    <View>
      {updates.map(update => {
        const fresh = freshIds.has(update.id);
        const photos = Array.isArray(update.photo_urls) ? update.photo_urls : [];
        return (
          <View key={update.id} style={[styles.update, fresh && { backgroundColor: 'rgba(255,90,0,0.08)' }]}>
            <View style={styles.updateMeta}>
              <Text style={styles.updateTime}>{formatClockTime(update.created_at)}</Text>
              <Text style={styles.muted}>·</Text>
              <Text style={styles.updateType}>{updateTypeLabel(update)}</Text>
              {fresh ? <Text style={styles.newTag}>New</Text> : null}
            </View>
            {update.content ? <Text style={styles.updateBody}>{updateMessage(update)}</Text> : null}
            {photos[0] ? (
              <Pressable onPress={() => Linking.openURL(photos[0])}>
                <Image source={{ uri: photos[0] }} style={styles.photo} contentFit="cover" accessibilityLabel="Photo attached to this update" />
              </Pressable>
            ) : null}
            <View style={styles.updateSource}>
              <Text style={styles.updateSourceName}>{update.source_name || 'Reporter'}</Text>
              {update.source_type === 'automated' ? (
                <Text style={styles.updateSourceText}>· Automated feed</Text>
              ) : (
                <>
                  <BadgeCheck size={13} color={sentinelText[100]} />
                  <Text style={styles.updateSourceText}>NWTT Reporter</Text>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ShelterList({ shelters }: { shelters: ShelterRow[] }) {
  return (
    <View>
      {shelters.map(s => {
        const url = directionsUrl(s);
        const isCenter = s.kind === 'evacuation_center';
        return (
          <View key={s.id} style={styles.shelter}>
            <Text style={[styles.groupTitle, isCenter && { color: fire[400] }]}>
              {SHELTER_KIND_LABELS[s.kind ?? 'other'] || SHELTER_KIND_LABELS.other}
            </Text>
            <Text style={styles.shelterName}>{s.name}</Text>
            {s.address ? <Text style={styles.shelterAddress}>{s.address}</Text> : null}
            <View style={styles.shelterActions}>
              {url ? (
                <Pressable onPress={() => Linking.openURL(url)} style={styles.linkRow}>
                  <Text style={styles.link}>Directions</Text>
                </Pressable>
              ) : null}
              {s.status_note ? <Text style={styles.muted}>{s.status_note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function InfoTab({
  incident,
  summary,
  updatedAt,
}: {
  incident: Incident;
  summary: ReturnType<typeof incidentSummary>;
  updatedAt: string | undefined;
}) {
  const hasCoords = Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
  return (
    <View>
      <InfoGroup
        title="Incident"
        rows={[
          ['Name', summary.name],
          ['Status', summary.statusLabel],
          ['Started', summary.createdAt && formatDateTime(summary.createdAt)],
          ['Last updated', updatedAt && formatDateTime(updatedAt)],
          ['Cause', incident.cause],
        ]}
      />
      <InfoGroup
        title="Location"
        rows={[
          ['County', summary.county],
          ['State', summary.state],
          ['Coordinates', hasCoords && `${incident.lat.toFixed(4)}°, ${incident.lng.toFixed(4)}°`],
        ]}
      />
      <InfoGroup
        title="Fire"
        rows={[
          ['Size', summary.acres != null && formatAcres(summary.acres)],
          ['Containment', summary.containment != null && `${Math.round(summary.containment)}%`],
          ['Perimeter', incident.hasPerimeter ? 'Mapped' : 'Not yet mapped'],
        ]}
      />
      <InfoGroup
        title="Resources"
        rows={[
          ['Personnel', incident.personnel ? incident.personnel.toLocaleString('en-US') : null],
          ['Management', incident.managementOrg && `${incident.managementOrg} Incident Management`],
        ]}
      />
      <InfoGroup title="Source" rows={[['Data source', summary.sourceLabel]]} />
      <View style={styles.infoLinks}>
        <Pressable
          onPress={() => Linking.openURL(`${WEB_APP_URL}/fire/${encodeURIComponent(incident.fireId || incident.id)}`)}
          style={styles.linkRow}
        >
          <Text style={styles.link}>Open full incident page</Text>
        </Pressable>
        {incident.detailUrl ? (
          <Pressable onPress={() => Linking.openURL(incident.detailUrl!)} style={styles.linkRow}>
            <Text style={styles.link}>fire.ca.gov</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function InfoGroup({ title, rows }: { title: string; rows: [string, string | false | null | undefined][] }) {
  const visible = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (visible.length === 0) return null;
  return (
    <View style={styles.infoGroup}>
      <Text style={styles.groupTitle}>{title}</Text>
      {visible.map(([label, value]) => (
        <View key={label} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sentinel[800] },
  header: { paddingHorizontal: 20, paddingTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, color: accent.white, fontSize: 26, fontWeight: '700', lineHeight: 31 },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: accent.red400, borderWidth: 3, borderColor: 'rgba(248,113,113,0.2)', width: 14, height: 14, borderRadius: 7 },
  dotContained: { backgroundColor: accent.emerald400 },
  statusText: { fontSize: 14, fontWeight: '600' },
  muted: { color: sentinelText[200], fontSize: 14 },
  address: { color: sentinelText[100], fontSize: 14, lineHeight: 21, marginTop: 16 },
  metrics: { flexDirection: 'row', gap: 40, marginTop: 20 },
  metricLabel: { color: sentinelText[200], fontSize: 13 },
  metricValue: { color: accent.white, fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sourceLine: { color: sentinelText[200], fontSize: 13, marginTop: 16, paddingBottom: 20 },
  sourceName: { color: sentinelText[100], fontWeight: '600' },
  situation: { marginHorizontal: 20, borderTopWidth: 1, borderTopColor: sentinel[700], paddingTop: 20, paddingBottom: 24, gap: 14 },
  situationText: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  evacCard: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  evacTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  evacDot: { width: 8, height: 8, borderRadius: 4 },
  evacTitle: { color: accent.white, fontSize: 15, fontWeight: '600' },
  evacZones: { color: sentinelText[100], fontSize: 14, lineHeight: 21, marginTop: 4 },
  tabs: {
    flexDirection: 'row',
    gap: 28,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: sentinel[700],
    backgroundColor: sentinel[800],
  },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: fire[600] },
  tabText: { color: sentinelText[200], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 },
  tabTextActive: { color: accent.white },
  tabCount: {
    color: sentinelText[100],
    fontSize: 11,
    backgroundColor: sentinel[600],
    borderRadius: 4,
    overflow: 'hidden',
    paddingHorizontal: 6,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  emptyTab: { color: sentinelText[200], fontSize: 14, lineHeight: 21, padding: 20 },
  update: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  updateMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updateTime: { color: sentinelText[200], fontSize: 13, fontVariant: ['tabular-nums'] },
  updateType: { color: accent.white, fontSize: 13, fontWeight: '600' },
  newTag: { color: fire[400], fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.9, marginLeft: 4 },
  updateBody: { color: sentinelText[100], fontSize: 15, lineHeight: 23, marginTop: 6 },
  photo: { width: '100%', height: 200, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: sentinel[700] },
  updateSource: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  updateSourceName: { color: sentinelText[100], fontSize: 12, fontWeight: '500' },
  updateSourceText: { color: sentinelText[200], fontSize: 12 },
  shelter: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  shelterName: { color: accent.white, fontSize: 15, fontWeight: '600', marginTop: 4 },
  shelterAddress: { color: sentinelText[100], fontSize: 14, marginTop: 2 },
  shelterActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoGroup: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: sentinel[700] },
  groupTitle: { color: sentinelText[200], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  infoLabel: { width: 120, color: sentinelText[200], fontSize: 14, lineHeight: 21 },
  infoValue: { flex: 1, color: accent.slate100, fontSize: 14, lineHeight: 21 },
  infoLinks: { paddingHorizontal: 20, paddingTop: 8 },
  linkRow: { minHeight: 44, justifyContent: 'center' },
  link: { color: fire[400], fontSize: 14, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: sentinel[700],
    backgroundColor: sentinel[800],
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareButton: { borderWidth: 1, borderColor: sentinel[500] },
  followButton: { backgroundColor: 'rgba(255,90,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.5)' },
  followingButton: { borderWidth: 1, borderColor: sentinel[600] },
  footerText: { color: accent.slate100, fontSize: 15, fontWeight: '600' },
  pressed: { backgroundColor: sentinel[700] },
});
