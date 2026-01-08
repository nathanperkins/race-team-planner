
'use server'

import { fetchSpecialEvents } from '@/lib/iracing';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function syncIRacingEvents() {
  try {
    const externalEvents = await fetchSpecialEvents();

    for (const event of externalEvents) {
      await prisma.event.upsert({
        where: { externalId: event.externalId },
        update: {
          name: event.name,
          startTime: new Date(event.startTime),
          track: event.track,
          description: event.description,
        },
        create: {
          externalId: event.externalId,
          name: event.name,
          startTime: new Date(event.startTime),
          track: event.track,
          description: event.description,
        }
      });
    }

    revalidatePath('/dashboard');
    return { success: true, count: externalEvents.length };
  } catch (error: any) {
    console.error('SERVER ACTION ERROR: Failed to sync events:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred during sync'
    };
  }
}
