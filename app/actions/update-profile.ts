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

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        iracingCustomerId: customerId,
        iracingName: customerId ? undefined : null,
      },
      select: {
        id: true,
        name: true,
        image: true,
        iracingCustomerId: true,
        iracingName: true,
        expectationsVersion: true,
        onboardedAnnounced: true,
      },
    })

    // Notify of onboarding completion if this was the last step and hasn't been announced
    if (updatedUser.iracingCustomerId && !updatedUser.onboardedAnnounced) {
      try {
        // Attempt to mark as announced atomically to prevent race conditions
        const result = await prisma.user.updateMany({
          where: {
            id: session.user.id,
            onboardedAnnounced: false, // Ensure it hasn't been marked yet
          },
          data: { onboardedAnnounced: true },
        })

        if (result.count > 0) {
          const { sendOnboardingNotification } = await import('@/lib/discord')
          const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

          await sendOnboardingNotification({
            userName: updatedUser.name || 'Unknown User',
            userAvatarUrl: updatedUser.image || undefined,
            iracingCustomerId: updatedUser.iracingCustomerId,
            iracingName: updatedUser.iracingName || undefined,
            profileUrl: `${baseUrl}/roster`,
          })
        }
      } catch (notifyError) {
        console.error('Failed to send onboarding notification:', notifyError)
      }
    }

    revalidatePath('/profile')
    revalidatePath('/roster')
    return { success: true }
  } catch (error) {
    console.error('Update profile error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update profile'
    return { success: false, error: message }
  }
}
