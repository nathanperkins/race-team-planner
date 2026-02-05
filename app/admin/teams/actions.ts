'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function getTeams() {
  return await prisma.team.findMany({
    orderBy: { name: 'asc' },
  })
}

export async function createTeam(name: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  if (!name.trim()) {
    throw new Error('Team name is required')
  }

  const team = await prisma.team.create({
    data: { name: name.trim() },
  })

  revalidatePath('/admin')
  return team
}

export async function updateTeam(id: string, name: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  if (!name.trim()) {
    throw new Error('Team name is required')
  }

  const team = await prisma.team.update({
    where: { id },
    data: { name: name.trim() },
  })

  revalidatePath('/admin')
  return team
}

export async function deleteTeam(id: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  // Check if team is in use
  const usageCount = await prisma.registration.count({
    where: { teamId: id },
  })

  if (usageCount > 0) {
    throw new Error(
      `Cannot delete team: It is currently assigned to ${usageCount} registration(s).`
    )
  }

  await prisma.team.delete({
    where: { id },
  })

  revalidatePath('/admin')
}

export async function assignRegistrationToTeam(registrationId: string, teamId: string | null) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  const registration = await prisma.registration.update({
    where: { id: registrationId },
    data: { teamId },
    include: {
      race: {
        select: { eventId: true },
      },
    },
  })

  revalidatePath('/events')
  if (registration.race?.eventId) {
    revalidatePath(`/events?eventId=${registration.race.eventId}`)
  }

  return registration
}
