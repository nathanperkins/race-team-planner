import { PrismaClient } from '@prisma/client'

const testDatabaseUrl = process.env.DATABASE_URL_TEST

if (!testDatabaseUrl) {
  throw new Error(
    'DATABASE_URL_TEST is not set. ' +
      'Set it to a test database URL, e.g. postgresql://postgres:password@localhost:5432/race-team-planner-test'
  )
}

/**
 * Creates a PrismaClient connected to the test database.
 * The test database URL comes from DATABASE_URL_TEST.
 */
export function createTestPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: testDatabaseUrl } },
    log: [],
  })
}

/**
 * Truncates all user-defined tables in the test database.
 * Call this in beforeEach to start each test with a clean slate.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma%'
  `
  if (tables.length === 0) return
  const tableList = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`)
}
