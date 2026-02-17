import prisma from './prisma'

export async function getEvent(eventId: string) {
  return await prisma.event.findFirst({
    where: { id: eventId },
    include: {
      carClasses: true,
      races: {
        orderBy: { startTime: 'asc' as const },
        include: {
          registrations: {
            include: {
              user: {
                include: {
                  racerStats: true,
                },
              },
              carClass: true,
              team: true,
              manualDriver: true,
            },
          },
        },
      },
    },
  })
}
