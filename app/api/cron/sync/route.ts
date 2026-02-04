import { NextRequest, NextResponse } from 'next/server'
import { runIRacingSync } from '@/lib/services/sync-service'
import { SyncSource } from '@prisma/client'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  console.log('[Cron] Starting automated iRacing synchronization...')
  const result = await runIRacingSync(SyncSource.CRON)

  if (result.success) {
    return NextResponse.json({
      message: 'Synchronization successful',
      eventsCount: result.eventsCount,
      carClassesCount: result.carClassesCount,
      usersCount: result.usersCount,
    })
  } else {
    return NextResponse.json(
      {
        message: 'Synchronization failed',
        error: result.error,
      },
      { status: 500 }
    )
  }
}
