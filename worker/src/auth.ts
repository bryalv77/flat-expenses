import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';

import { deleteAccountData } from './account';
import { WEB_ORIGINS, devWebOrigins } from './config';
import type { Db } from './db/client';
import { resetPasswordEmail, sendEmail, type EmailEnv } from './email';
import * as schema from './db/schema';

interface AuthEnv extends EmailEnv {
  BUCKET: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

/** `waitUntil` keeps the Worker alive for background work (sending the reset email) after the response is sent. */
export const createAuth = (db: Db, env: AuthEnv, waitUntil?: (p: Promise<unknown>) => void) =>
  betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6, // same as the app's forms; Better Auth defaults to 8
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true, // whoever had the old password is signed out everywhere
      // The link goes through the Worker, which validates the token and redirects to `redirectTo?token=…` (a trusted origin).
      sendResetPassword: async ({ user, url }) => {
        const u = user as typeof user & { locale?: string | null };
        await sendEmail(env, resetPasswordEmail(u, url));
      },
    },
    advanced: {
      disableOriginCheck: false, // explicit: Better Auth turns the check off by itself under NODE_ENV=test, hiding it from our tests
      ...(waitUntil && { backgroundTasks: { handler: waitUntil } }),
    },
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
    trustedOrigins: ['costospiso://', ...WEB_ORIGINS, ...devWebOrigins(env)],
  });
