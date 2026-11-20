import type { AppMode } from '@/lib/appMode';

export const AUTH_HOME = '/(auth)/welcome';
export const ONBOARDING_HOME = '/onboarding/role';
export const LOCAL_ONBOARDING_HOME = '/onboarding/create-house'; // local mode has no role choice and no join-house
export const APP_HOME = '/(app)/(tabs)';
export const SYNC_HOME = '/(app)/sync'; // local→cloud sync, shown once after a cloud login that came from local mode

export interface GuardInput {
  mode: AppMode;
  signedIn: boolean;
  initializing: boolean;
  profileReady: boolean;
  housesStatus: 'loading' | 'error' | 'success';
  hasHouse: boolean;
  /** First route segment ('(auth)', '(app)', 'onboarding'). */
  group: string | undefined;
  /** True while a local→cloud sync is pending (the user logged in from local mode). */
  pendingSync?: boolean;
  /** True when the current route is the sync screen itself. */
  onSync?: boolean;
}

export interface GuardDecision {
  /** True when the user is where they belong (the overlay can go away). */
  settled: boolean;
  redirect: string | null;
}

/** Pure routing decision shared by the root layout gates. Local mode is always "signed in" (fixed user). */
export function decideRoute(i: GuardInput): GuardDecision {
  if (!i.signedIn) {
    if (i.initializing) return { settled: false, redirect: null };
    const inAuth = i.group === '(auth)';
    return { settled: inAuth, redirect: inAuth ? null : AUTH_HOME };
  }
  if (!i.profileReady || i.housesStatus !== 'success') return { settled: false, redirect: null };
  // A cloud login that came from local mode must resolve the sync before the app proceeds.
  if (i.pendingSync) return i.onSync ? { settled: true, redirect: null } : { settled: false, redirect: SYNC_HOME };
  const allowed = i.hasHouse ? i.group === '(app)' || i.group === 'onboarding' : i.group === 'onboarding';
  if (allowed) return { settled: true, redirect: null };
  return { settled: false, redirect: i.hasHouse ? APP_HOME : i.mode === 'local' ? LOCAL_ONBOARDING_HOME : ONBOARDING_HOME };
}
