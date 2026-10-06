import {
  centsToInputString,
  formatDate,
  formatMoney,
  formatMonth,
  formatPercent,
  formatSignedMoney,
  parseMoneyToCents,
} from './format';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('formats es with grouping even for 4-digit numbers', () => {
    expect(plain(formatMoney(120000, 'es'))).toBe('1.200,00 €');
    expect(plain(formatMoney(1500, 'es'))).toBe('15,00 €');
  });
  it('formats en', () => {
    expect(plain(formatMoney(120000, 'en'))).toBe('€1,200.00');
  });
  it('supports compact (no decimals) and signed output', () => {
    expect(plain(formatMoney(120000, 'es', { compact: true }))).toBe('1.200 €');
    expect(plain(formatSignedMoney(3840, 'es'))).toBe('+38,40 €');
    expect(plain(formatSignedMoney(-12000, 'es'))).toBe('-120,00 €');
  });
});

describe('parseMoneyToCents', () => {
  it.each([
    ['1.200,50', 'es', 120050],
    ['1200,5', 'es', 120050],
    ['1.200', 'es', 120000],
    ['12.5', 'es', 1250],
    ['15', 'es', 1500],
    ['€ 15', 'es', 1500],
    ['1,200.50', 'en', 120050],
    ['1,200', 'en', 120000],
    ['0,05', 'es', 5],
    ['-3,20', 'es', -320],
  ] as const)('parses %s (%s)', (input, locale, expected) => {
    expect(parseMoneyToCents(input, locale)).toBe(expected);
  });
  it('returns null for empty or invalid input', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents(',')).toBeNull();
  });
  it('round-trips with centsToInputString', () => {
    expect(centsToInputString(120050, 'es')).toBe('1200,50');
    expect(parseMoneyToCents(centsToInputString(120050, 'es'), 'es')).toBe(120050);
    expect(centsToInputString(5, 'en')).toBe('0.05');
  });
});

describe('dates and percent', () => {
  it('formats months and dates in Spanish', () => {
    expect(formatMonth('2026-03', 'es')).toBe('marzo de 2026');
    expect(formatMonth('2026-03', 'en')).toBe('March 2026');
    expect(formatDate('2026-03-05', 'es', 'long')).toBe('5 de marzo de 2026');
  });
  it('formats percentages', () => {
    expect(plain(formatPercent(0.1234, 'es'))).toBe('12,3 %');
  });
});

describe('without Intl.NumberFormat.prototype.formatToParts (Hermes on iOS)', () => {
  it('still detects separators and parses/edits money', () => {
    const proto = Intl.NumberFormat.prototype as unknown as { formatToParts?: unknown };
    const original = proto.formatToParts;
    proto.formatToParts = undefined;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const f = require('./format') as typeof import('./format');
        expect(f.centsToInputString(120050, 'es')).toBe('1200,50');
        expect(f.centsToInputString(120050, 'en')).toBe('1200.50');
        expect(f.centsToInputString(120050, 'fr')).toBe('1200,50');
        expect(f.parseMoneyToCents('1.200,50', 'es')).toBe(120050);
        expect(f.parseMoneyToCents('1,200.50', 'en')).toBe(120050);
        expect(f.parseMoneyToCents('12,5', 'fr')).toBe(1250);
      });
    } finally {
      proto.formatToParts = original;
    }
  });
});
