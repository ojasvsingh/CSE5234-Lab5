import { defineConfig, devices } from '@playwright/test';
import { testDatabaseEnv } from './tests/fixtures/database.js';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
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
      ...testDatabaseEnv,
      INVENTORY_PORT: '4311', ORDER_PORT: '4312', PAYMENT_PORT: '4313', SHIPPING_PORT: '4314', WEB_PORT: '4173',
      INVENTORY_SERVICE_URL: 'http://127.0.0.1:4311',
      ORDER_SERVICE_URL: 'http://127.0.0.1:4312',
      PAYMENT_SERVICE_URL: 'http://127.0.0.1:4313',
      SHIPPING_SERVICE_URL: 'http://127.0.0.1:4314',
      PAYMENT_DB_NAME: 'adventure_payment_test',
      SHIPPING_DB_NAME: 'adventure_shipping_test',
      STORE_BUSINESS_ID: 'AB-STORE-1001',
      VITE_INVENTORY_API_URL: '', VITE_ORDER_API_URL: '',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
