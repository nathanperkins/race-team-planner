'use server'

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('delete-account')

export async function deleteAccount() {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    await prisma.user.delete({
      where: { id: session.user.id },
    })

    return { success: true }
  } catch (error) {
    logger.error({ err: error }, 'Delete account error')
    return { success: false, error: 'Failed to delete account' }
  }
}
