// Only used by `@better-auth/cli generate` to emit src/db/auth-schema.ts. Not bundled into the Worker.
import { createAuth } from './src/auth';
import type { Db } from './src/db/client';

export const auth = createAuth({} as Db, { BUCKET: {} as R2Bucket, BETTER_AUTH_SECRET: 'cli-only-secret-0123456789abcdef0123', BETTER_AUTH_URL: 'http://localhost:8787' });
