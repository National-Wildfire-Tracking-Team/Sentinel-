/** Small shared UI pieces: buttons, map buttons, loading/error/empty states. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from '@/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && { opacity: 0.8 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.fire500} />
      ) : (
        <Text style={[styles.buttonText, variant !== 'primary' && { color: colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Round floating action button used over the map. */
export function MapButton({
  onPress,
  label,
  children,
  active,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.mapButton, active && styles.mapButtonActive, pressed && { opacity: 0.75 }]}
    >
      {children}
    </Pressable>
  );
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
      }}
    />
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.fire500} size="large" />
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateText}>{message}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={[styles.stateTitle, { color: colors.fire400 }]}>Something went wrong</Text>
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 12 }} /> : null}
    </View>
  );
}

/** Thin banner for non-blocking problems (e.g. one feed down, offline refresh). */
export function Banner({ message, tone = 'warn', onPress }: { message: string; tone?: 'warn' | 'error'; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.banner, tone === 'error' && { borderColor: colors.danger }]}
      accessibilityRole={onPress ? 'button' : 'text'}
    >
      <Text style={styles.bannerText}>{message}</Text>
      {onPress ? <Text style={styles.bannerAction}>Retry</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.fire600 },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  mapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(13,16,19,0.92)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  mapButtonActive: { borderColor: colors.fire600 },
  state: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  stateText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(13,16,19,0.95)',
    borderWidth: 1,
    borderColor: colors.fire700,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, color: colors.text, fontSize: 14 },
  bannerAction: { color: colors.fire400, fontWeight: '700', fontSize: 14 },
});
