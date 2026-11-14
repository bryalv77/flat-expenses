import { scrypt } from '@noble/hashes/scrypt.js';

// Verifies passwords hashed by Firebase Auth (its modified scrypt), so migrated users keep their passwords (issue #7 §13).
// Algorithm: scrypt(password, userSalt + saltSeparator, N=2^memCost, r=rounds, p=1, 32 bytes) -> AES-256-CTR (zero IV) of the
// project's signer key -> base64. Same as the `firebase-scrypt` package; project parameters: Firebase console >
// Authentication > Users > menu > "Password hash parameters".
export interface FirebaseScryptParams {
  signerKey: string;
  saltSeparator: string;
  rounds: number;
  memCost: number;
}

/** What the migration stores in `account.password` for a Firebase user: `firebase-scrypt$<passwordHash>$<passwordSalt>`. */
export const FIREBASE_HASH_PREFIX = 'firebase-scrypt$';
export const formatFirebaseHash = (passwordHash: string, passwordSalt: string) => `${FIREBASE_HASH_PREFIX}${passwordHash}$${passwordSalt}`;

// The Admin SDK exports URL-safe base64, the CLI export standard base64: accept both, padded or not, and ignore a dangling
// sixth bit like Node's Buffer does (the reference implementation decodes with Buffer).
const b64 = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const whole = t.length % 4 === 1 ? t.slice(0, -1) : t;
  return Uint8Array.from(atob(whole + '='.repeat((4 - (whole.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

async function firebaseHash(password: string, saltB64: string, p: FirebaseScryptParams): Promise<Uint8Array> {
  const userSalt = b64(saltB64), sep = b64(p.saltSeparator);
  const salt = new Uint8Array(userSalt.length + sep.length);
  salt.set(userSalt);
  salt.set(sep, userSalt.length);
  const derived = scrypt(new TextEncoder().encode(password), salt, { N: 2 ** p.memCost, r: p.rounds, p: 1, dkLen: 32 });
  const key = await crypto.subtle.importKey('raw', derived, 'AES-CTR', false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter: new Uint8Array(16), length: 128 }, key, b64(p.signerKey)));
}

/** Plain base64 hash of `password`, as Firebase would store it (used by tests and by the migration's emulator rehearsal). */
export const firebaseScryptHash = async (password: string, saltB64: string, p: FirebaseScryptParams) => toB64(await firebaseHash(password, saltB64, p));

/** `stored` is a `formatFirebaseHash` string. Constant-time comparison; false for anything malformed. */
export async function verifyFirebasePassword(stored: string, password: string, p: FirebaseScryptParams): Promise<boolean> {
  const [hash, salt, ...extra] = stored.slice(FIREBASE_HASH_PREFIX.length).split('$');
  if (!stored.startsWith(FIREBASE_HASH_PREFIX) || !hash || !salt || extra.length) return false;
  try {
    const expected = b64(hash), actual = await firebaseHash(password, salt, p);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
    return diff === 0;
  } catch {
    return false; // not valid base64, etc.
  }
}

export interface FirebaseScryptEnv {
  FIREBASE_SCRYPT_SIGNER_KEY?: string;
  FIREBASE_SCRYPT_SALT_SEPARATOR?: string;
  FIREBASE_SCRYPT_ROUNDS?: string;
  FIREBASE_SCRYPT_MEM_COST?: string;
}

/** null when the project parameters are not configured: Firebase-hashed users then simply cannot sign in until they are. */
export const firebaseParamsFromEnv = (env: FirebaseScryptEnv): FirebaseScryptParams | null =>
  env.FIREBASE_SCRYPT_SIGNER_KEY && env.FIREBASE_SCRYPT_SALT_SEPARATOR
    ? {
        signerKey: env.FIREBASE_SCRYPT_SIGNER_KEY,
        saltSeparator: env.FIREBASE_SCRYPT_SALT_SEPARATOR,
        rounds: Number(env.FIREBASE_SCRYPT_ROUNDS ?? 8),
        memCost: Number(env.FIREBASE_SCRYPT_MEM_COST ?? 14),
      }
    : null;
