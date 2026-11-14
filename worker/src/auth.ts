import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';

import { deleteAccountData } from './account';
import type { Db } from './db/client';
import * as schema from './db/schema';

export interface AuthEnv {
  BUCKET: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

/** Better Auth instance (issue #7 §4b). Email + password first; Google/Apple and email sending come next. */
export const createAuth = (db: Db, env: AuthEnv) =>
  betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: true },
    user: {
      // POST /api/auth/delete-user {password}: Better Auth verifies the password, we clean up, then it deletes user + sessions.
      deleteUser: { enabled: true, beforeDelete: (u) => deleteAccountData(db, env.BUCKET, u.id) },
      additionalFields: {
        locale: { type: 'string', required: false },
        accountRole: { type: 'string', required: false, defaultValue: 'USER', input: false },
        photoKey: { type: 'string', required: false },
      },
    },
    plugins: [bearer()], // the Expo client sends the session token as a Bearer header
    trustedOrigins: ['costospiso://', 'https://costos-piso.web.app'],
  });
export type Auth = ReturnType<typeof createAuth>;
