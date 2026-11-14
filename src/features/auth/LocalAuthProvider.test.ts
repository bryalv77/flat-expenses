import { localAuthValue } from './LocalAuthProvider';

describe('localAuthValue', () => {
  it('exposes the fixed local user, ready, no features', () => {
    expect(localAuthValue.authUser).toEqual({ uid: 'local', email: null, displayName: null });
    expect(localAuthValue.initializing).toBe(false);
    expect(localAuthValue.profileReady).toBe(true);
    expect(localAuthValue.features).toEqual({ google: false, apple: false });
    expect(localAuthValue.isPasswordAccount).toBe(false);
  });

  it('account actions throw a clear error', async () => {
    const v = localAuthValue;
    await expect(v.signIn('a', 'b')).rejects.toThrow(/local mode/i);
    await expect(v.signUp({ email: 'a', password: 'b', displayName: 'c' })).rejects.toThrow(/local mode/i);
    await expect(v.resetPassword('a')).rejects.toThrow(/local mode/i);
    await expect(v.changePassword('a', 'b')).rejects.toThrow(/local mode/i);
    await expect(v.deleteAccount()).rejects.toThrow(/local mode/i);
    await expect(v.signOut()).rejects.toThrow(/local mode/i);
  });
});
