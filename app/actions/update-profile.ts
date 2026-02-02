'use server'

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { syncUserStats } from '@/lib/services/sync-service'

export async function updateProfile(formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { success: false, error: 'Not authenticated' }
  }

  const customerId = (formData.get('customerId') as string)?.trim() || null

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { iracingCustomerId: true },
    })

    // If changing the ID and it's not null, try to sync first to validate it
    if (customerId && customerId !== user?.iracingCustomerId) {
      const syncResult = await syncUserStats(session.user.id, customerId)
      if (!syncResult.success) {
        return { success: false, error: 'Failed to validate iRacing Customer ID.' }
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        iracingCustomerId: customerId,
      },
    })

    revalidatePath('/profile')
    revalidatePath('/roster')
    return { success: true }
  } catch (error) {
    console.error('Update profile error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update profile'
    return { success: false, error: message }
  }
}
