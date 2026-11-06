import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, 'migrations')),
          BETTER_AUTH_URL: 'http://api.test',
          BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0123',
          SIGNING_SECRET: 'test-signing',
          ADMIN_SECRET: 'test-admin',
          ENVIRONMENT: 'development',
        },
      },
    })),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
