import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Driver id required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        racerStats: {
          select: {
            category: true,
            categoryId: true,
            irating: true,
            safetyRating: true,
            groupName: true,
          },
        },
      },
    })

    if (user) {
      return NextResponse.json({
        id: user.id,
        type: 'user' as const,
        name: user.name,
        image: user.image || `https://api.dicebear.com/9.x/avataaars/png?seed=${user.name}`,
        racerStats: user.racerStats,
      })
    }

    const manualDriver = await prisma.manualDriver.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        irating: true,
      },
    })

    if (manualDriver) {
      return NextResponse.json({
        id: manualDriver.id,
        type: 'manual' as const,
        name: manualDriver.name,
        image: manualDriver.image,
        irating: manualDriver.irating,
      })
    }

    return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
  } catch (error) {
    console.error('Failed to fetch driver details:', error)
    return NextResponse.json({ error: 'Failed to fetch driver details' }, { status: 500 })
  }
}
