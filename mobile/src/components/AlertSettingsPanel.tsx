/**
 * Alert settings in the Weather sidebar, after WeatherWise's: turn each NWS alert type on or off
 * and set its colour, outline thickness (0–10 px) and fill opacity (0–100%). Types with alerts in
 * effect are listed first; the rest are grouped as warnings, watches, advisories and statements.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw, Search } from 'lucide-react-native';

import { useAlertSettings, type AlertTypeSettings } from '@/context/AlertSettingsContext';
import { ALERT_STYLES, alertCode } from '@/data/alertStyles';
import { accent, radius, sentinel, sentinelText } from '@/theme';

const SWATCHES = [
  '#FF0000', '#FF8C00', '#FFA500', '#FFFF00', '#7FFF00', '#00FF00', '#2E8B57', '#00FFFF',
  '#00BFFF', '#1E90FF', '#0000FF', '#8A2BE2', '#FF00FF', '#FF1493', '#FFFFFF', '#C0C0C0',
];

const GROUPS: { title: string; test: (code: string) => boolean }[] = [
  { title: 'Warnings', test: c => c.endsWith('.W') },
  { title: 'Watches', test: c => c.endsWith('.A') },
  { title: 'Advisories', test: c => c.endsWith('.Y') },
  { title: 'Statements & other', test: c => !/\.(W|A|Y)$/.test(c) },
];

const byPriority = (a: string, b: string) => ALERT_STYLES[a].priority - ALERT_STYLES[b].priority;

export function AlertSettingsPanel({ header, activeEvents }: { header: React.ReactElement; activeEvents: string[] }) {
  const { resetAll, overrides } = useAlertSettings();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const activeCodes = useMemo(() => {
    const set = new Set<string>();
    for (const e of activeEvents) {
      const code = alertCode(null, null, e);
      if (code) set.add(code);
    }
    return [...set].sort(byPriority);
  }, [activeEvents]);

  const q = query.trim().toLowerCase();
  const matches = (code: string) => !q || ALERT_STYLES[code].name.toLowerCase().includes(q);
  const all = Object.keys(ALERT_STYLES).sort(byPriority);
  const sections = [
    { title: 'In effect now', codes: activeCodes.filter(matches) },
    ...GROUPS.map(g => ({ title: g.title, codes: all.filter(c => g.test(c) && matches(c)) })),
  ].filter(s => s.codes.length > 0);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {header}
      <View style={styles.intro}>
        <Text style={styles.introText}>Choose which alerts show on the map and how they look. Saved on this device.</Text>
        {Object.keys(overrides).length ? (
          <Pressable onPress={resetAll} hitSlop={6} style={styles.resetAll} accessibilityRole="button">
            <RotateCcw size={12} color={sentinelText[300]} />
            <Text style={styles.resetText}>Reset all</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.searchBox}>
        <Search size={16} color={sentinelText[300]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search alert types"
          placeholderTextColor={sentinelText[400]}
          style={styles.search}
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search alert types"
        />
      </View>
      {sections.map(section => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.rows}>
            {section.codes.map((code, i) => (
              <AlertTypeRow
                key={`${section.title}-${code}`}
                code={code}
                first={i === 0}
                open={open === `${section.title}-${code}`}
                onToggleOpen={() => setOpen(cur => (cur === `${section.title}-${code}` ? null : `${section.title}-${code}`))}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function AlertTypeRow({ code, first, open, onToggleOpen }: { code: string; first: boolean; open: boolean; onToggleOpen: () => void }) {
  const { settingsFor, isCustomized, update, reset } = useAlertSettings();
  const s = settingsFor(code);
  const name = ALERT_STYLES[code].name;
  const Chevron = open ? ChevronDown : ChevronRight;
  const set = (change: Partial<AlertTypeSettings>) => update(code, change);

  return (
    <View style={[!first && styles.rowDivider]}>
      <View style={styles.row}>
        <Pressable
          onPress={onToggleOpen}
          style={styles.rowMain}
          accessibilityRole="button"
          accessibilityLabel={`${name} settings`}
          accessibilityState={{ expanded: open }}
        >
          <Chevron size={14} color={sentinelText[300]} />
          <View style={[styles.swatch, { backgroundColor: hexAlpha(s.color, s.fillOpacity), borderColor: s.color, borderWidth: Math.max(1, Math.min(s.lineWidth, 3)) }]} />
          <Text style={[styles.name, !s.enabled && { color: sentinelText[400] }]} numberOfLines={1}>
            {name}
          </Text>
          {isCustomized(code) ? <Text style={styles.edited}>Edited</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => set({ enabled: !s.enabled })}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityLabel={`Show ${name}`}
          accessibilityState={{ checked: s.enabled }}
          style={[styles.switch, s.enabled ? styles.switchOn : styles.switchOff]}
        >
          <View style={[styles.knob, s.enabled && styles.knobOn]} />
        </Pressable>
      </View>

      {open ? (
        <View style={styles.editor}>
          <Text style={styles.label}>Color</Text>
          <View style={styles.swatches}>
            {[ALERT_STYLES[code].color, ...SWATCHES.filter(c => c !== ALERT_STYLES[code].color)].map((c, i) => {
              const selected = s.color.toUpperCase() === c.toUpperCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => set({ color: c })}
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? 'Default color' : `Color ${c}`}
                  accessibilityState={{ selected }}
                  style={[styles.colorChip, { backgroundColor: c }, selected && styles.colorChipSelected]}
                >
                  {i === 0 ? <Text style={styles.defaultMark}>D</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Stepper
            label="Border thickness"
            value={`${s.lineWidth.toFixed(1)} px`}
            onMinus={() => set({ lineWidth: Math.max(0, round1(s.lineWidth - 0.5)) })}
            onPlus={() => set({ lineWidth: Math.min(10, round1(s.lineWidth + 0.5)) })}
          />
          <Stepper
            label="Fill opacity"
            value={`${Math.round(s.fillOpacity * 100)}%`}
            onMinus={() => set({ fillOpacity: Math.max(0, round2(s.fillOpacity - 0.05)) })}
            onPlus={() => set({ fillOpacity: Math.min(1, round2(s.fillOpacity + 0.05)) })}
          />
          {s.lineWidth < 0.1 && s.fillOpacity < 0.1 && s.enabled ? (
            <Text style={styles.warn}>With no border and no fill, this alert won’t be visible on the map.</Text>
          ) : null}
          {isCustomized(code) ? (
            <Pressable onPress={() => reset(code)} hitSlop={6} style={styles.resetRow} accessibilityRole="button">
              <RotateCcw size={12} color={sentinelText[300]} />
              <Text style={styles.resetText}>Reset to default</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={[styles.label, { flex: 1, marginTop: 0 }]}>{label}</Text>
      <Pressable onPress={onMinus} hitSlop={6} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`Less ${label.toLowerCase()}`}>
        <Minus size={14} color={sentinelText[100]} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onPlus} hitSlop={6} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`}>
        <Plus size={14} color={sentinelText[100]} />
      </Pressable>
    </View>
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingTop: 10 },
  introText: { flex: 1, color: sentinelText[300], fontSize: 12, lineHeight: 17 },
  resetAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetText: { color: sentinelText[300], fontSize: 12, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: radius.md,
    backgroundColor: sentinel[900],
    borderWidth: 1,
    borderColor: sentinel[600],
  },
  search: { flex: 1, color: accent.slate100, fontSize: 16, paddingVertical: 10 },
  section: { paddingHorizontal: 8, marginTop: 14, gap: 6 },
  sectionTitle: { color: sentinelText[100], fontSize: 13, fontWeight: '600', paddingHorizontal: 6 },
  rows: { borderRadius: 8, backgroundColor: sentinel[900], borderWidth: 1, borderColor: sentinel[700], overflow: 'hidden' },
  rowDivider: { borderTopWidth: 1, borderTopColor: sentinel[700] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 10 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingVertical: 10, minHeight: 44 },
  swatch: { width: 18, height: 12, borderRadius: 3 },
  name: { flexShrink: 1, color: sentinelText[100], fontSize: 14, fontWeight: '500' },
  edited: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  switch: { width: 36, height: 20, borderRadius: 10, justifyContent: 'center' },
  switchOn: { backgroundColor: 'rgba(255,90,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.5)' },
  switchOff: { backgroundColor: sentinel[500] },
  knob: { position: 'absolute', left: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff' },
  knobOn: { left: 17 },
  editor: { paddingHorizontal: 12, paddingBottom: 12, gap: 8, backgroundColor: sentinel[800] },
  label: { color: sentinelText[300], fontSize: 11, fontWeight: '600', marginTop: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  colorChipSelected: { borderWidth: 3, borderColor: '#ffffff' },
  defaultMark: { color: '#000000', fontSize: 11, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: sentinel[700],
    borderWidth: 1,
    borderColor: sentinel[600],
  },
  stepValue: { minWidth: 56, textAlign: 'center', color: accent.white, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  warn: { color: accent.amber400, fontSize: 12, lineHeight: 17 },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 28 },
});
