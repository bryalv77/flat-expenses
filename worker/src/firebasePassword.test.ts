import { createCipheriv, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { firebaseParamsFromEnv, firebaseScryptHash, formatFirebaseHash, verifyFirebasePassword, type FirebaseScryptParams } from './firebasePassword';

// Reference written with node:crypto only (the Worker code uses noble scrypt + WebCrypto), following the algorithm of the
// `firebase-scrypt` package (https://github.com/jeroenvollenbrock/firebase-scrypt: scrypt -> AES-256-CTR of the signer key).
const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const reference = (password: string, salt: string, p: FirebaseScryptParams) => {
  const key = scryptSync(password, Buffer.concat([b64(salt), b64(p.saltSeparator)]), 32, { N: 2 ** p.memCost, r: p.rounds, p: 1, maxmem: 256 * 1024 * 1024 });
  const c = createCipheriv('aes-256-ctr', key, Buffer.alloc(16));
  return Buffer.concat([c.update(b64(p.signerKey)), c.final()]).toString('base64');
};

const PROJECT: FirebaseScryptParams = { memCost: 14, rounds: 8, saltSeparator: 'Bw==', signerKey: 'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==' };
const OTHER: FirebaseScryptParams = { memCost: 12, rounds: 4, saltSeparator: 'AAEC', signerKey: 'c2lnbmVyLWtleS1mb3ItdGVzdA==' };

describe('Firebase scrypt', () => {
  it("matches the reference package's own published test vector", async () => {
    // from firebase-scrypt's spec: memCost 1, rounds 1, saltSeparator 'separator', signerKey 'superlongkey', password 'test', salt 'salt'
    const p = { memCost: 1, rounds: 1, saltSeparator: 'separator', signerKey: 'superlongkey' };
    expect(await firebaseScryptHash('test', 'salt', p)).toBe('PrZI5nfqjOEk');
  });

  it.each([
    ['user1password', '42xEC+ixf3L2lw==', PROJECT],
    ['pässwörd with spaces ✓', 'abc_def-ghi12345==', PROJECT], // URL-safe salt, non-ASCII password
    ['secret', 'c2FsdA==', OTHER],
  ])('agrees with the node:crypto reference for %s', async (password, salt, params) => {
    expect(await firebaseScryptHash(password, salt, params)).toBe(reference(password, salt, params));
  });

  it('verifies the stored format, rejects wrong passwords and malformed values', async () => {
    const hash = await firebaseScryptHash('user1password', '42xEC+ixf3L2lw==', PROJECT);
    const stored = formatFirebaseHash(hash, '42xEC+ixf3L2lw==');
    expect(await verifyFirebasePassword(stored, 'user1password', PROJECT)).toBe(true);
    expect(await verifyFirebasePassword(stored, 'user1Password', PROJECT)).toBe(false);
    expect(await verifyFirebasePassword(stored, 'user1password', OTHER)).toBe(false); // wrong project parameters
    expect(await verifyFirebasePassword(stored.replace('firebase-scrypt$', 'x$'), 'user1password', PROJECT)).toBe(false);
    for (const bad of ['firebase-scrypt$', 'firebase-scrypt$onlyhash', 'firebase-scrypt$a$b$c', '']) {
      expect(await verifyFirebasePassword(bad, 'x', PROJECT)).toBe(false);
    }
    // URL-safe encoding of the same hash (Admin SDK listUsers) is accepted too
    const urlSafe = hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifyFirebasePassword(formatFirebaseHash(urlSafe, '42xEC-ixf3L2lw'), 'user1password', PROJECT)).toBe(true);
  });

  it('reads the project parameters from the environment (defaults 8 / 14), or null when not configured', () => {
    expect(firebaseParamsFromEnv({})).toBeNull();
    expect(firebaseParamsFromEnv({ FIREBASE_SCRYPT_SIGNER_KEY: 'k' })).toBeNull();
    expect(firebaseParamsFromEnv({ FIREBASE_SCRYPT_SIGNER_KEY: 'k', FIREBASE_SCRYPT_SALT_SEPARATOR: 's' })).toEqual({ signerKey: 'k', saltSeparator: 's', rounds: 8, memCost: 14 });
    expect(firebaseParamsFromEnv({ FIREBASE_SCRYPT_SIGNER_KEY: 'k', FIREBASE_SCRYPT_SALT_SEPARATOR: 's', FIREBASE_SCRYPT_ROUNDS: '4', FIREBASE_SCRYPT_MEM_COST: '12' })).toMatchObject({ rounds: 4, memCost: 12 });
  });
});
