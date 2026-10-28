/** Address search field with result list, plus "Use my current location". */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { LocateFixed, MapPin, Search } from 'lucide-react-native';

import { searchPlaces, type Place } from '@/lib/geocode';
import { accent, fire, radius, sentinel, sentinelText } from '@/theme';

export function PlaceSearch({ onPick, placeholder }: { onPick: (place: Place) => void; placeholder: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const found = await searchPlaces(q);
        if (!cancelled) {
          setResults(found);
          setError(found.length ? null : 'No places found.');
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Search failed.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const useCurrent = async () => {
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Allow location access in Settings to use your current location.');
      return;
    }
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name = 'Current location';
      try {
        const [addr] = await Location.reverseGeocodeAsync(pos.coords);
        if (addr) name = [addr.street, addr.city, addr.region].filter(Boolean).join(', ') || name;
      } catch {
        // Keep the generic name.
      }
      onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude, name });
    } catch {
      setError('Your position could not be determined right now.');
    } finally {
      setBusy(false);
    }
  };

  const pick = (place: Place) => {
    setQuery('');
    setResults([]);
    onPick(place);
  };

  return (
    <View style={styles.root}>
      <View style={styles.box}>
        <Search size={16} color={sentinelText[300]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={sentinelText[400]}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={placeholder}
        />
        {busy ? <ActivityIndicator color={fire[500]} /> : null}
      </View>
      {(query.trim().length >= 3 ? results : []).map(place => (
        <Pressable key={`${place.lat},${place.lng},${place.name}`} onPress={() => pick(place)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
          <MapPin size={15} color={fire[400]} />
          <Text style={styles.resultText} numberOfLines={2}>
            {place.name}
          </Text>
        </Pressable>
      ))}
      <Pressable onPress={useCurrent} style={({ pressed }) => [styles.result, pressed && styles.pressed]} accessibilityRole="button">
        <LocateFixed size={15} color={fire[400]} />
        <Text style={[styles.resultText, { color: fire[400], fontWeight: '600' }]}>Use my current location</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: sentinel[900],
    borderWidth: 1,
    borderColor: sentinel[600],
  },
  input: { flex: 1, color: accent.slate100, fontSize: 16, paddingVertical: 10 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 8, borderRadius: radius.md },
  pressed: { backgroundColor: sentinel[700] },
  resultText: { flex: 1, color: sentinelText[100], fontSize: 14 },
  error: { color: accent.amber400, fontSize: 13, paddingHorizontal: 8 },
});
