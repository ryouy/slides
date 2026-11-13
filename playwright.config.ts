import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // tiles glide for ~0.25 s and Playwright waits for them to settle before every click, so solving takes a while
  timeout: 120_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:5173', timezoneId: 'Asia/Tokyo', locale: 'en-US' },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
