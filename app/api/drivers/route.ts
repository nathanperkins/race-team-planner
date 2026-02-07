import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const [users, manualDrivers] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          image: true,
        },
      }),
      prisma.manualDriver.findMany({
        select: {
          id: true,
          name: true,
          image: true,
        },
      }),
    ])

    const drivers = [
      ...users.map((u) => ({
        id: u.id,
        name: u.name,
        image: u.image || `https://api.dicebear.com/9.x/avataaars/png?seed=${u.name}`,
      })),
      ...manualDrivers.map((d) => ({
        id: d.id,
        name: d.name,
        image: d.image,
      })),
    ].sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    return NextResponse.json(drivers)
  } catch (error) {
    console.error('Failed to fetch drivers:', error)
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 })
  }
}
