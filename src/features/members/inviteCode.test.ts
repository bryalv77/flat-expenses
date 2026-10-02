import {
  formatInviteCode,
  generateInviteCode,
  INVITE_ALPHABET,
  isValidInviteCode,
  normalizeInviteCode,
} from './inviteCode';

describe('inviteCode', () => {
  it('normalizes case, dashes and spaces', () => {
    expect(normalizeInviteCode(' k7qx-m2pd ')).toBe('K7QXM2PD');
  });
  it('drops ambiguous characters and truncates', () => {
    expect(normalizeInviteCode('0O1IL-ABCDEFGHJ')).toBe('ABCDEFGH');
  });
  it('formats with a dash after 4 chars', () => {
    expect(formatInviteCode('k7qxm2pd')).toBe('K7QX-M2PD');
    expect(formatInviteCode('k7q')).toBe('K7Q');
  });
  it('validates length', () => {
    expect(isValidInviteCode('K7QX-M2PD')).toBe(true);
    expect(isValidInviteCode('K7QX')).toBe(false);
  });
  it('generates valid codes from the alphabet', () => {
    const code = generateInviteCode(
      (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i * 37)),
    );
    expect(code).toHaveLength(8);
    expect([...code].every((c) => INVITE_ALPHABET.includes(c))).toBe(true);
    expect(isValidInviteCode(code)).toBe(true);
  });
});
