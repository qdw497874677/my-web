import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const databasePath = `/tmp/linjian-frontend-e2e-${process.pid}.sqlite`

function chromiumExecutable() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  if (override) return override === 'bundled' ? undefined : override
  const names = process.platform === 'win32' ? ['chromium.exe'] : ['chromium', 'chromium-browser']
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name)
      try {
        accessSync(candidate, constants.X_OK)
        if (statSync(candidate).isFile()) return candidate
      } catch { /* Not an executable in this PATH entry. */ }
    }
  }
}

const executablePath = chromiumExecutable()

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4187', trace: 'retain-on-failure', launchOptions: { executablePath } },
  webServer: [
    {
      command: `rm -f ${databasePath} && DATABASE_PATH=${databasePath} npm --prefix ../backend run db:init && DATABASE_PATH=${databasePath} OWNER_EMAIL=test@test.test OWNER_PASSWORD=test npm --prefix ../backend run owner:init && DATABASE_PATH=${databasePath} npm --prefix ../backend run db:seed && DATABASE_PATH=${databasePath} UPLOAD_DIR=memory OWNER_EMAIL=test@test.test OWNER_PASSWORD=test PORT=3000 FRONTEND_ORIGIN=http://127.0.0.1:4187 npm --prefix ../backend run dev`,
      env: { AI_IMAGES_ENABLED: process.env.AI_IMAGES_LIVE_MODEL_ID ? 'true' : 'false', COOKIE_SECURE: 'false' },
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
    },
    { command: 'VITE_API_PROXY_TARGET=http://127.0.0.1:3000 npm run build && VITE_API_PROXY_TARGET=http://127.0.0.1:3000 npm run preview -- --host 127.0.0.1 --port 4187', port: 4187, reuseExistingServer: false },
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
