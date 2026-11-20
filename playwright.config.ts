import { defineConfig, devices } from '@playwright/test';

const PORT = 8099;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', locale: 'en-US' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The dev server cannot bundle expo-sqlite's web worker, so test the static export (what ships to Hosting).
  webServer: {
    command: `CI=1 npx expo export --platform web --output-dir .e2e-dist && node e2e/serve.mjs .e2e-dist ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI, // locally: rebuild by stopping the old server first
    timeout: 300_000,
  },
});
