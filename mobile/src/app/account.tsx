/**
 * Sign in with the same Supabase email/password account as the website, or view the signed-in
 * account (role and plan from `profiles` / `subscriptions`, as on the web). Account creation and
 * billing stay on the website.
 */
import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { WEB_APP_URL } from '@/config/env';
import { colors, radius } from '@/theme';

const PLAN_LABEL: Record<string, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

export default function AccountScreen() {
  const auth = useAuth();

  if (!auth.isConfigured) {
    return (
      <View style={styles.root}>
        <EmptyState
          title="Sign-in unavailable"
          message="Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.local."
        />
      </View>
    );
  }
  if (auth.initializing) {
    return (
      <View style={styles.root}>
        <LoadingState message="Checking your session…" />
      </View>
    );
  }
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {auth.user ? <SignedIn /> : <SignInForm />}
    </ScrollView>
  );
}

function SignedIn() {
  const { user, role, subscription, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      router.back();
    } catch (err: any) {
      setError(err?.message || 'Sign out failed');
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={styles.title} accessibilityRole="header">
        Account
      </Text>
      <View style={styles.card}>
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Role" value={role.charAt(0).toUpperCase() + role.slice(1)} />
        <Row
          label="Plan"
          value={`${PLAN_LABEL[subscription.plan] ?? subscription.plan}${subscription.status !== 'active' ? ` (${subscription.status})` : ''}`}
          last
        />
      </View>
      <Button
        label="Manage account on the web"
        variant="secondary"
        onPress={() => Linking.openURL(`${WEB_APP_URL}/account`)}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Sign out" variant="ghost" onPress={onSignOut} loading={busy} />
    </>
  );
}

function SignInForm() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signIn(email, password);
      router.back();
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap “Forgot password”.');
      return;
    }
    setError(null);
    try {
      await resetPassword(email);
      setNotice('Check your email for a link to reset your password.');
    } catch (err: any) {
      setError(err?.message || 'Could not send the reset email');
    }
  };

  return (
    <>
      <Text style={styles.title} accessibilityRole="header">
        Sign in to Sentinel
      </Text>
      <Text style={styles.body}>Use the same account as app.nationalwildfiretrackingteam.org.</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
        accessibilityLabel="Email"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        accessibilityLabel="Password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Button label="Sign in" onPress={onSubmit} loading={busy} />
      <Button label="Forgot password" variant="ghost" onPress={onReset} />
      <Button
        label="Create an account on the web"
        variant="ghost"
        onPress={() => Linking.openURL(`${WEB_APP_URL}/register`)}
      />
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 21, marginBottom: 4 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14 },
  notice: { color: colors.success, fontSize: 14 },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: 15 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '500', flexShrink: 1 },
});
