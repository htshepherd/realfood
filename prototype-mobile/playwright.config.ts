import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    ...devices["iPhone 13"],
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  projects: [{ name: "iPhone WebKit", use: { browserName: "webkit" } }],
  webServer: {
    command: "pnpm knowledge:build && IHEALTH_E2E_MODE=1 SESSION_SIGNING_SECRET=local-test-signing-secret-123456789 pnpm exec next dev --webpack -H 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
