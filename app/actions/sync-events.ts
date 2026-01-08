
'use server'

import { fetchSpecialEvents } from '@/lib/iracing';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function syncIRacingEvents() {
  try {
    const externalEvents = await fetchSpecialEvents();

    for (const event of externalEvents) {
      // Default end time to 24 hours after start if not provided
      const start = new Date(event.startTime);
      const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

      await prisma.event.upsert({
        where: { externalId: event.externalId },
        update: {
          name: event.name,
          startTime: start,
          endTime: end,
          track: event.track,
          description: event.description,
        },
        create: {
          externalId: event.externalId,
          name: event.name,
          startTime: start,
          endTime: end,
          track: event.track,
          description: event.description,
        }
      });
    }

    revalidatePath('/dashboard');
    return { success: true, count: externalEvents.length };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('SERVER ACTION ERROR: Failed to sync events:', error);
    return {
      success: false,
      error: message
    };
  }
}
