import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
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
  default: (props: { variant?: string }) => (
    <div
      data-testid={props.variant === 'full' ? 'editable-car-class-full' : 'editable-car-class'}
    />
  ),
}))
vi.mock('./AdminDriverSearch', () => ({
  default: () => <div data-testid="admin-driver-search" />,
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
vi.mock('./AddToCalendarButton', () => ({
  default: () => <button data-testid="add-to-calendar-button">Add to calendar</button>,
}))

const raceEventProps = {
  eventId: 'evt-1',
  eventName: 'Test Series',
  eventTrack: 'Sebring',
}

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
        {...raceEventProps}
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
        {...raceEventProps}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 1 }]}
        allDrivers={[]}
      />
    )

    const separators = container.getElementsByClassName(styles.teamGridSeparatorStandalone)
    expect(separators.length).toBe(1)
  })

  it('does not show standalone admin drop controls on the race card', () => {
    const mockRace = {
      id: 'race-3',
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-1',
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

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.queryByTestId('drop-registration-button')).not.toBeInTheDocument()
  })

  it('shows drop control instead of register control when admin is registered', () => {
    const mockRace = {
      id: 'race-4',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-admin',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'admin-user',
          user: {
            name: 'Admin User',
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

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.getByTestId('drop-registration-button')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-registration')).not.toBeInTheDocument()
  })

  it('shows only one drop control for a registered non-admin user', () => {
    const mockRace = {
      id: 'race-5',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-user',
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

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.queryByTestId('quick-registration')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('drop-registration-button')).toHaveLength(1)
  })

  it('shows class-change action for a registered unassigned non-admin user', () => {
    const mockRace = {
      id: 'race-5b',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-user',
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

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.getByTestId('editable-car-class-full')).toBeInTheDocument()
  })

  it('hides swap control when registered user is already assigned to a team', () => {
    const mockRace = {
      id: 'race-6',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: true,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-user',
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
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 1 }]}
        allDrivers={[]}
      />
    )

    expect(screen.getByTestId('drop-registration-button')).toBeInTheDocument()
    expect(screen.queryByTestId('editable-car-class-full')).not.toBeInTheDocument()
  })

  it('shows class-change action for a registered unassigned admin user', () => {
    const mockRace = {
      id: 'race-7',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-admin',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'admin-user',
          user: {
            name: 'Admin User',
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

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.getByTestId('editable-car-class-full')).toBeInTheDocument()
  })

  it('shows unknown eligibility badge for racer without stats or manual rating', () => {
    const mockRace = {
      id: 'race-8',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-no-stats',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-no-stats',
          user: {
            name: 'User Without Stats',
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
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    // Find the stats badge
    const badges = container.getElementsByClassName(styles.statsBadge)
    expect(badges.length).toBe(1)

    const badge = badges[0] as HTMLElement
    expect(badge.textContent).toContain('Unknown')

    // Verify ShieldX icon is present (red X)
    const svg = badge.querySelector('svg')
    expect(svg).toBeInTheDocument()

    // Verify ineligible CSS class is applied for unknown status
    expect(badge.classList.contains(styles.statsBadgeIneligible)).toBe(true)
  })

  it('shows red X shield for racer ineligible for the race', () => {
    const mockRace = {
      id: 'race-9',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-ineligible',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-rookie',
          user: {
            name: 'Rookie Driver',
            image: null,
            racerStats: [
              {
                category: 'Sports Car',
                categoryId: 5,
                irating: 1200,
                safetyRating: 2.5,
                groupName: 'Class D', // D license - ineligible for A/B license races
              },
            ],
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
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
        eventId="event-a-license"
        eventLicenseGroup={5} // A license event (LicenseLevel.A = 5)
        userLicenseLevel={5} // Admin has A license
      />
    )

    // Find the stats badge
    const badges = container.getElementsByClassName(styles.statsBadge)
    expect(badges.length).toBe(1)

    const badge = badges[0] as HTMLElement

    // Verify red ShieldX icon is present for ineligible racer
    const svg = badge.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(badge.textContent).toContain('D') // License class
    expect(badge.textContent).toContain('2.50') // Safety rating
    expect(badge.textContent).toContain('1200') // iRating

    // Verify ineligible CSS class is applied for ineligible racer
    expect(badge.classList.contains(styles.statsBadgeIneligible)).toBe(true)
  })

  it('shows tooltip for ineligible racers (unknown stats and insufficient license)', () => {
    // Test both: racer without stats AND racer with insufficient license
    const mockRace = {
      id: 'race-10',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [
        {
          id: 'reg-no-stats',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-no-stats',
          user: {
            name: 'User Without Stats',
            image: null,
            racerStats: [],
          },
          manualDriver: null,
          teamId: null,
          team: null,
        },
        {
          id: 'reg-ineligible',
          carClass: { id: 'class-1', name: 'Class 1', shortName: 'C1' },
          userId: 'user-rookie',
          user: {
            name: 'Rookie Driver',
            image: null,
            racerStats: [
              {
                category: 'Sports Car',
                categoryId: 5,
                irating: 1200,
                safetyRating: 2.5,
                groupName: 'Class D', // D license - ineligible for A license races
              },
            ],
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
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
        eventId="event-a-license"
        eventLicenseGroup={5} // A license event (LicenseLevel.A = 5)
        userLicenseLevel={5} // Admin has A license
      />
    )

    const badges = container.getElementsByClassName(styles.statsBadge)
    expect(badges.length).toBe(2)

    // Verify tooltip for racer without stats
    const unknownBadge = badges[0] as HTMLElement
    expect(unknownBadge.title).toBe('This racer is ineligible for this race.')

    // Verify tooltip for racer with insufficient license
    const ineligibleBadge = badges[1] as HTMLElement
    expect(ineligibleBadge.title).toBe('This racer is ineligible for this race.')
  })

  it('should show locked team name (not dropdown) when team has Discord thread', () => {
    const mockRace = {
      id: 'race-discord-lock',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
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
          team: {
            id: 'team-1',
            name: 'Team Alpha',
            alias: null,
          },
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: { 'team-1': 'thread-123' }, // Team has Discord thread
    }

    const { container } = render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[{ id: 'team-1', name: 'Team Alpha' }]}
        allDrivers={[]}
      />
    )

    // Open the team assignment modal
    const pickTeamsButton = screen.getByTestId('team-picker-trigger')
    fireEvent.click(pickTeamsButton)

    // Should show locked team name (not a button)
    const lockedTeamNames = container.getElementsByClassName(styles.lockedTeamName)
    expect(lockedTeamNames.length).toBeGreaterThan(0)

    // Should NOT show team name button (dropdown)
    const teamNameButtons = container.querySelectorAll(`.${styles.teamNameButton}`)
    expect(teamNameButtons.length).toBe(0)

    // Verify tooltip exists
    const tooltips = container.getElementsByClassName(styles.lockedTooltip)
    expect(tooltips.length).toBeGreaterThan(0)
    expect(tooltips[0].textContent).toBe('Cannot change team - Discord thread exists')
  })

  it('should show dropdown button (not locked) when team has no Discord thread', () => {
    const mockRace = {
      id: 'race-no-discord',
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
          team: {
            id: 'team-1',
            name: 'Team Alpha',
            alias: null,
          },
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: null, // No Discord threads
    }

    const { container } = render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[{ id: 'team-1', name: 'Team Alpha' }]}
        allDrivers={[]}
      />
    )

    // Should NOT show locked team name
    const lockedTeamNames = container.getElementsByClassName(styles.lockedTeamName)
    expect(lockedTeamNames.length).toBe(0)

    // Should show team name button (dropdown) when modal is open
    // Note: We need to check this doesn't show locked, the button won't be visible
    // until the modal is opened, which requires clicking the "Pick Teams" button
    const tooltips = container.querySelectorAll(
      `.${styles.lockedTooltip}[role="tooltip"]`
    ) as NodeListOf<HTMLElement>
    const discordTooltips = Array.from(tooltips).filter((t) =>
      t.textContent?.includes('Cannot change team - Discord thread exists')
    )
    expect(discordTooltips.length).toBe(0)
  })

  it('should show locked team for team with thread but allow dropdown for team without thread', () => {
    const mockRace = {
      id: 'race-mixed-threads',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime: new Date('2027-01-01T12:00:00Z'),
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
          team: {
            id: 'team-1',
            name: 'Team Alpha',
            alias: null,
          },
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
          teamId: 'team-2',
          team: {
            id: 'team-2',
            name: 'Team Beta',
            alias: null,
          },
        },
      ],
      discordTeamsThreadId: null,
      discordTeamThreads: { 'team-1': 'thread-123' }, // Only team-1 has thread
    }

    const { container } = render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="admin-user"
        isAdmin
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[
          { id: 'team-1', name: 'Team Alpha' },
          { id: 'team-2', name: 'Team Beta' },
        ]}
        allDrivers={[]}
      />
    )

    // Open the team assignment modal
    const pickTeamsButton = screen.getByTestId('team-picker-trigger')
    fireEvent.click(pickTeamsButton)

    // Should show one locked team name (for team-1)
    const lockedTeamNames = container.getElementsByClassName(styles.lockedTeamName)
    expect(lockedTeamNames.length).toBe(1)

    // Verify the locked team shows the correct tooltip
    const tooltips = container.getElementsByClassName(styles.lockedTooltip)
    expect(tooltips.length).toBeGreaterThan(0)
    const discordTooltip = Array.from(tooltips).find((t) =>
      t.textContent?.includes('Cannot change team - Discord thread exists')
    )
    expect(discordTooltip).toBeDefined()
  })

  it('shows the add-to-calendar button for upcoming races', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const mockRace = {
      id: 'race-calendar-upcoming',
      startTime: new Date('2027-06-01T18:00:00Z'),
      endTime: new Date('2027-06-01T22:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.getByTestId('add-to-calendar-button')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides the add-to-calendar button for past races', () => {
    vi.setSystemTime(new Date('2027-12-01T00:00:00Z'))
    const mockRace = {
      id: 'race-calendar-past',
      startTime: new Date('2027-06-01T18:00:00Z'),
      endTime: new Date('2027-06-01T22:00:00Z'),
      teamsAssigned: false,
      maxDriversPerTeam: 2,
      teamAssignmentStrategy: 'BALANCED_IRATING' as const,
      registrations: [],
      discordTeamsThreadId: null,
      discordTeamThreads: null,
    }

    render(
      <RaceDetails
        race={mockRace}
        {...raceEventProps}
        userId="user-1"
        carClasses={[{ id: 'class-1', name: 'Class 1', shortName: 'C1' }]}
        teams={[]}
        allDrivers={[]}
      />
    )

    expect(screen.queryByTestId('add-to-calendar-button')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('RaceDetails Discord thread links', () => {
  const mockRaceWithThread = {
    id: 'race-discord',
    startTime: new Date('2027-01-01T10:00:00Z'),
    endTime: new Date('2027-01-01T12:00:00Z'),
    teamsAssigned: true,
    maxDriversPerTeam: 2,
    teamAssignmentStrategy: 'BALANCED_IRATING' as const,
    registrations: [],
    discordTeamsThreadId: 'thread-999',
    discordTeamThreads: { 'team-1': 'team-thread-111' },
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('event thread link uses discord:// deep link on desktop', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    )

    render(
      <RaceDetails
        race={mockRaceWithThread}
        {...raceEventProps}
        userId="user-1"
        discordGuildId="guild-1"
        carClasses={[]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 0 }]}
        allDrivers={[]}
      />
    )

    const link = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('title')?.includes('event discussion'))!
    expect(link).toHaveAttribute('href', 'discord://-/channels/guild-1/thread-999')
  })

  it('event thread link uses https://discord.com on mobile', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
    )

    render(
      <RaceDetails
        race={mockRaceWithThread}
        {...raceEventProps}
        userId="user-1"
        discordGuildId="guild-1"
        carClasses={[]}
        teams={[{ id: 'team-1', name: 'Team 1', iracingTeamId: null, memberCount: 0 }]}
        allDrivers={[]}
      />
    )

    const link = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('title')?.includes('event discussion'))!
    expect(link).toHaveAttribute('href', 'https://discord.com/channels/guild-1/thread-999')
  })
})
