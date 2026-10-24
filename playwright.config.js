import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npm run preview:all',
    env: {
      INVENTORY_PORT: '4311', ORDER_PORT: '4312', WEB_PORT: '4173',
      INVENTORY_SERVICE_URL: 'http://127.0.0.1:4311',
      ORDER_SERVICE_URL: 'http://127.0.0.1:4312',
      VITE_INVENTORY_API_URL: '', VITE_ORDER_API_URL: '',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
