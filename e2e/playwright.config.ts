import { defineConfig } from '@playwright/test';

/**
 * Сквозные проверки звонков в личных сообщениях.
 *
 * Тесты работают «чёрным ящиком»: два отдельных браузера — два человека со
 * своими микрофонами, — вход через форму, звонок через кнопки сайта, а то,
 * что человек слышит и видит, измеряется по тому, что реально играет на его
 * странице. Внутреннее устройство приложения тестам неизвестно.
 *
 * Нужен запущенный стенд: `npm run dev` (сайт на https://localhost:5173,
 * сервер на :3001) и база. Адреса меняются переменными VELLIN_SITE и
 * VELLIN_API. Длительность проверки стабильности — CALL_SOAK_SEC.
 */
export default defineConfig({
  testDir: './tests',
  // Каждый звонок — два браузера с настоящим WebRTC; параллельно они
  // мешали бы друг другу и делили процессор, искажая проверку звука.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  outputDir: 'results',
  globalSetup: './support/global-setup.ts',
  globalTeardown: './support/global-teardown.ts',
  use: {
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
  },
});
