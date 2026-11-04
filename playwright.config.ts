import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 35000,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: {
    command: 'npm run build:review && npm run build && node scripts/serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
