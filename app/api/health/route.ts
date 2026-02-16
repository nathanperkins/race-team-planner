import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api-health')

export async function GET() {
  try {
    // Check database connection by querying for a non-existent record or just connecting
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed')
    return NextResponse.json(
      { status: 'error', database: 'disconnected', error: String(error) },
      { status: 500 }
    )
  }
}
