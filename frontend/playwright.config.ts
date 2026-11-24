import { defineConfig, devices } from '@playwright/test'

const databasePath = `/tmp/linjian-frontend-e2e-${process.pid}.sqlite`

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4187', trace: 'retain-on-failure' },
  webServer: [
    {
      command: `rm -f ${databasePath} && DATABASE_PATH=${databasePath} npm --prefix ../backend run db:init && DATABASE_PATH=${databasePath} OWNER_EMAIL=test@test.test OWNER_PASSWORD=test npm --prefix ../backend run owner:init && DATABASE_PATH=${databasePath} npm --prefix ../backend run db:seed && DATABASE_PATH=${databasePath} UPLOAD_DIR=memory OWNER_EMAIL=test@test.test OWNER_PASSWORD=test PORT=3000 FRONTEND_ORIGIN=http://127.0.0.1:4187 npm --prefix ../backend run dev`,
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
