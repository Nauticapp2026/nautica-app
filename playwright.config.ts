import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3000',
    // Basic Auth gate
    httpCredentials: {
      username: process.env.PRELAUNCH_GATE_USER ?? '',
      password: process.env.PRELAUNCH_GATE_PASSWORD ?? '',
    },
    // Sesión guardada por global-setup
    storageState: 'e2e/.auth/session.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  globalSetup: './e2e/global-setup.ts',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
