/**
 * Integration tests for the discord notification pipeline.
 *
 * These tests use a real PostgreSQL database (DATABASE_URL_TEST) — no Prisma mocks.
 * fetch is mocked so we never hit the real Discord API, but the message payloads
 * are built from genuine DB data, which makes assertions much more trustworthy.
 *
 * Run with: npm run test:integration
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { createTestPrisma, truncateAll } from './test-db'
import { loadRaceAssignmentData, sendTeamsAssignmentNotificationWithData } from '@/app/actions'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Replace the app's shared prisma client with our test client.
// The getter defers resolution until test execution, after beforeAll runs.
let testPrisma: PrismaClient

vi.mock('@/lib/prisma', () => ({
  get default() {
    return testPrisma
  },
}))

// auth is not under test — always return an admin session
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'admin-user-id', name: 'Test Admin', role: 'ADMIN' },
  }),
}))

// next/cache is a no-op in tests
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  testPrisma = createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(testPrisma)
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('DISCORD_BOT_TOKEN', 'test-bot-token')
  vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', 'notifications-channel-id')
  vi.stubEnv('DISCORD_EVENTS_FORUM_ID', 'events-forum-id')
  vi.stubEnv('DISCORD_GUILD_ID', 'test-guild-id')
  vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await testPrisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return testPrisma.event.create({
    data: {
      name: 'GT3 Challenge',
      track: 'Spa-Francorchamps',
      trackConfig: 'Grand Prix',
      startTime: new Date('2026-05-01T20:00:00Z'),
      endTime: new Date('2026-05-01T23:00:00Z'),
      customCarClasses: [],
      ...overrides,
    },
  })
}

async function seedRace(eventId: string, overrides: Record<string, unknown> = {}) {
  return testPrisma.race.create({
    data: {
      eventId,
      startTime: new Date('2026-05-01T20:00:00Z'),
      endTime: new Date('2026-05-01T23:00:00Z'),
      teamsAssigned: false,
      ...overrides,
    },
  })
}

async function seedCarClass() {
  return testPrisma.carClass.create({
    data: { name: 'GT3', shortName: 'GT3', externalId: 1 },
  })
}

async function seedUser(name: string, discordId?: string) {
  const user = await testPrisma.user.create({
    data: { email: `${name.toLowerCase()}@test.com`, name, role: 'USER' },
  })
  if (discordId) {
    await testPrisma.account.create({
      data: {
        userId: user.id,
        type: 'oauth',
        provider: 'discord',
        providerAccountId: discordId,
      },
    })
  }
  return user
}

async function seedTeam(name = 'Team Alpha') {
  return testPrisma.team.create({
    data: { name, iracingTeamId: Math.floor(Math.random() * 100000) },
  })
}

async function seedRegistration(
  raceId: string,
  carClassId: string,
  userId: string,
  teamId?: string
) {
  return testPrisma.registration.create({
    data: { raceId, carClassId, userId, teamId: teamId ?? null },
  })
}

// ---------------------------------------------------------------------------
// Helpers for fetch mock responses
// ---------------------------------------------------------------------------

function mockFetchSuccess(json: unknown = {}) {
  return { ok: true, status: 200, json: async () => json } as Response
}

// ---------------------------------------------------------------------------
// Tests: loadRaceAssignmentData
// ---------------------------------------------------------------------------

describe('loadRaceAssignmentData', () => {
  it('throws when race does not exist', async () => {
    await expect(loadRaceAssignmentData('nonexistent-id')).rejects.toThrow('Race not found')
  })

  it('returns empty registrations for a new race with no signups', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id)

    const data = await loadRaceAssignmentData(race.id)

    expect(data.raceWithEvent.id).toBe(race.id)
    expect(data.raceWithEvent.event.name).toBe('GT3 Challenge')
    expect(data.registrations).toHaveLength(0)
    expect(data.allTeams).toHaveLength(0)
    expect(data.siblingRaces).toHaveLength(0)
  })

  it('includes both assigned and unassigned drivers', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id)
    const carClass = await seedCarClass()
    const team = await seedTeam()
    const alice = await seedUser('Alice')
    const bob = await seedUser('Bob')

    await seedRegistration(race.id, carClass.id, alice.id, team.id)
    await seedRegistration(race.id, carClass.id, bob.id) // unassigned

    const data = await loadRaceAssignmentData(race.id)

    expect(data.registrations).toHaveLength(2)
    const names = data.registrations.map((r) => r.user?.name).sort()
    expect(names).toEqual(['Alice', 'Bob'])
    const teamIds = data.registrations.map((r) => r.teamId)
    expect(teamIds).toContain(team.id)
    expect(teamIds).toContain(null)
  })

  it('includes sibling races that have not had teams assigned', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id)
    const sibling = await seedRace(event.id, {
      startTime: new Date('2026-06-01T20:00:00Z'),
      endTime: new Date('2026-06-01T23:00:00Z'),
      teamsAssigned: false,
    })

    const data = await loadRaceAssignmentData(race.id)

    expect(data.siblingRaces).toHaveLength(1)
    expect(data.siblingRaces[0].id).toBe(sibling.id)
    // No registrations from an unassigned sibling
    expect(data.siblingRaceRegistrations).toHaveLength(0)
  })

  it('returns existingEventThreadRecord when a sibling race has a thread', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id)
    await seedRace(event.id, {
      startTime: new Date('2026-07-01T20:00:00Z'),
      endTime: new Date('2026-07-01T23:00:00Z'),
      teamsAssigned: true,
      discordTeamsThreadId: 'existing-event-thread-123',
    })

    const data = await loadRaceAssignmentData(race.id)

    expect(data.existingEventThreadRecord?.discordTeamsThreadId).toBe('existing-event-thread-123')
  })
})

// ---------------------------------------------------------------------------
// Tests: sendTeamsAssignmentNotificationWithData
// ---------------------------------------------------------------------------

describe('sendTeamsAssignmentNotificationWithData', () => {
  it('calls createOrUpdateEventThread with team members drawn from real DB registrations', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id, { teamsAssigned: true })
    const carClass = await seedCarClass()
    const team = await seedTeam('Racing Squad')
    const alice = await seedUser('Alice', 'alice-discord-123')
    const bob = await seedUser('Bob', 'bob-discord-456')

    await seedRegistration(race.id, carClass.id, alice.id, team.id)
    await seedRegistration(race.id, carClass.id, bob.id, team.id)

    const data = await loadRaceAssignmentData(race.id)

    // Mock fetch: team thread creation → event thread creation
    vi.mocked(fetch)
      // createOrUpdateTeamThread: check existing thread (none)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      // createOrUpdateTeamThread: create new thread → returns new thread id
      .mockResolvedValueOnce(mockFetchSuccess({ id: 'new-team-thread-id' }))
      // addUsersToThread: add members
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      // createOrUpdateEventThread: check existing thread (none → creates new)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce(mockFetchSuccess({ id: 'new-event-thread-id' }))
      // sendTeamsAssignedNotification: post notification message
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)

    await sendTeamsAssignmentNotificationWithData(data, {
      id: 'admin-user-id',
      name: 'Test Admin',
      role: 'ADMIN',
    })

    // Verify the event thread creation call contains both driver names
    const eventThreadCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/threads') &&
          opts?.method === 'POST' &&
          typeof opts?.body === 'string' &&
          (opts.body.includes('Alice') || opts.body.includes('Bob'))
      )
    expect(eventThreadCall).toBeDefined()
    const body = JSON.parse(eventThreadCall![1]!.body as string)
    const allText = JSON.stringify(body)
    expect(allText).toContain('Alice')
    expect(allText).toContain('Bob')
    expect(allText).toContain('Racing Squad')
  })

  it('shows unassigned drivers separately in the event thread', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id, { teamsAssigned: true })
    const carClass = await seedCarClass()
    const team = await seedTeam('Alpha Team')
    const alice = await seedUser('Alice')
    const carol = await seedUser('Carol') // unassigned

    await seedRegistration(race.id, carClass.id, alice.id, team.id)
    await seedRegistration(race.id, carClass.id, carol.id) // no team

    const data = await loadRaceAssignmentData(race.id)

    // Carol is unassigned — verify she appears in the event thread payload
    // Mock fetch to capture the event thread creation call
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // team thread: no existing
      .mockResolvedValueOnce(mockFetchSuccess({ id: 'team-thread-id' })) // team thread: created
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response) // addUsersToThread
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // event thread: no existing
      .mockResolvedValueOnce(mockFetchSuccess({ id: 'event-thread-id' })) // event thread: created
      .mockResolvedValue({ ok: true, status: 200 } as Response) // notification

    await sendTeamsAssignmentNotificationWithData(data, {
      id: 'admin-user-id',
      name: 'Test Admin',
      role: 'ADMIN',
    })

    // Find the event thread POST — it should contain Carol (unassigned) in the payload
    const eventThreadCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/threads') &&
          opts?.method === 'POST' &&
          typeof opts?.body === 'string' &&
          opts.body.includes('Carol')
      )
    expect(eventThreadCall).toBeDefined()
  })

  it('emits a thread for each distinct team in the race', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id, { teamsAssigned: true })
    const carClass = await seedCarClass()
    const teamA = await seedTeam('Team A')
    const teamB = await seedTeam('Team B')
    const alice = await seedUser('Alice')
    const bob = await seedUser('Bob')

    await seedRegistration(race.id, carClass.id, alice.id, teamA.id)
    await seedRegistration(race.id, carClass.id, bob.id, teamB.id)

    const data = await loadRaceAssignmentData(race.id)
    expect(data.registrations).toHaveLength(2)
    const teamIds = new Set(data.registrations.map((r) => r.teamId))
    expect(teamIds.size).toBe(2)

    // Two team thread creates + one event thread create + notifications
    vi.mocked(fetch).mockResolvedValue(mockFetchSuccess({ id: 'some-thread-id' }))

    await sendTeamsAssignmentNotificationWithData(data, {
      id: 'admin-user-id',
      name: 'Test Admin',
      role: 'ADMIN',
    })

    // Count POST calls to /threads (team and event thread creations)
    const threadPosts = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([url, opts]) =>
          typeof url === 'string' && url.includes('/threads') && opts?.method === 'POST'
      )
    // Should have created a thread for Team A, Team B, and the event — at minimum 2 team threads
    expect(threadPosts.length).toBeGreaterThanOrEqual(2)
  })
})
