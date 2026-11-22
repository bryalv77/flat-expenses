// Constants shared by more than one file. No imports, so db/schema.ts (also read by drizzle-kit) can use it.

/** Hosted web app (production domain; the workers.dev address lets a deploy be checked before the domain is attached; the Firebase hosts go when the old site is retired, docs/cutover-plan.md). The native app's scheme is a trusted origin only, not a CORS one. */
export const WEB_ORIGINS = ['https://app-cuota.devalv.com', 'https://costos-piso.bryalv77.workers.dev', 'https://costos-piso.web.app', 'https://costos-piso.firebaseapp.com'];
/** Expo web dev server: only when the Worker itself runs locally, so a page on someone's localhost:8081 can never call production. */
export const devWebOrigins = (env: { BETTER_AUTH_URL: string }) => (env.BETTER_AUTH_URL.startsWith('http://localhost') ? ['http://localhost:8081', 'http://localhost:19006'] : []);

export const MAX_LIST = 2000;
export const MAX_CENTS = 9_999_999; // also the bills_amount check in db/schema.ts
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // also the bill_files_size check in db/schema.ts

/** Codes the app generates (inviteCode.ts alphabet: no I, L, O, 0, 1). */
export const INVITE_CODE = /^[A-HJKMNP-Z2-9]{8}$/;
/** Redeeming is deliberately looser than INVITE_CODE (accepts I, L, O): a mistyped code answers 404 invalid_code, not 400. Do not unify without changing that response. */
export const REDEEM_CODE = /^[A-Z2-9]{8}$/;
export const GUEST_ID = /^guest_[0-9a-f]{32}$/;
