import { getRandomBytes } from 'expo-crypto';

/** No 0/O/1/I/L to avoid confusion when typing codes by hand. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/** Uppercases and strips everything that is not part of the alphabet (dashes, spaces, lookalikes). */
export function normalizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => INVITE_ALPHABET.includes(c))
    .join('')
    .slice(0, INVITE_CODE_LENGTH);
}

/** `K7QXM2PD` → `K7QX-M2PD` (partial input is formatted too, for live typing). */
export function formatInviteCode(input: string): string {
  const code = normalizeInviteCode(input);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isValidInviteCode(input: string): boolean {
  return normalizeInviteCode(input).length === INVITE_CODE_LENGTH;
}

export function generateInviteCode(
  randomBytes: (n: number) => Uint8Array = getRandomBytes,
): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++)
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  return out;
}
