/**
 * The layer panel, matching the web's LayerControl.jsx popover: a floating `rounded-2xl` card
 * (bg-sentinel-900, border-sentinel-600) titled MAP LAYERS, with collapsible sections whose rows are
 * the web's LayerToggle (label, small sublabel, `w-9 h-5` switch: fire-600/25 with a fire-600/50
 * ring when on, sentinel-500 when off, white knob). Plan-locked rows show a lock and the plan;
 * rows the app can't draw yet are dimmed and marked Soon.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Hexagon, Lock, Ruler } from 'lucide-react-native';

import { usePlan } from '@/auth/usePlan';
import {
  FIRE_DANGER_LAYER_KEYS,
  NATIVE_LAYERS,
  TAB_SECTIONS,
  rowKey,
  rowLabels,
  type LayerState,
  type MapTab,
} from '@/map/catalog';
import { accent, sentinel, sentinelText } from '@/theme';
import type { MeasureMode } from './MeasurementPanel';

interface Props {
  tab: MapTab;
  layers: LayerState;
  onToggle: (key: string, on: boolean) => void;
  maxHeight: number;
  /** The measurement tool's mode, when it's on. */
  measureMode: MeasureMode | null;
  /** Ruler / hexagon in the header: start that mode, or stop it if it's already on. */
  onMeasure: (mode: MeasureMode | null) => void;
}

export function LayerPanel({ tab, layers, onToggle, maxHeight, measureMode, onMeasure }: Props) {
  const plan = usePlan();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const lockedPlan = (key: string): string | null => {
    if ((key === 'criticalInfrastructure' || key === 'landOwnership') && !plan.hasProInfrastructureAccess) return 'Pro';
    if (key === 'routeToSafety' && !plan.hasEvacuationRoutesAccess) return 'Pro';
    if (key === 'fireBehaviorModeling' && !plan.hasFireBehaviorModelingAccess) return 'Plus';
    if (FIRE_DANGER_LAYER_KEYS.has(key) && !plan.hasFireDangerAccess) return 'Plus';
    return null;
  };

  return (
    <View style={[styles.card, { maxHeight }]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{tab === 'models' ? 'Model Layers' : 'Map Layers'}</Text>
        <View style={styles.measureButtons}>
          {(
            [
              ['distance', Ruler, 'Measure distance'],
              ['polygon', Hexagon, 'Measure area'],
            ] as const
          ).map(([mode, Icon, label]) => {
            const active = measureMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => onMeasure(active ? null : mode)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                hitSlop={4}
                style={({ pressed }) => [styles.measureButton, active && styles.measureActive, pressed && !active && { backgroundColor: sentinel[700] }]}
              >
                <Icon size={14} color={active ? accent.white : sentinelText[200]} />
              </Pressable>
            );
          })}
        </View>
      </View>
      {tab === 'models' ? (
        <Text style={styles.empty}>HRRR, GFS and HAFS model forecasts are coming to the app in a later phase.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {TAB_SECTIONS[tab].map(section => {
            const isCollapsed = collapsed[section.id];
            const Chevron = isCollapsed ? ChevronRight : ChevronDown;
            return (
              <View key={section.id} style={styles.section}>
                <Pressable
                  onPress={() => setCollapsed(c => ({ ...c, [section.id]: !c[section.id] }))}
                  style={styles.sectionHeader}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !isCollapsed }}
                >
                  <Chevron size={14} color={sentinelText[300]} />
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </Pressable>
                {isCollapsed ? null : (
                  <View style={styles.rows}>
                    {section.rows.map((row, i) => {
                      const key = rowKey(row);
                      const { label, sublabel } = rowLabels(row);
                      const locked = lockedPlan(key);
                      const native = NATIVE_LAYERS.has(key);
                      const on = native && !locked && Boolean(layers[key]);
                      const disabled = Boolean(locked) || !native;
                      return (
                        <Pressable
                          key={`${section.id}-${key}`}
                          onPress={() => onToggle(key, !on)}
                          disabled={disabled}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: on, disabled }}
                          accessibilityLabel={`${label}${locked ? `, requires ${locked}` : !native ? ', coming soon' : ''}`}
                          style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && !disabled && styles.rowPressed]}
                        >
                          <View style={styles.rowText}>
                            <View style={styles.labelLine}>
                              {locked ? <Lock size={12} color={accent.amber400} /> : null}
                              <Text style={[styles.label, on && { color: accent.white }, disabled && styles.labelDisabled]} numberOfLines={1}>
                                {label}
                              </Text>
                              {locked ? <Text style={styles.planTag}>{locked}</Text> : null}
                              {!locked && !native ? <Text style={styles.soonTag}>Soon</Text> : null}
                            </View>
                            <Text style={styles.sublabel} numberOfLines={2}>
                              {sublabel}
                            </Text>
                          </View>
                          <View style={[styles.switch, on ? styles.switchOn : styles.switchOff, disabled && { opacity: 0.4 }]}>
                            <View style={[styles.knob, on && styles.knobOn]} />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: sentinel[600],
    backgroundColor: sentinel[900],
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: sentinel[700],
  },
  measureButtons: { flexDirection: 'row', gap: 4 },
  measureButton: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  measureActive: { backgroundColor: 'rgba(255,90,0,0.25)', borderColor: 'rgba(255,90,0,0.5)' },
  headerText: { color: accent.white, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  body: { paddingVertical: 8, paddingHorizontal: 8, gap: 8 },
  section: { gap: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  sectionTitle: { color: sentinelText[100], fontSize: 13, fontWeight: '600' },
  rows: { borderRadius: 8, backgroundColor: sentinel[900], borderWidth: 1, borderColor: sentinel[700], overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: sentinel[700] },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  rowText: { flex: 1 },
  labelLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: sentinelText[100], fontSize: 14, fontWeight: '500', flexShrink: 1 },
  labelDisabled: { color: sentinelText[300] },
  sublabel: { color: sentinelText[300], fontSize: 10, lineHeight: 13 },
  planTag: { color: accent.amber400, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  soonTag: {
    color: sentinelText[300],
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  switch: { width: 36, height: 20, borderRadius: 10, justifyContent: 'center' },
  switchOn: { backgroundColor: 'rgba(255,90,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.5)' },
  switchOff: { backgroundColor: sentinel[500] },
  knob: { position: 'absolute', left: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff' },
  knobOn: { left: 17 },
  empty: { color: sentinelText[200], fontSize: 14, lineHeight: 20, padding: 16 },
});
