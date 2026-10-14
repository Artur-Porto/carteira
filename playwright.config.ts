import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Runs against the production build (npm run e2e builds first), so the CSP and the
// service worker are the ones that ship.
export default defineConfig({
  testDir: 'tests/e2e',
  // One test at a time: on Windows, WebKit runs PBKDF2 on a process the pages share, so a
  // backup in one test stalls clicks in another.
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/carteira/`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit', use: { ...devices['iPhone 16'] } },
    { name: 'chromium', use: { ...devices['Pixel 8'] } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/carteira/`,
    reuseExistingServer: !process.env.CI,
  },
});
