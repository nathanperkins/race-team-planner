'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

const RegistrationSchema = z.object({
  raceId: z.string(),
  carClassId: z.string().min(1, 'Car class is required'),
})

type State = {
  message: string
  errors?: Record<string, string[]>
  timestamp?: number
}

export async function registerForRace(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized' }
  }

  // Check race exists and is not completed
  const requestedRaceId = formData.get('raceId') as string
  if (!requestedRaceId) return { message: 'Race ID required' }

  const race = await prisma.race.findUnique({
    where: { id: requestedRaceId },
    select: { endTime: true, eventId: true },
  })

  if (!race) return { message: 'Race not found' }
  if (new Date() > race.endTime) {
    return { message: 'Usage of time machine detected! This race has already finished.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { expectationsVersion: true },
  })

  if (!user || (user.expectationsVersion ?? 0) < CURRENT_EXPECTATIONS_VERSION) {
    return { message: 'You must agree to the team expectations before signing up.' }
  }

  const validatedFields = RegistrationSchema.safeParse({
    raceId: formData.get('raceId'),
    carClassId: formData.get('carClassId'),
  })

  if (!validatedFields.success) {
    return { message: 'Invalid fields', errors: validatedFields.error.flatten().fieldErrors }
  }

  const { raceId, carClassId } = validatedFields.data

  try {
    await prisma.registration.create({
      data: {
        userId: session.user.id,
        raceId,
        carClassId,
      },
    })

    // Send Discord notification (non-blocking)
    try {
      const registrationData = await prisma.registration.findFirst({
        where: {
          userId: session.user.id,
          raceId,
        },
        include: {
          user: {
            select: {
              name: true,
              image: true,
              accounts: {
                where: { provider: 'discord' },
                select: { providerAccountId: true },
              },
            },
          },
          race: {
            select: {
              startTime: true,
              event: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          carClass: {
            select: {
              name: true,
            },
          },
        },
      })

      if (registrationData) {
        const { sendRegistrationNotification } = await import('@/lib/discord')
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

        const discordAccount = registrationData.user.accounts[0]

        await sendRegistrationNotification({
          userName: registrationData.user.name || 'Unknown User',
          userAvatarUrl: registrationData.user.image || undefined,
          eventName: registrationData.race.event.name,
          raceStartTime: registrationData.race.startTime,
          carClassName: registrationData.carClass.name,
          eventUrl: `${baseUrl}/events?eventId=${registrationData.race.event.id}`,
          discordUser: discordAccount?.providerAccountId
            ? {
                id: discordAccount.providerAccountId,
                name: registrationData.user.name || 'Unknown',
              }
            : undefined,
        })
      }
    } catch (notificationError) {
      // Log but don't fail the registration if notification fails
      console.error('Failed to send Discord notification:', notificationError)
    }

    revalidatePath(`/events/${race.eventId}`)
    return { message: 'Success' }
  } catch (e) {
    console.error('Registration error:', e)
    return { message: 'Failed to register. You might be already registered for this race.' }
  }
}

export async function deleteRegistration(registrationId: string): Promise<void> {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error('Not authenticated')
  }

  if (!registrationId) {
    throw new Error('Registration ID required')
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: {
        id: registrationId,
      },
      select: {
        id: true,
        userId: true,
        race: {
          select: { endTime: true, eventId: true },
        },
      },
    })

    if (!registration) {
      // Nothing to delete because there is no registration associated with the user.
      return
    }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized to delete this registration')
    }

    if (registration.race && new Date() > registration.race.endTime) {
      throw new Error('Cannot drop from a completed race')
    }

    await prisma.registration.delete({
      where: {
        id: registrationId,
      },
    })

    if (registration.race?.eventId) {
      revalidatePath(`/events/${registration.race.eventId}`)
    }
    revalidatePath(`/users/${registration.userId}/registrations`)
  } catch (e) {
    console.error('Delete registration error:', e)
    throw new Error('Failed to delete registration')
  }

  // Redirecting throws a NEXT_REDIRECT error which appears as a failure to the
  // client component so we rely on revalidatePath to update the UI on the
  // client.
}

export async function updateRegistrationCarClass(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized', timestamp: Date.now() }
  }

  const registrationId = formData.get('registrationId') as string
  const carClassId = formData.get('carClassId') as string

  if (!registrationId) {
    return { message: 'Registration ID required', timestamp: Date.now() }
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { race: true },
    })

    if (!registration) return { message: 'Registration not found', timestamp: Date.now() }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      return { message: 'Unauthorized', timestamp: Date.now() }
    }

    if (new Date() > registration.race.endTime) {
      return { message: 'Cannot update a completed race', timestamp: Date.now() }
    }

    // Verify team car class consistency if assigned to a team
    if (registration.teamId) {
      const conflictReg = await prisma.registration.findFirst({
        where: {
          raceId: registration.raceId,
          teamId: registration.teamId,
          id: { not: registrationId },
          carClassId: { not: carClassId },
        },
        include: { carClass: true },
      })

      if (conflictReg) {
        return {
          message: `Team Class Conflict: Your team is already running the ${conflictReg.carClass.name} class in this race. All team members must use the same car class.`,
          timestamp: Date.now(),
        }
      }
    }

    await prisma.registration.update({
      where: { id: registrationId },
      data: { carClassId },
    })

    revalidatePath(`/events/${registration.race.eventId}`)
    revalidatePath(`/users/${registration.userId}/registrations`)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    console.error('Update registration error:', e)
    return { message: 'Failed to update registration', timestamp: Date.now() }
  }
}

export async function updateRegistrationRaceTime(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized', timestamp: Date.now() }
  }

  const registrationId = formData.get('registrationId') as string
  const raceId = formData.get('raceId') as string

  if (!registrationId || !raceId) {
    return { message: 'Registration ID and Race ID required', timestamp: Date.now() }
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { race: true, carClass: true },
    })

    if (!registration) return { message: 'Registration not found', timestamp: Date.now() }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      return { message: 'Unauthorized', timestamp: Date.now() }
    }

    if (new Date() > registration.race.endTime) {
      return { message: 'Cannot update a completed race', timestamp: Date.now() }
    }

    // Verify team car class consistency if moving to a new race and assigned to a team
    if (registration.teamId) {
      const conflictReg = await prisma.registration.findFirst({
        where: {
          raceId: raceId, // the NEW race session
          teamId: registration.teamId,
          id: { not: registrationId },
          carClassId: { not: registration.carClassId },
        },
        include: { carClass: true },
      })

      if (conflictReg) {
        return {
          message: `Team Class Conflict: Your team already has drivers in this session running the ${conflictReg.carClass.name} class. You are registered for the ${registration.carClass.name} class.`,
          timestamp: Date.now(),
        }
      }
    }

    await prisma.registration.update({
      where: { id: registrationId },
      data: { raceId },
    })

    revalidatePath(`/events/${registration.race.eventId}`)
    revalidatePath(`/users/${registration.userId}/registrations`)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    console.error('Update race time error:', e)
    // Handle unique constraint error
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return { message: 'You are already registered for that race session.', timestamp: Date.now() }
    }
    return { message: 'Failed to update race session', timestamp: Date.now() }
  }
}

export async function agreeToExpectations() {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error('Unauthorized')
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { expectationsVersion: CURRENT_EXPECTATIONS_VERSION },
  })

  revalidatePath('/expectations')
  revalidatePath('/profile')
  revalidatePath('/roster')
  revalidatePath('/events/[id]', 'page')

  return { success: true }
}
export async function adminRegisterDriver(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized', timestamp: Date.now() }
  }

  // Admin only
  if (session.user.role !== 'ADMIN') {
    return { message: 'Only admins can use this function', timestamp: Date.now() }
  }

  const raceId = formData.get('raceId') as string
  const userId = formData.get('userId') as string
  const carClassId = formData.get('carClassId') as string

  if (!raceId || !userId || !carClassId) {
    return { message: 'Missing required fields', timestamp: Date.now() }
  }

  try {
    // Check race exists and is not completed
    const race = await prisma.race.findUnique({
      where: { id: raceId },
      select: { endTime: true, eventId: true },
    })

    if (!race) return { message: 'Race not found', timestamp: Date.now() }
    if (new Date() > race.endTime) {
      return { message: 'Cannot register for a completed race', timestamp: Date.now() }
    }

    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) return { message: 'User not found', timestamp: Date.now() }

    // Check if already registered
    const existing = await prisma.registration.findUnique({
      where: { userId_raceId: { userId, raceId } },
    })

    if (existing) {
      return { message: 'User already registered for this race', timestamp: Date.now() }
    }

    // Create registration
    await prisma.registration.create({
      data: {
        userId,
        raceId,
        carClassId,
      },
    })

    revalidatePath(`/events`)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    console.error('Admin register driver error:', e)
    return { message: 'Failed to register driver', timestamp: Date.now() }
  }
}
