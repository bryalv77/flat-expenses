// Constants shared by more than one file. Limits come from the app's src/lib/limits.ts so both sides always agree.
export { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, INVITE_ALPHABET, INVITE_CODE_LENGTH, MAX_AMOUNT_CENTS, newGuestId, MAX_AVATAR_BYTES, MAX_CATEGORIES_LIST, MAX_FILE_BYTES, MAX_LIST, MAX_MEMBERS_LIST } from '../../src/lib/limits';

/** Hosted web app (production domain; the workers.dev address lets a deploy be checked before the domain is attached). The native app's scheme is a trusted origin only, not a CORS one. */
export const WEB_ORIGINS = ['https://app-cuota.devalv.com', 'https://costos-piso.bryalv77.workers.dev'];
/** Expo web dev server: only when the Worker itself runs locally, so a page on someone's localhost:8081 can never call production. */
export const devWebOrigins = (env: { BETTER_AUTH_URL: string }) => (env.BETTER_AUTH_URL.startsWith('http://localhost') ? ['http://localhost:8081', 'http://localhost:19006'] : []);
