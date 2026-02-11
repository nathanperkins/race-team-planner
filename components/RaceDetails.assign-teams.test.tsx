import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import RaceDetails from './RaceDetails'
import React from 'react'

vi.mock('@/app/actions', () => ({
  saveRaceEdits: vi.fn(),
}))

vi.mock('./DropRegistrationButton', () => ({
  default: (props: { registrationId: string; onConfirmDrop?: () => Promise<void> | void }) => (
    <button
      data-testid={`drop-registration-button-${props.registrationId}`}
      onClick={() => {
        void props.onConfirmDrop?.()
      }}
    >
      Drop
    </button>
  ),
}))
vi.mock('./QuickRegistration', () => ({
  default: () => <div data-testid="quick-registration" />,
}))
vi.mock('./EditableCarClass', () => ({
  default: () => <div data-testid="editable-car-class" />,
}))
vi.mock('./AdminDriverSearch', () => ({
  default: (props: {
    allDrivers?: Array<{ id: string; name: string | null; image: string | null }>
    onSelectDriver?: (driver: { id: string; name: string | null; image: string | null }) => void
  }) => (
    <button
      data-testid={props.onSelectDriver ? 'admin-driver-search-select' : 'admin-driver-search'}
      onClick={() => {
        const fallback = { id: 'mock-driver', name: 'Mock Driver', image: null }
        props.onSelectDriver?.(props.allDrivers?.[0] ?? fallback)
      }}
    >
      Add Driver
    </button>
  ),
}))
vi.mock('./TeamPickerTrigger', () => ({
  default: (props: { onOpen: () => void }) => (
    <button data-testid="team-picker-trigger" onClick={props.onOpen}>
      Pick Teams
    </button>
  ),
}))
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => <img {...props} alt={props.alt} />,
}))

describe('RaceDetails Assign Teams', () => {
  it('can register then drop a driver in assign teams modal', async () => {
    const mockRace = {
      id: 'race-assign-1',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-existing',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'existing-user',
          user: {
            name: 'Existing Driver',
            image: null,
            racerStats: [],
          },
          manualDriver: null,
          teamId: 'team-1',
          team: { id: 'team-1', name: 'Team 1' },
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'new-user',
        type: 'user',
        name: 'New Driver',
        image: null,
        racerStats: [
          {
            category: 'Sports Car',
            categoryId: 5,
            irating: 5000,
            safetyRating: 4.99,
            groupName: 'Class A',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <RaceDetails
        race={mockRace}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 1 }]}
        allDrivers={[{ id: 'new-user', name: 'New Driver', image: null }]}
      />
    )

    fireEvent.click(screen.getByTestId('team-picker-trigger'))
    const unlockButton = screen.queryByTitle('Unlock team')
    if (unlockButton) {
      fireEvent.click(unlockButton)
    }
    fireEvent.click(await screen.findByTestId('admin-driver-search-select'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('/api/drivers/new-user')
    })

    expect((await screen.findAllByText('New Driver')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('A 4.99 5000')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Existing Driver').length).toBeGreaterThan(0)

    const unassignButton =
      (await screen.findAllByText('New Driver'))
        .map((node) => node.closest('[draggable]'))
        .filter((node): node is HTMLElement => !!node)
        .map((row) => row.querySelector('button[title="Move to unassigned"]'))
        .find((button): button is HTMLButtonElement => !!button) ?? null
    expect(unassignButton).toBeTruthy()
    fireEvent.click(unassignButton!)

    await waitFor(() => {
      expect(screen.getAllByTestId(/drop-registration-button-temp-reg-/).length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByTestId(/drop-registration-button-temp-reg-/)[0]!)

    await waitFor(() => {
      expect(screen.queryByText('A 4.99 5000')).not.toBeInTheDocument()
    })

    vi.unstubAllGlobals()
  })

  it('rebalances across max/team 1 through 8 with class separation and team create/drop', async () => {
    const mockRace = {
      id: 'race-assign-2',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 3,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-a1',
          carClass: { id: 'class-a', name: 'Class A', shortName: 'A' },
          userId: 'a1',
          user: { name: 'A-Driver1', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-1',
          team: { id: 'team-1', name: 'Team 1' },
        },
        {
          id: 'reg-a2',
          carClass: { id: 'class-a', name: 'Class A', shortName: 'A' },
          userId: 'a2',
          user: { name: 'A-Driver2', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-a3',
          carClass: { id: 'class-a', name: 'Class A', shortName: 'A' },
          userId: 'a3',
          user: { name: 'A-Driver3', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-a4',
          carClass: { id: 'class-a', name: 'Class A', shortName: 'A' },
          userId: 'a4',
          user: { name: 'A-Driver4', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-b1',
          carClass: { id: 'class-b', name: 'Class B', shortName: 'B' },
          userId: 'b1',
          user: { name: 'B-Driver1', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-b2',
          carClass: { id: 'class-b', name: 'Class B', shortName: 'B' },
          userId: 'b2',
          user: { name: 'B-Driver2', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-b3',
          carClass: { id: 'class-b', name: 'Class B', shortName: 'B' },
          userId: 'b3',
          user: { name: 'B-Driver3', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-b4',
          carClass: { id: 'class-b', name: 'Class B', shortName: 'B' },
          userId: 'b4',
          user: { name: 'B-Driver4', image: null, racerStats: [] },
          manualDriver: null,
          teamId: null,
          team: null,
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'a-new',
        type: 'user',
        name: 'A-New',
        image: null,
        racerStats: [
          {
            category: 'Sports Car',
            categoryId: 5,
            irating: 4100,
            safetyRating: 4.11,
            groupName: 'Class A',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    render(
      <RaceDetails
        race={mockRace}
        userId="admin-user"
        isAdmin
        carClasses={[
          { id: 'class-a', name: 'Class A', shortName: 'A' },
          { id: 'class-b', name: 'Class B', shortName: 'B' },
        ]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 0 }]}
        allDrivers={[{ id: 'a-new', name: 'A-New', image: null }]}
      />
    )

    fireEvent.click(screen.getByTestId('team-picker-trigger'))
    const unlockButton = screen.queryByTitle('Unlock team')
    if (unlockButton) {
      fireEvent.click(unlockButton)
    }
    fireEvent.click(await screen.findByTestId('admin-driver-search-select'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/drivers/a-new')
      expect(screen.getAllByText('A-New').length).toBeGreaterThan(0)
    })

    const expectedTeamCount = (maxPerTeam: number) =>
      Math.ceil(5 / maxPerTeam) + Math.ceil(4 / maxPerTeam)

    const getTeamTiles = () => {
      const modal = document.querySelector('div[class*="teamModal_"]') as HTMLElement | null
      expect(modal).toBeTruthy()
      const tiles = Array.from(modal!.querySelectorAll('div[class*="teamGroup_"]')) as HTMLElement[]
      return tiles.filter((tile) => {
        const text = tile.textContent || ''
        return /Team\s+\d+/.test(text) && !text.includes('Add Team')
      })
    }

    for (let maxPerTeam = 1; maxPerTeam <= 8; maxPerTeam += 1) {
      const modal = document.querySelector('div[class*="teamModal_"]') as HTMLElement
      const maxInput = modal.querySelector('input[type="number"]') as HTMLInputElement | null
      expect(maxInput).toBeTruthy()
      fireEvent.change(maxInput!, { target: { value: String(maxPerTeam) } })
      fireEvent.click(screen.getByRole('button', { name: 'Form/Rebalance Teams' }))

      await waitFor(() => {
        const teamTiles = getTeamTiles()
        expect(teamTiles.length).toBe(expectedTeamCount(maxPerTeam))
        teamTiles.forEach((tile) => {
          const rows = tile.querySelectorAll('div[class*="driverRow_"]')
          expect(rows.length).toBeLessThanOrEqual(maxPerTeam)

          const text = tile.textContent || ''
          const hasA = /A-Driver|A-New/.test(text)
          const hasB = /B-Driver/.test(text)
          expect(hasA && hasB).toBe(false)
        })
      })
    }

    vi.unstubAllGlobals()
  })

  it('splits an oversized same-class team when max/team is set to 1', async () => {
    const mockRace = {
      id: 'race-assign-3',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 3,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-bob',
          carClass: { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          userId: 'user-bob',
          user: { name: 'Mock Bob (Builder)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-red',
          team: { id: 'team-red', name: 'SimRacersGroup - Titanium' },
        },
        {
          id: 'reg-david',
          carClass: { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          userId: 'user-david',
          user: { name: 'Mock David (Expert)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-red',
          team: { id: 'team-red', name: 'SimRacersGroup - Titanium' },
        },
        {
          id: 'reg-emma',
          carClass: { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          userId: 'user-emma',
          user: { name: 'Mock Emma (Steady)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-blue',
          team: { id: 'team-blue', name: 'SimRacersGroup - Cobalt' },
        },
        {
          id: 'reg-charlie',
          carClass: { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          userId: 'user-charlie',
          user: { name: 'Mock Charlie (Tester)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-gold',
          team: { id: 'team-gold', name: 'SimRacersGroup - Gold' },
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    render(
      <RaceDetails
        race={mockRace}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' }]}
        teams={[
          { id: 'team-red', name: 'SimRacersGroup - Titanium', iracingTeamId: null, memberCount: 0 },
          { id: 'team-blue', name: 'SimRacersGroup - Cobalt', iracingTeamId: null, memberCount: 0 },
          { id: 'team-gold', name: 'SimRacersGroup - Gold', iracingTeamId: null, memberCount: 0 },
          { id: 'team-carbon', name: 'SimRacersGroup - Carbon', iracingTeamId: null, memberCount: 0 },
        ]}
        allDrivers={[]}
      />
    )

    fireEvent.click(screen.getByTestId('team-picker-trigger'))

    const modal = document.querySelector('div[class*="teamModal_"]') as HTMLElement | null
    expect(modal).toBeTruthy()
    const maxInput = modal!.querySelector('input[type="number"]') as HTMLInputElement | null
    expect(maxInput).toBeTruthy()

    fireEvent.change(maxInput!, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Form/Rebalance Teams' }))

    await waitFor(() => {
      const teamTiles = Array.from(
        modal!.querySelectorAll('div[class*="teamGroup_"]')
      ) as HTMLElement[]
      const realTeamTiles = teamTiles.filter((tile) => {
        const text = tile.textContent || ''
        return text.includes('SimRacersGroup') && !text.includes('Add Team')
      })
      expect(realTeamTiles.length).toBeGreaterThanOrEqual(4)
      realTeamTiles.forEach((tile) => {
        const rows = tile.querySelectorAll('div[class*="driverRow_"]')
        expect(rows.length).toBeLessThanOrEqual(1)
      })
    })

    const bobTile = (await screen.findAllByText('Mock Bob (Builder)'))[0]?.closest(
      'div[class*="teamGroup_"]'
    ) as HTMLElement | null
    expect(bobTile).toBeTruthy()
    expect(bobTile?.textContent).not.toContain('Mock David (Expert)')
  })

  it('does not reuse the same seed team across two car classes during rebalance', async () => {
    const mockRace = {
      id: 'race-assign-4',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 3,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-toyota-1',
          carClass: { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          userId: 'user-bob',
          user: { name: 'Mock Bob (Builder)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-red',
          team: { id: 'team-red', name: 'SimRacersGroup - Titanium' },
        },
        {
          id: 'reg-mx5-1',
          carClass: { id: 'class-mx5', name: 'Mazda MX-5 Cup 2016', shortName: 'MX5 Cup 2016' },
          userId: 'user-steven',
          user: { name: 'Steven Case1', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-red',
          team: { id: 'team-red', name: 'SimRacersGroup - Titanium' },
        },
        {
          id: 'reg-toyota-2',
          carClass: { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          userId: 'user-david',
          user: { name: 'Mock David (Expert)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-blue',
          team: { id: 'team-blue', name: 'SimRacersGroup - Cobalt' },
        },
        {
          id: 'reg-mx5-2',
          carClass: { id: 'class-mx5', name: 'Mazda MX-5 Cup 2016', shortName: 'MX5 Cup 2016' },
          userId: 'user-henry',
          user: { name: 'Mock Henry (Casual)', image: null, racerStats: [] },
          manualDriver: null,
          teamId: 'team-pixidust',
          team: { id: 'team-pixidust', name: 'Team Pixidust' },
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    render(
      <RaceDetails
        race={mockRace}
        userId="admin-user"
        isAdmin
        carClasses={[
          { id: 'class-gr86', name: 'Toyota GR86', shortName: 'Toyota GR86' },
          { id: 'class-mx5', name: 'Mazda MX-5 Cup 2016', shortName: 'MX5 Cup 2016' },
        ]}
        teams={[
          { id: 'team-red', name: 'SimRacersGroup - Titanium', iracingTeamId: null, memberCount: 0 },
          { id: 'team-blue', name: 'SimRacersGroup - Cobalt', iracingTeamId: null, memberCount: 0 },
          { id: 'team-gold', name: 'SimRacersGroup - Gold', iracingTeamId: null, memberCount: 0 },
          { id: 'team-carbon', name: 'SimRacersGroup - Carbon', iracingTeamId: null, memberCount: 0 },
          { id: 'team-pixidust', name: 'Team Pixidust', iracingTeamId: null, memberCount: 0 },
        ]}
        allDrivers={[]}
      />
    )

    fireEvent.click(screen.getByTestId('team-picker-trigger'))
    const modal = document.querySelector('div[class*="teamModal_"]') as HTMLElement | null
    expect(modal).toBeTruthy()
    const maxInput = modal!.querySelector('input[type="number"]') as HTMLInputElement | null
    expect(maxInput).toBeTruthy()

    fireEvent.change(maxInput!, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Form/Rebalance Teams' }))

    await waitFor(() => {
      const teamTiles = Array.from(
        modal!.querySelectorAll('div[class*="teamGroup_"]')
      ) as HTMLElement[]
      const realTeamTiles = teamTiles.filter((tile) => {
        const text = tile.textContent || ''
        return (
          (text.includes('SimRacersGroup') || text.includes('Team Pixidust')) &&
          !text.includes('Add Team')
        )
      })
      realTeamTiles.forEach((tile) => {
        const text = tile.textContent || ''
        const hasToyota = text.includes('Toyota GR86')
        const hasMx5 = text.includes('MX5 Cup 2016')
        expect(hasToyota && hasMx5).toBe(false)
      })
    })
  })
})
