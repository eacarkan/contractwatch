import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    port: PORT,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
