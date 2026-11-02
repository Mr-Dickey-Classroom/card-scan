import { defineConfig } from "@playwright/test";

const PORT = 5179;
export default defineConfig({
  testDir: "tests/scanner",
  timeout: 120_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/tests/scanner/harness.html`, reuseExistingServer: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
