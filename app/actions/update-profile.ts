'use server'

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function updateProfile(formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { success: false, error: 'Not authenticated' }
  }

  const customerId = formData.get('customerId') as string

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        iracingCustomerId: customerId || null,
      },
    })

    revalidatePath('/profile')
    return { success: true }
  } catch (error) {
    console.error('Update profile error:', error)
    return { success: false, error: 'Failed to update profile' }
  }
}
