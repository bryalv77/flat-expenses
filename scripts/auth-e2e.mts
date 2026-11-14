// Manual check of src/lib/authClient.ts against a running Worker (cd worker && pnpm dev:local):
//   node --experimental-strip-types --no-warnings scripts/auth-e2e.mts
// Covers: token capture, session restore after "restart", data API with the token, error code mapping, offline, sign-out.
import assert from 'node:assert/strict';
import { createApiAuth } from '../src/lib/authClient.ts';
import { orNetworkError, toAuthError } from '../src/lib/authErrors.ts';

const URL_ = 'http://localhost:8787';
const ORIGIN = 'costospiso://';
let stored: string | null = null;
const storage = { get: async () => stored, set: async (t: string) => void (stored = t), clear: async () => void (stored = null) };
const email = `auth-${Math.random().toString(36).slice(2, 8)}@test.dev`;

const a = createApiAuth(URL_, storage, ORIGIN);
const up = await a.client.signUp.email({ email, password: 'password123', name: 'Ana' });
assert.equal(up.error, null);
assert.ok(stored, 'token captured from set-auth-token into storage');

// a brand new client instance (= app restart) restores the session from storage alone
const b = createApiAuth(URL_, storage, ORIGIN);
const s = await b.client.getSession();
assert.equal(s.data?.user.email, email);
assert.equal(s.data?.user.name, 'Ana');

// the same token authenticates the data API
const me = await fetch(`${URL_}/api/me`, { headers: { authorization: `Bearer ${await b.getToken()}` } });
assert.equal(me.status, 200);

// wrong credentials / duplicate / wrong current password map to the codes the app already translates
const bad = await createApiAuth(URL_, { ...storage, get: async () => null }, ORIGIN).client.signIn.email({ email, password: 'nope-nope-1' });
assert.equal((toAuthError(bad.error) as any).code, 'auth/invalid-credential');
const dup = await createApiAuth(URL_, { ...storage, get: async () => null }, ORIGIN).client.signUp.email({ email, password: 'password123', name: 'X' });
assert.equal((toAuthError(dup.error) as any).code, 'auth/email-already-in-use');
const wrong = await b.client.changePassword({ currentPassword: 'wrong-wrong-1', newPassword: 'password456' });
assert.equal((toAuthError(wrong.error) as any).code, 'auth/wrong-password');
const ok = await b.client.changePassword({ currentPassword: 'password123', newPassword: 'password456' });
assert.equal(ok.error, null);
const relog = await createApiAuth(URL_, { ...storage, get: async () => null }, ORIGIN).client.signIn.email({ email, password: 'password456' });
assert.equal(relog.error, null);

// offline: no status, no code -> network error code
assert.equal((toAuthError(undefined) as any).code, 'auth/network-request-failed');
const dead = createApiAuth('http://localhost:59999', { ...storage, get: async () => null }, ORIGIN);
await assert.rejects(orNetworkError(() => dead.client.signIn.email({ email, password: 'password456' })), (e: any) => e.code === 'auth/network-request-failed');

// delete account: wrong password is rejected, the right one removes the account and its sessions
const del1 = await b.client.deleteUser({ password: 'wrong-wrong-1' });
assert.equal((toAuthError(del1.error) as any).code, 'auth/wrong-password');
const del2 = await b.client.deleteUser({ password: 'password456' });
assert.equal(del2.error, null);
const gone = await createApiAuth(URL_, { ...storage, get: async () => null }, ORIGIN).client.signIn.email({ email, password: 'password456' });
assert.equal((toAuthError(gone.error) as any).code, 'auth/invalid-credential');
await b.clearToken();
assert.equal(stored, null);
console.log('ALL OK');
