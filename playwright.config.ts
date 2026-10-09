import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-сценарий против живого стенда: backend (BACKEND_URL) + собранный frontend.
 * Запуск: npm run build && npm run e2e  (backend должен быть запущен отдельно).
 * PW_CHANNEL=msedge|chrome — использовать установленный браузер вместо скачанного Chromium.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "ru-RU",
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
