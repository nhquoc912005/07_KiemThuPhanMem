const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: process.env.QA_FRONTEND_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.QA_BROWSER_PATH ||
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    },
  },
});
