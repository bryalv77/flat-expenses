import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, ErrorBoundary, Text, ToastProvider } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth';
import { getTreeKey, subscribeTreeReset } from '@/features/auth/appModeSwitch';
import { decideRoute, type GuardInput } from '@/features/auth/routeGuard';
import { getPendingSync, loadPendingSync, subscribePendingSync } from '@/features/sync/pending';
import { useMyHouses } from '@/features/houses/hooks';
import { useT } from '@/i18n';
import { getAppMode, loadAppMode } from '@/lib/appMode';
import { hasCloudSession } from '@/lib/cloudSession';
import { sweepLocalOrphans } from '@/lib/api/local/startup';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, spacing, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

/** Covers the navigator while the gate is deciding where the user belongs (prevents any flicker). */
function GateOverlay({ settled, onRetry }: { settled: boolean; onRetry?: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();

  useEffect(() => {
    if (settled) void SplashScreen.hideAsync();
  }, [settled]);

  if (settled) return null;
  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]} pointerEvents="auto">
      {onRetry ? (
        <View style={styles.retry}>
          <Text variant="body" color="secondaryLabel">
            {t('errors.generic')}
          </Text>
          <Button title={t('common.retry')} onPress={onRetry} variant="tinted" />
        </View>
      ) : (
        <ActivityIndicator color={colors.tint} />
      )}
    </View>
  );
}

/** Runs the pure guard decision and performs its redirect. */
function useGate(input: Omit<GuardInput, 'mode' | 'group' | 'onSync'>) {
  const router = useRouter();
  const segments = useSegments();
  const group = segments[0] as string | undefined;
  const onSync = group === '(app)' && segments[1] === 'sync';
  const { settled, redirect } = decideRoute({ ...input, mode: getAppMode(), group, onSync });
  useEffect(() => {
    if (redirect) router.replace(redirect as Href);
  }, [redirect, router]);
  return settled;
}

function SignedOutGate({ initializing }: { initializing: boolean }) {
  const settled = useGate({ signedIn: false, initializing, profileReady: false, housesStatus: 'loading', hasHouse: false });
  return <GateOverlay settled={settled} />;
}

function SignedInGate({ profileReady }: { profileReady: boolean }) {
  return profileReady ? <HouseGate /> : <GateOverlay settled={false} />;
}

function HouseGate() {
  const houses = useMyHouses();
  const pendingSync = useSyncExternalStore(subscribePendingSync, getPendingSync, getPendingSync);
  const settled = useGate({
    signedIn: true,
    initializing: false,
    profileReady: true,
    housesStatus: houses.isSuccess ? 'success' : houses.isError ? 'error' : 'loading',
    hasHouse: (houses.data?.length ?? 0) > 0,
    pendingSync,
  });
  return <GateOverlay settled={settled} onRetry={houses.isError ? () => void houses.refetch() : undefined} />;
}

function RootNavigator() {
  const { scheme } = useTheme();
  const { authUser, initializing, profileReady } = useAuth();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      {authUser ? <SignedInGate profileReady={profileReady} /> : <SignedOutGate initializing={initializing} />}
    </>
  );
}

/** Loads the saved app mode once before any provider renders; a mode switch bumps the key and remounts the tree. */
function ModeGate({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const treeKey = useSyncExternalStore(subscribeTreeReset, getTreeKey, getTreeKey);
  useEffect(() => {
    void (async () => {
      // Before the UI is usable, so an upload still waiting for its bill is never mistaken for an orphan. Never throws.
      const mode = await loadAppMode(hasCloudSession);
      if (mode === 'local') await sweepLocalOrphans();
      await loadPendingSync();
      setLoaded(true);
    })();
  }, []);
  return loaded ? <Fragment key={treeKey}>{children}</Fragment> : null; // the native splash stays up meanwhile
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ModeGate>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <ToastProvider>
                <ErrorBoundary>
                  <AuthProvider>
                    <RootNavigator />
                  </AuthProvider>
                </ErrorBoundary>
              </ToastProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </ModeGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  retry: { gap: spacing.md, alignItems: 'center', padding: spacing.xl },
});
