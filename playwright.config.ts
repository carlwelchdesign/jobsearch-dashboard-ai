import { defineConfig, devices } from "playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";
const localBrowserChannel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && next start -p 3210",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], ...(localBrowserChannel ? { channel: localBrowserChannel } : {}) },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], ...(localBrowserChannel ? { channel: localBrowserChannel } : {}) },
    },
  ],
});
