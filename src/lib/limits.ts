/** Limits shared by the local backend and the Firestore client; keep in sync with worker/src/* and firestore.rules. */
/** Hard cap on documents returned by any list query (cost guard). */
export const MAX_LIST = 2000;
/** Max amount of a bill or payment, in cents. */
export const MAX_AMOUNT_CENTS = 9_999_999;
/** Max for configuration amounts (expected/fixed/individual contributions), in cents. */
export const MAX_CONFIG_CENTS = 10_000_000;
export const MAX_NOTES = 1000;
export const MAX_MEMBERS_LIST = 100;
export const MAX_CATEGORIES_LIST = 200;
