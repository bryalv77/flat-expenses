/** Timezone-safe calendar date helpers. Dates are `YYYY-MM-DD` strings; months are `YYYY-MM`. */

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseISODate(iso: string): YMD {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export function toISODate({ y, m, d }: YMD): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Days since 1970-01-01 for a civil date (UTC-free, DST-free). */
export function toDayNumber(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): string {
  const dt = new Date(n * 86_400_000);
  return toISODate({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Adds months to the anchor, clamping the day to the target month's length (no drift: always pass the anchor). */
export function addMonthsClamped(iso: string, months: number): string {
  const { y, m, d } = parseISODate(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISODate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function monthEnd(key: string): string {
  const { y, m } = parseISODate(`${key.slice(0, 7)}-01`);
  return toISODate({ y, m, d: daysInMonth(y, m) });
}

export function addMonthsToKey(key: string, n: number): string {
  return monthKey(addMonthsClamped(monthStart(key), n));
}

/** Inclusive list of month keys between two keys. */
export function monthRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let k = fromKey;
  while (k <= toKey) {
    out.push(k);
    k = addMonthsToKey(k, 1);
  }
  return out;
}

/** Number of whole months from key a to key b (b - a). */
export function monthDiff(a: string, b: string): number {
  const pa = parseISODate(`${a}-01`);
  const pb = parseISODate(`${b}-01`);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

export function monthOfYear(iso: string): number {
  return parseISODate(iso).m;
}

/** Local today as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return toISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}
