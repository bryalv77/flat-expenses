import { decideRoute, type GuardInput } from './routeGuard';

const base: GuardInput = { mode: 'cloud', signedIn: false, initializing: false, profileReady: false, housesStatus: 'loading', hasHouse: false, group: undefined };
const d = (o: Partial<GuardInput>) => decideRoute({ ...base, ...o });

describe('cloud, signed out', () => {
  it('waits while initializing', () => expect(d({ initializing: true })).toEqual({ settled: false, redirect: null }));
  it('redirects to welcome outside (auth)', () => expect(d({ group: '(app)' })).toEqual({ settled: false, redirect: '/(auth)/welcome' }));
  it('settles inside (auth)', () => expect(d({ group: '(auth)' })).toEqual({ settled: true, redirect: null }));
});

describe('cloud, signed in', () => {
  const si = { signedIn: true };
  it('waits for the profile', () => expect(d({ ...si, group: '(auth)' })).toEqual({ settled: false, redirect: null }));
  it('waits for houses', () => expect(d({ ...si, profileReady: true })).toEqual({ settled: false, redirect: null }));
  it('no house: forces onboarding/role', () => {
    expect(d({ ...si, profileReady: true, housesStatus: 'success', group: '(app)' })).toEqual({ settled: false, redirect: '/onboarding/role' });
  });
  it('no house: onboarding is settled', () => {
    expect(d({ ...si, profileReady: true, housesStatus: 'success', group: 'onboarding' })).toEqual({ settled: true, redirect: null });
  });
  it('house: (app) and onboarding settled', () => {
    for (const group of ['(app)', 'onboarding'])
      expect(d({ ...si, profileReady: true, housesStatus: 'success', hasHouse: true, group })).toEqual({ settled: true, redirect: null });
  });
  it('house: (auth) goes to tabs', () => {
    expect(d({ ...si, profileReady: true, housesStatus: 'success', hasHouse: true, group: '(auth)' })).toEqual({ settled: false, redirect: '/(app)/(tabs)' });
  });
  it('error: no redirect, not settled', () => {
    expect(d({ ...si, profileReady: true, housesStatus: 'error' })).toEqual({ settled: false, redirect: null });
  });
});

describe('local', () => {
  const l = { mode: 'local' as const, signedIn: true, profileReady: true };
  it('no house: skips auth screens and goes to create-house', () => {
    expect(d({ ...l, housesStatus: 'success', group: '(auth)' })).toEqual({ settled: false, redirect: '/onboarding/create-house' });
    expect(d({ ...l, housesStatus: 'success', group: '(app)' })).toEqual({ settled: false, redirect: '/onboarding/create-house' });
  });
  it('no house: onboarding is settled', () => {
    expect(d({ ...l, housesStatus: 'success', group: 'onboarding' })).toEqual({ settled: true, redirect: null });
  });
  it('has house: auth screens go to tabs, (app) settled', () => {
    expect(d({ ...l, housesStatus: 'success', hasHouse: true, group: '(auth)' })).toEqual({ settled: false, redirect: '/(app)/(tabs)' });
    expect(d({ ...l, housesStatus: 'success', hasHouse: true, group: '(app)' })).toEqual({ settled: true, redirect: null });
  });
});

describe('pending sync (cloud, signed in)', () => {
  const si = { signedIn: true, profileReady: true, housesStatus: 'success' as const, hasHouse: true };
  it('routes to the sync screen before the app', () => {
    expect(d({ ...si, pendingSync: true, group: '(app)' })).toEqual({ settled: false, redirect: '/(app)/sync' });
  });
  it('settles on the sync screen itself', () => {
    expect(d({ ...si, pendingSync: true, onSync: true, group: '(app)' })).toEqual({ settled: true, redirect: null });
  });
  it('ignores pending sync once resolved', () => {
    expect(d({ ...si, pendingSync: false, group: '(app)' })).toEqual({ settled: true, redirect: null });
  });
  it('waits for profile and houses before routing to sync', () => {
    expect(d({ signedIn: true, pendingSync: true, profileReady: false, housesStatus: 'loading', hasHouse: false, group: '(app)' })).toEqual({ settled: false, redirect: null });
  });
});
