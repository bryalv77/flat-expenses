import { localAuthValue } from './LocalAuthProvider';

describe('localAuthValue', () => {
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
