import { defineConfig } from '@hey-api/openapi-ts';

// `pnpm gen:api`: openapi.yaml is the source of truth. The app and the Worker are separate packages with their own
// zod install, so each gets its own generated copy (the Worker's has no client).
export default defineConfig([
  {
    input: 'openapi.yaml',
    output: { path: 'src/lib/api/generated', clean: true },
    plugins: [
      '@hey-api/typescript',
      { name: 'zod', compatibilityVersion: 4 },
      { name: '@hey-api/sdk', validator: false },
      '@hey-api/client-fetch',
    ],
  },
  {
    input: 'openapi.yaml',
    output: { path: 'worker/src/generated', clean: true },
    plugins: ['@hey-api/typescript', { name: 'zod', compatibilityVersion: 4 }],
  },
]);
