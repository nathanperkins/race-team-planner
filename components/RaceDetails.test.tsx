import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import RaceDetails from './RaceDetails'
import React from 'react'
import styles from './RaceDetails.module.css'

// Mock app/actions to avoid importing server-only modules
vi.mock('@/app/actions', () => ({
  saveRaceEdits: vi.fn(),
}))

// Mock sub-components to isolate the test
vi.mock('./DropRegistrationButton', () => ({
  default: () => <div data-testid="drop-registration-button" />,
}))
vi.mock('./QuickRegistration', () => ({
  default: () => <div data-testid="quick-registration" />,
}))
vi.mock('./EditableCarClass', () => ({
  default: () => <div data-testid="editable-car-class" />,
}))
vi.mock('./AdminDriverSearch', () => ({
  default: () => <div data-testid="admin-driver-search" />,
}))
vi.mock('./TeamPickerTrigger', () => ({
  default: () => <div data-testid="team-picker-trigger" />,
}))
vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => <img {...props} alt={props.alt} />,
}))

describe('RaceDetails', () => {
  it('should not show a separator line when there are unassigned drivers but no teams', () => {
    // Reproduce a bug where an extra separator line for the teams section was
    // shown between the title and unassigned drivers list, even though there
    // are no teams.

    const mockRace = {
      id: 'race-1',
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-1',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-1',
          user: {
            name: 'User 1',
            image: null,
            racerStats: [],
          },
          manualDriver: null,
          teamId: null,
          team: null,
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    const { container } = render(
      <RaceDetails
        race={mockRace}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    const separators = container.getElementsByClassName(styles.teamGridSeparatorStandalone)
    expect(separators.length).toBe(0)
  })

  it('should show a separator line when there are teams assigned and unassigned drivers', () => {
    const mockRace = {
      id: 'race-2',
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-1',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-1',
          user: {
            name: 'User 1',
            image: null,
            racerStats: [],
          },
          manualDriver: null,
          teamId: 'team-1',
          team: { id: 'team-1', name: 'Team 1' },
        },
        {
          id: 'reg-2',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-2',
          user: {
            name: 'User 2',
            image: null,
            racerStats: [],
          },
          manualDriver: null,
          teamId: null,
          team: null,
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    const { container } = render(
      <RaceDetails
        race={mockRace}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 1 }]}
        allDrivers={[]}
      />
    )

    const separators = container.getElementsByClassName(styles.teamGridSeparatorStandalone)
    expect(separators.length).toBe(1)
  })
})
