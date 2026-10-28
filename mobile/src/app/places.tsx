/**
 * My Places: Home Setup (the web's HomeSetupPanel), saved locations with alert radius and email
 * alerts (the web's Account → Saved Locations / Manage ZIP codes), and followed fires. Saved
 * locations and follows need an account; Home works signed out and stays on the device.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Flame, Home as HomeIcon, MapPin, Trash2 } from 'lucide-react-native';

import { useAuth } from '@/auth/AuthContext';
import { usePlan } from '@/auth/usePlan';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Button } from '@/components/ui';
import { HOME_RADIUS_OPTIONS, useHomeSetup } from '@/context/HomeSetupContext';
import { useFollowedIncidents } from '@/hooks/useFollowedIncidents';
import { RADIUS_OPTIONS_MILES, useSavedLocations, type SavedLocation } from '@/hooks/useSavedLocations';
import type { Place } from '@/lib/geocode';
import { accent, fire, radius, sentinel, sentinelText } from '@/theme';
import { formatRelative } from '@/utils/format';

export default function PlacesScreen() {
  const { user } = useAuth();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        My places
      </Text>
      <HomeSection />
      {user ? (
        <>
          <SavedLocationsSection />
          <FollowedSection />
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.body}>
            Sign in to save locations with fire alerts and to follow fires. Your account works the same as on the website.
          </Text>
          <Button label="Sign in" onPress={() => router.push('/account')} />
        </View>
      )}
    </ScrollView>
  );
}

function RadiusChips({ value, options, onChange }: { value: number | null; options: number[]; onChange: (miles: number) => void }) {
  return (
    <View style={styles.chips}>
      {options.map(miles => (
        <Pressable
          key={miles}
          onPress={() => onChange(miles)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === miles }}
          style={[styles.chip, value === miles && styles.chipActive]}
        >
          <Text style={[styles.chipText, value === miles && styles.chipTextActive]}>{miles} mi</Text>
        </Pressable>
      ))}
    </View>
  );
}

function HomeSection() {
  const { home, saveHome, clearHome, loading } = useHomeSetup();
  const [draft, setDraft] = useState<{ place: Place | null; radiusMiles: number | null }>({ place: null, radiusMiles: null });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft({
      place: home ? { lat: home.latitude, lng: home.longitude, name: home.label } : null,
      radiusMiles: home?.radiusMiles ?? null,
    });
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!draft.place || !draft.radiusMiles) {
      setError('Choose a home location and an alert radius.');
      return;
    }
    setBusy(true);
    try {
      await saveHome({ latitude: draft.place.lat, longitude: draft.place.lng, label: draft.place.name, radiusMiles: draft.radiusMiles });
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Could not save Home Setup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Home" icon={<HomeIcon size={14} color={sentinelText[200]} />}>
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : editing ? (
        <View style={{ gap: 12 }}>
          {draft.place ? (
            <View style={styles.selected}>
              <MapPin size={15} color={fire[400]} />
              <Text style={styles.selectedText} numberOfLines={2}>
                {draft.place.name}
              </Text>
              <Pressable onPress={() => setDraft(d => ({ ...d, place: null }))} hitSlop={8}>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <PlaceSearch placeholder="Search your home address" onPick={place => setDraft(d => ({ ...d, place }))} />
          )}
          <Text style={styles.label}>Show fires within</Text>
          <RadiusChips value={draft.radiusMiles} options={HOME_RADIUS_OPTIONS} onChange={miles => setDraft(d => ({ ...d, radiusMiles: miles }))} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
            <Button label="Save home" onPress={save} loading={busy} />
          </View>
        </View>
      ) : home ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.itemTitle}>{home.label || 'Home'}</Text>
          <Text style={styles.muted}>
            Near-me shows fires within {home.radiusMiles} miles of where you are. Tap the locate button on the map to turn it on.
          </Text>
          <View style={styles.actions}>
            <Button
              label="Remove"
              variant="ghost"
              onPress={() =>
                Alert.alert('Remove Home Setup?', 'Near-me mode will turn off until you set a home again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => clearHome().catch(e => setError(e.message)) },
                ])
              }
            />
            <Button label="Edit" onPress={startEdit} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={styles.muted}>Set your home and a radius to see only the fires near you when you tap the locate button.</Text>
          <Button label="Set up Home" onPress={startEdit} />
        </View>
      )}
    </Section>
  );
}

function SavedLocationsSection() {
  const { planLabel } = usePlan();
  const { locations, limit, addLocation, updateLocation, removeLocation, error } = useSavedLocations();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const atLimit = locations.length >= limit;

  const run = (fn: () => Promise<void>) => {
    setActionError(null);
    fn().catch(err => setActionError(err?.message || 'Something went wrong.'));
  };

  return (
    <Section
      title="Saved locations"
      icon={<MapPin size={14} color={sentinelText[200]} />}
      meta={Number.isFinite(limit) ? `${locations.length} of ${limit} · ${planLabel}` : `${locations.length} · ${planLabel}`}
    >
      <Text style={styles.muted}>We email you when a fire starts within each location’s radius. The website uses the same list.</Text>
      {locations.map(loc => (
        <SavedLocationRow
          key={loc.id}
          location={loc}
          onRadius={miles => run(() => updateLocation(loc.id, { notify_radius_miles: miles }))}
          onAlerts={on => run(() => updateLocation(loc.id, { alerts_enabled: on }))}
          onRemove={() =>
            Alert.alert(`Remove ${loc.name}?`, 'You will stop getting alerts for this location.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => run(() => removeLocation(loc.id)) },
            ])
          }
        />
      ))}
      {adding ? (
        <PlaceSearch
          placeholder="Search an address, city or ZIP"
          onPick={place =>
            run(async () => {
              await addLocation({
                name: place.name.split(',')[0] || place.name,
                address: place.name,
                latitude: place.lat,
                longitude: place.lng,
              });
              setAdding(false);
            })
          }
        />
      ) : atLimit ? (
        <Text style={styles.muted}>You’ve reached your plan’s limit. Remove a location, or upgrade on the website for more.</Text>
      ) : (
        <Button label="Add location" variant="ghost" onPress={() => setAdding(true)} />
      )}
      {actionError || error ? <Text style={styles.error}>{actionError || error}</Text> : null}
    </Section>
  );
}

function SavedLocationRow({
  location,
  onRadius,
  onAlerts,
  onRemove,
}: {
  location: SavedLocation;
  onRadius: (miles: number) => void;
  onAlerts: (on: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{location.name}</Text>
          {location.address && location.address !== location.name ? (
            <Text style={styles.muted} numberOfLines={1}>
              {location.address}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${location.name}`} style={styles.iconButton}>
          <Trash2 size={16} color={sentinelText[300]} />
        </Pressable>
      </View>
      <RadiusChips value={location.notify_radius_miles} options={RADIUS_OPTIONS_MILES} onChange={onRadius} />
      <View style={styles.switchRow}>
        <Text style={styles.body}>Email alerts</Text>
        <Switch value={location.alerts_enabled} onValueChange={onAlerts} trackColor={{ true: fire[600] }} />
      </View>
    </View>
  );
}

function FollowedSection() {
  const { follows, unfollow } = useFollowedIncidents();
  return (
    <Section title="Following" icon={<Flame size={14} color={sentinelText[200]} />} meta={`${follows.length}`}>
      {follows.length === 0 ? (
        <Text style={styles.muted}>Follow a fire from its details to get its updates by email. Followed fires appear here.</Text>
      ) : (
        follows.map(f => (
          <View key={f.incident_id} style={styles.followRow}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => router.navigate({ pathname: '/', params: { incident: f.incident_id } })}
              accessibilityRole="button"
              accessibilityLabel={`Show ${f.incident_name ?? 'fire'} on the map`}
            >
              <Text style={styles.itemTitle}>{f.incident_name || 'Unnamed fire'}</Text>
              <Text style={styles.muted}>Following since {formatRelative(f.created_at)}</Text>
            </Pressable>
            <Pressable onPress={() => unfollow(f.incident_id)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Unfollow</Text>
            </Pressable>
          </View>
        ))
      )}
    </Section>
  );
}

function Section({ title, icon, meta, children }: { title: string; icon: React.ReactNode; meta?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: sentinel[850] },
  content: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 20 },
  title: { color: accent.white, fontSize: 24, fontWeight: '700' },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { flex: 1, color: sentinelText[200], fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionMeta: { color: sentinelText[300], fontSize: 12 },
  card: { borderRadius: radius.md, backgroundColor: sentinel[900], borderWidth: 1, borderColor: sentinel[700], padding: 12, gap: 12 },
  body: { color: sentinelText[100], fontSize: 15, lineHeight: 21 },
  muted: { color: sentinelText[300], fontSize: 13, lineHeight: 18 },
  label: { color: sentinelText[200], fontSize: 13, fontWeight: '600' },
  error: { color: accent.amber400, fontSize: 13 },
  link: { color: fire[400], fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: sentinel[600] },
  chipActive: { backgroundColor: 'rgba(255,90,0,0.25)', borderColor: 'rgba(255,90,0,0.5)' },
  chipText: { color: sentinelText[200], fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: accent.white },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedText: { flex: 1, color: sentinelText[100], fontSize: 14 },
  item: { gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: sentinel[700] },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemTitle: { color: accent.slate100, fontSize: 15, fontWeight: '600' },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: sentinel[700] },
});
