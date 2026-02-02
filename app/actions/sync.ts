'use server'

import { auth } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { runIRacingSync, syncUserStats } from '@/lib/services/sync-service'
import { SyncSource } from '@prisma/client'

/**
 * Triggers a global iRacing synchronization (events and all drivers).
 * Restricted to ADMIN role.
 */
export async function syncGlobalDataAction() {
  const session = await auth()
  if (session?.user?.role !== UserRole.ADMIN) {
    return { success: false, error: 'Unauthorized: Admin role required' }
  }

  return runIRacingSync(SyncSource.MANUAL)
}

/**
 * Syncs iRacing stats for the currently authenticated user.
 */
export async function syncCurrentUserAction() {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const result = await syncUserStats(session.user.id)
    return result
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('SERVER ACTION ERROR: Failed to sync user stats:', error)
    return {
      success: false,
      error: message,
    }
  }
}
