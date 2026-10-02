import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, ErrorBoundary, Text, ToastProvider } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth';
import { useMyHouses } from '@/features/houses/hooks';
import { useT } from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, spacing, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const AUTH_HOME = '/(auth)/welcome' as Href;
const ONBOARDING_HOME = '/onboarding/role' as Href;
const APP_HOME = '/(app)/(tabs)' as Href;

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

function SignedOutGate({ initializing }: { initializing: boolean }) {
  const router = useRouter();
  const segments = useSegments();
  const inAuth = segments[0] === '(auth)';

  useEffect(() => {
    if (!initializing && !inAuth) router.replace(AUTH_HOME);
  }, [initializing, inAuth, router]);

  return <GateOverlay settled={!initializing && inAuth} />;
}

function SignedInGate({ profileReady }: { profileReady: boolean }) {
  return profileReady ? <HouseGate /> : <GateOverlay settled={false} />;
}

function HouseGate() {
  const router = useRouter();
  const segments = useSegments();
  const houses = useMyHouses();
  const group = segments[0] as string | undefined;

  const resolved = houses.isSuccess;
  const hasHouse = (houses.data?.length ?? 0) > 0;
  const allowed = hasHouse ? group === '(app)' || group === 'onboarding' : group === 'onboarding';

  useEffect(() => {
    if (!resolved || allowed) return;
    router.replace(hasHouse ? APP_HOME : ONBOARDING_HOME);
  }, [resolved, allowed, hasHouse, router]);

  const failed = houses.isError;
  return <GateOverlay settled={resolved && allowed} onRetry={failed ? () => void houses.refetch() : undefined} />;
}

function RootNavigator() {
  const { scheme } = useTheme();
  const { firebaseUser, initializing, profileReady } = useAuth();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      {firebaseUser ? <SignedInGate profileReady={profileReady} /> : <SignedOutGate initializing={initializing} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  retry: { gap: spacing.md, alignItems: 'center', padding: spacing.xl },
});
