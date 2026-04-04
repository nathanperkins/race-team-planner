import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RosterPage from './page'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('next/link', () => ({
  default: (props: any) => <a href={props.href}>{props.children}</a>,
}))

vi.mock('next/image', () => ({
  default: (props: any) => <img src={props.src} alt={props.alt} />,
}))

vi.mock('@/components/UserRoleBadge', () => ({
  default: () => <span data-testid="user-role-badge" />,
}))

vi.mock('@/components/CompletedEventsButton', () => ({
  default: () => <button data-testid="completed-events-button" />,
}))

vi.mock('./RosterSortControls', () => ({
  default: () => <div data-testid="roster-sort-controls" />,
}))

describe('RosterPage', () => {
  it('displays iRacing customer ID when present', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    } as any)

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'u1',
        name: 'Sim Racer',
        role: 'USER',
        iracingCustomerId: 123456,
        racerStats: [],
        registrations: [],
        teams: [],
      },
    ] as any)

    const jsx = await RosterPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByText('123456')).toBeInTheDocument()
    expect(screen.getByTitle('iRacing Customer ID')).toBeInTheDocument()
  })

  it('does not display iRacing customer ID when missing', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    } as any)

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'u2',
        name: 'Another Racer',
        role: 'USER',
        iracingCustomerId: null,
        racerStats: [],
        registrations: [],
        teams: [],
      },
    ] as any)

    const jsx = await RosterPage({ searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.queryByTitle('iRacing Customer ID')).not.toBeInTheDocument()
  })

  it('displays iRacing customer ID in list view', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    } as any)

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'u1',
        name: 'Sim Racer',
        role: 'USER',
        iracingCustomerId: 654321,
        racerStats: [],
        registrations: [],
        teams: [],
      },
    ] as any)

    const jsx = await RosterPage({ searchParams: Promise.resolve({ view: 'list' }) })
    render(jsx)

    expect(screen.getAllByText('654321').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('iRacing Customer ID').length).toBeGreaterThan(0)
  })
})
