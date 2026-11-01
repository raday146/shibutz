import { defineConfig, devices } from '@playwright/test';

// The console must work in current Chrome, Safari and Firefox (DESIGN.md, Web platform support), so every check runs on all three engines.
// E2E_PORT lets a worktree run beside another dev server on 5173 (an existing server is reused, so it would test the wrong code).
const port = process.env.E2E_PORT ?? '5173';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  // The specs mock the API in the browser, so only the dev server is needed.
  webServer: { command: `pnpm dev --port ${port} --strictPort`, url: `http://localhost:${port}`, reuseExistingServer: true },
});
