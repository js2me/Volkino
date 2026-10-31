const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:32199', viewport: { width: 1920, height: 1080 } },
  webServer: [{
    command: 'node server/index.js',
    url: 'http://127.0.0.1:32199',
    env: { PORT: '32199', HOST: '127.0.0.1', TW_CONFIG: 'work/browser-tests/config.json' },
  }, {
    command: 'npm run dev:mock -- --port 32200 --strictPort',
    url: 'http://127.0.0.1:32200',
  }],
});
