import { defineConfig } from "@playwright/test";

const PORT = 5179;
export default defineConfig({
  testDir: "tests/scanner",
  timeout: 120_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: [
    { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/tests/scanner/harness.html`, reuseExistingServer: true },
    // The built app, as GitHub Pages serves it (with the service worker), for tests/scanner/offline.spec.js.
    { command: `npx vite build && npx vite preview --port 5180 --strictPort`, url: "http://localhost:5180/", reuseExistingServer: false },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
