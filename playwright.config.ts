import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  workers: 2, // the home canvas is heavy; more workers starve frames and flake timing tests
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4321 --ignore-lock',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
