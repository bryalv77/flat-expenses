/** Cross-field rules openapi.yaml cannot express, shared by the local backend and the Worker. Must stay import-free. */

/** A FIXED category needs an expected amount. */
export const fixedNeedsAmount = (v: { amountType?: string; expectedAmountCents?: number | null }): boolean =>
  v.amountType !== 'FIXED' || v.expectedAmountCents != null;

/** Names are stored trimmed; the schema only guarantees they are not blank. */
export const trimmed = (s: string): string => s.trim();
export const trimmedNames = (names: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.trim()]));

/** The generator drops `propertyNames` and `maxProperties`: language codes and at most 12 languages. */
export const namesAreValid = (v: { names?: Record<string, string> | null }): boolean =>
  !v.names || (Object.keys(v.names).length <= 12 && Object.keys(v.names).every((k) => /^[a-z]{2,3}$/.test(k)));
