import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { globalSetup: ['./test/globalSetup.ts'], include: ['src/**/*.test.ts'], testTimeout: 60_000, // long: remote databases (Neon) add network latency
    fileParallelism: false } });
