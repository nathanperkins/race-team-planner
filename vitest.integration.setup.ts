/**
 * Vitest global setup for integration tests.
 * Runs once before all test files.
 *
 * Requires the db-test service to be running:
 *   docker compose up -d db-test
 *
 * The database is created automatically by the postgres container.
 * This setup only needs to apply any pending migrations.
 */
import { execSync } from 'child_process'
import { config as loadDotenv } from 'dotenv'

export async function setup() {
  // globalSetup runs outside the normal vitest env pipeline, so .env.test isn't loaded yet.
  loadDotenv({ path: '.env.test' })

  const testUrl = process.env.DATABASE_URL_TEST
  if (!testUrl) {
    throw new Error(
      'DATABASE_URL_TEST is not set in .env.test.\n' +
        'Start the test database with: docker compose up -d db-test'
    )
  }

  // Apply all pending migrations to the test database.
  // Both DATABASE_URL and DIRECT_URL must point to the test database:
  // Prisma uses DIRECT_URL for migrations, DATABASE_URL for queries.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
    stdio: 'inherit',
  })
}
