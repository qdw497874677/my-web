import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

function chromiumExecutable() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override) return override === "bundled" ? undefined : override;
  const names = process.platform === "win32" ? ["chromium.exe"] : ["chromium", "chromium-browser"];
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        accessSync(candidate, constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* Not an executable in this PATH entry. */
      }
    }
  }
}

const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  // Keep optional Google Fonts offline in tests without changing the production page.
  use: {
    baseURL: "http://127.0.0.1:4187",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath,
      args: [
        "--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND",
      ],
    },
  },
  webServer: [
    {
      command: "node ./e2e-server.mjs backend",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    { command: "node ./e2e-server.mjs frontend", port: 4187, reuseExistingServer: false },
  ],
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
});
