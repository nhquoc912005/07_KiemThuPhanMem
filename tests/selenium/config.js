const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const reportsDir = path.join(rootDir, 'reports');

module.exports = {
  rootDir,
  backendDir: path.join(rootDir, 'backend'),
  frontendDir: path.join(rootDir, 'frontend'),
  reportsDir,
  screenshotsDir: path.join(reportsDir, 'screenshots'),
  frontendBaseUrl: process.env.SELENIUM_FRONTEND_URL || process.env.QA_FRONTEND_BASE_URL || 'http://127.0.0.1:3000',
  apiBaseUrl: process.env.SELENIUM_API_BASE_URL || process.env.QA_API_BASE_URL || 'http://127.0.0.1:5000/api/v1',
  backendHealthUrl: process.env.SELENIUM_BACKEND_HEALTH_URL || 'http://127.0.0.1:5000/health',
  browser: String(process.env.SELENIUM_BROWSER || 'edge').toLowerCase(),
  headless: process.env.SELENIUM_HEADLESS !== 'false',
  defaultTimeoutMs: Number(process.env.SELENIUM_TIMEOUT_MS || 15000),
  reportXlsxPath: path.join(reportsDir, 'selenium_test_report.xlsx'),
  reportCsvPath: path.join(reportsDir, 'selenium_test_report.csv'),
  summaryPath: path.join(reportsDir, 'selenium_test_summary.md')
};
