'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const RegistrationSchema = z.object({
  raceId: z.string(),
  carClassId: z.string().min(1, 'Car class is required'),
})

type State = {
  message: string
  errors?: Record<string, string[]>
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

    revalidatePath(`/events/${race.eventId}`)
    return { message: 'Success' }
  } catch (e) {
    console.error('Registration error:', e)
    return { message: 'Failed to register. You might be already registered for this race.' }
  }
}

export async function deleteRegistration(
  registrationId: string,
  returnPath?: string
): Promise<void> {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error('Not authenticated')
  }

  if (!registrationId) {
    throw new Error('Registration ID required')
  }

  try {
    const registration = await prisma.registration.findFirst({
      where: {
        id: registrationId,
        userId: session.user.id,
      },
      select: {
        id: true,
        race: {
          select: { endTime: true, eventId: true },
        },
      },
    })

    if (!registration) {
      // Nothing to delete because there is no registration associated with the user.
      return
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
    revalidatePath(`/users/${session.user.id}/signups`)
    if (returnPath) {
      redirect(returnPath)
    }
    return
  } catch (e) {
    console.error('Delete registration error:', e)
    throw new Error('Failed to delete registration')
  }
}

import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

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
  revalidatePath('/expectations')
  revalidatePath('/events/[id]', 'page') // Revalidate all event pages to potentially unlock signup
}
