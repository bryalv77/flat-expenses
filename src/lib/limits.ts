/** Limits and formats shared by the app, the local backend and the Worker (worker/src/config.ts imports this file, so it must stay import-free). */
/** Hard cap on documents returned by any list query (cost guard). */
export const MAX_LIST = 2000;
/** Max amount of a bill or payment, in cents. */
export const MAX_AMOUNT_CENTS = 9_999_999;
/** Max for configuration amounts (expected/fixed/individual contributions), in cents. */
export const MAX_CONFIG_CENTS = 10_000_000;
export const MAX_BILL_FILES = 5;
export const MAX_MEMBERS_LIST = 100;
export const MAX_CATEGORIES_LIST = 200;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;
/** No 0/O/1/I/L to avoid confusion when typing codes by hand. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/** Roommates without an account: `guest_` + a dash-less UUID (the `GuestId` schema in openapi.yaml). */
export const newGuestId = (uuid: string): string => `guest_${uuid.replace(/-/g, '')}`;
