import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The tests assume the seeded board, so every run starts the backend on a brand-new database.
const databasePath = path.join(os.tmpdir(), `pm-e2e-${Date.now()}.sqlite3`);
const python = process.platform === "win32" ? "python" : "python3";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: path.join(__dirname, "..", "backend"),
      url: "http://127.0.0.1:8000/api/health",
      env: { PM_DATABASE_PATH: databasePath },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      cwd: __dirname,
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
