import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "work/e2e-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5184",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"],
      // Use full Chromium's current headless implementation, not headless shell.
      channel: "chromium", launchOptions: {
      args: ["--enable-webgl", "--ignore-gpu-blocklist",
        // Explicit opt-in for isolated local/CI tests on machines without a GPU.
        ...(process.env.PLAYWRIGHT_SOFTWARE_GL === "1"
          ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
          : []),
      ],
    } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "PORT=5184 GUIDE_ENABLED=false npm start",
    url: "http://127.0.0.1:5184/api/health",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
