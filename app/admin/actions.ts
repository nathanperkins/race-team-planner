'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

interface State {
  message: string
}

export async function createCustomEvent(prevState: State, formData: FormData): Promise<State> {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return { message: 'Unauthorized. Admin access required.' }
    }

    const name = formData.get('name') as string
    const track = formData.get('track') as string
    const trackConfig = formData.get('trackConfig') as string
    const description = formData.get('description') as string
    const startTime = formData.get('startTime') as string
    const durationMins = formData.get('durationMins') as string
    const licenseGroup = formData.get('licenseGroup') as string
    const tempValue = formData.get('tempValue') as string
    const tempUnits = formData.get('tempUnits') as string
    const relHumidity = formData.get('relHumidity') as string
    const skies = formData.get('skies') as string
    const precipChance = formData.get('precipChance') as string

    if (!name || !track || !startTime) {
      return { message: 'Name, track, and start time are required.' }
    }

    const startDate = new Date(startTime)

    if (isNaN(startDate.getTime())) {
      return { message: 'Invalid date format.' }
    }

    // Calculate end time based on duration (default to 1 hour if not provided)
    const duration = durationMins ? parseInt(durationMins) : 60
    const endDate = new Date(startDate.getTime() + duration * 60000)

    // Create the event with a single race
    await prisma.event.create({
      data: {
        name,
        track,
        trackConfig: trackConfig || null,
        description: description || null,
        startTime: startDate,
        endTime: endDate,
        durationMins: durationMins ? parseInt(durationMins) : null,
        licenseGroup: licenseGroup ? parseInt(licenseGroup) : null,
        tempValue: tempValue ? parseInt(tempValue) : null,
        tempUnits: tempUnits ? parseInt(tempUnits) : null,
        relHumidity: relHumidity ? parseInt(relHumidity) : null,
        skies: skies ? parseInt(skies) : null,
        precipChance: precipChance ? parseInt(precipChance) : null,
        races: {
          create: {
            startTime: startDate,
            endTime: endDate,
          },
        },
      },
    })

    revalidatePath('/events')
    revalidatePath('/admin')

    return { message: 'Success' }
  } catch (error) {
    console.error('Error creating custom event:', error)
    return { message: 'Failed to create event. Please try again.' }
  }
}
