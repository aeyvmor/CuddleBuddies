import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Load local, git-ignored settings (TEST_DATABASE_URL) when present; the db global setup
// fails loudly if the variable is still missing.
if (existsSync(".env")) process.loadEnvFile(".env");

// Two projects:
// - unit: pure tests, no external services.
// - db:   integration tests against a real local PostGIS database (TEST_DATABASE_URL).
//         Run `npm run db:up` first. The global setup recreates the test database and
//         applies every migration, so each run starts from a fresh schema.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/test/**/*.test.ts", "services/*/test/**/*.test.ts", "infra/aws/test/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
          // First CDK synth in a fresh worker can take >5s on slow/synced disks.
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "db",
          include: ["database/test/**/*.db.test.ts", "services/*/test/**/*.db.test.ts"],
          globalSetup: ["database/test/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
