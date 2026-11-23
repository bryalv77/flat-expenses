// Constants shared by more than one file. Limits come from the app's src/lib/limits.ts so both sides always agree.
import { INVITE_ALPHABET, INVITE_CODE_LENGTH } from '../../src/lib/limits';

export { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, INVITE_ALPHABET, INVITE_CODE_LENGTH, MAX_AMOUNT_CENTS as MAX_CENTS, MAX_AVATAR_BYTES, MAX_CONFIG_CENTS, MAX_FILE_BYTES, MAX_LIST } from '../../src/lib/limits';

/** Hosted web app (production domain; the workers.dev address lets a deploy be checked before the domain is attached). The native app's scheme is a trusted origin only, not a CORS one. */
export const WEB_ORIGINS = ['https://app-cuota.devalv.com', 'https://costos-piso.bryalv77.workers.dev'];
/** Expo web dev server: only when the Worker itself runs locally, so a page on someone's localhost:8081 can never call production. */
export const devWebOrigins = (env: { BETTER_AUTH_URL: string }) => (env.BETTER_AUTH_URL.startsWith('http://localhost') ? ['http://localhost:8081', 'http://localhost:19006'] : []);

/** Codes the app generates (alphabet: no I, L, O, 0, 1). */
export const INVITE_CODE = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);
/** Redeeming is deliberately looser than INVITE_CODE (accepts I, L, O): a mistyped code answers 404 invalid_code, not 400. Do not unify without changing that response. */
export const REDEEM_CODE = new RegExp(`^[A-Z2-9]{${INVITE_CODE_LENGTH}}$`);
export const GUEST_ID = /^guest_[0-9a-f]{32}$/;
