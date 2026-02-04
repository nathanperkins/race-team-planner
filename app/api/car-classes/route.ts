import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const carClasses = await prisma.carClass.findMany({
      select: {
        id: true,
        name: true,
        shortName: true,
      },
      orderBy: {
        shortName: 'asc',
      },
    })

    return Response.json(carClasses)
  } catch (error) {
    console.error('Error fetching car classes:', error)
    return Response.json({ error: 'Failed to fetch car classes' }, { status: 500 })
  }
}
