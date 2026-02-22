import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Vitest configuration for integration tests.
 *
 * Integration tests run against a real PostgreSQL database (DATABASE_URL_TEST).
 * They are kept separate from unit tests so that:
 *   - Unit tests remain fast and require no external services
 *   - Integration tests can be run locally with docker-compose and in CI with a postgres service
 *
 * Run with: npm run test:integration
 */
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.integration.setup.ts',
    include: ['**/*.integration.test.ts'],
    env: {
      TZ: 'America/Los_Angeles',
    },
    // Vite automatically loads .env.test in test mode, so DATABASE_URL_TEST
    // and other vars from that file are available in test files.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
