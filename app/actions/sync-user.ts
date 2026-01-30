'use server'

import { fetchDriverStats } from '@/lib/iracing'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function syncCurrentUser() {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    // Check if user has a customer ID set
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { iracingCustomerId: true }
    })

    let memberInfo = null

    if (user?.iracingCustomerId) {
       // Sync using the specific ID
       // Try/Catch for specific fetch in case it fails but fallback isn't appropriate?
       // Actually if ID is set, we SHOULD use it.
       const custIdInt = parseInt(user.iracingCustomerId, 10)
       if (!isNaN(custIdInt)) {
          memberInfo = await fetchDriverStats(custIdInt)
       }
    }


    if (!memberInfo) {
      if (process.env.NODE_ENV === 'development') {
         // Return mock success in dev if no real data
         return { success: true, message: 'Mock sync (no data)' }
      }
      return { success: false, error: 'Failed to fetch member info. Ensure Customer ID is set in Profile.' }
    }

    // Upsert RacerStats
    for (const key in memberInfo.licenses) {
      const lic = memberInfo.licenses[key]

      await prisma.racerStats.upsert({
        where: {
          userId_categoryId: {
            userId: session.user.id,
            categoryId: lic.categoryId,
          },
        },
        update: {
          category: lic.category,
          irating: lic.irating || 0,
          licenseLevel: lic.licenseLevel,
          licenseGroup: lic.groupId,
          safetyRating: lic.safetyRating,
          cpi: lic.cpi,
          ttRating: lic.ttRating,
          mprNumRaces: lic.mprNumRaces,
          color: lic.color,
          groupName: lic.groupName,
        },
        create: {
          userId: session.user.id,
          categoryId: lic.categoryId,
          category: lic.category,
          irating: lic.irating || 0,
          licenseLevel: lic.licenseLevel,
          licenseGroup: lic.groupId,
          safetyRating: lic.safetyRating,
          cpi: lic.cpi,
          ttRating: lic.ttRating,
          mprNumRaces: lic.mprNumRaces,
          color: lic.color,
          groupName: lic.groupName,
        },
      })
    }

    revalidatePath('/roster')
    revalidatePath(`/users/${session.user.id}`)

    return { success: true, count: Object.keys(memberInfo.licenses).length }
  } catch (error) {
    console.error('Error syncing user:', error)
    return { success: false, error: 'Internal server error' }
  }
}
