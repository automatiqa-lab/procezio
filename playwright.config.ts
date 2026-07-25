import { defineConfig, devices } from '@playwright/test'

// E2E smoke tests run against the real production build served by `vite preview`, so they
// exercise the shipped bundle - code-split chunks, strict CSP and all - exactly as an adopter
// would load it from static hosting. Chromium only: the File System Access story is
// Chromium-first (see the browser-support matrix in the README), and the smoke path here does
// not touch it. The webServer builds then previews; Playwright waits for the port.
//
// Fast local loop: keep `pnpm --filter @procezio/app run preview` running in another
// terminal between runs - reuseExistingServer (any non-CI run) sees the live port and
// skips the full rebuild, so `pnpm e2e` re-runs in seconds. Rebuild the app yourself
// when the source changes; the reused server serves whatever dist/ holds.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'corepack pnpm --filter @procezio/app run build && corepack pnpm --filter @procezio/app run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
