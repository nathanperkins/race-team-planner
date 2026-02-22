/**
 * Integration tests for the discord notification pipeline.
 *
 * These tests use a real PostgreSQL database (DATABASE_URL_TEST) — no Prisma mocks.
 * fetch is mocked so we never hit the real Discord API, but the message payloads
 * are built from genuine DB data, which makes assertions much more trustworthy.
 *
 * Run with: npm run test:integration
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(({ task }) => {
  process.stdout.write(`\n--- ${task.suite?.name ?? ''}: ${task.name} ---\n`)
})

afterEach(({ task }) => {
  process.stdout.write(`--- end: ${task.name} ---\n`)
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
  return {
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as Response
}

/**
 * Install a fetch mock that routes responses based on URL/method/body so tests
 * are not sensitive to the order in which Discord API calls are made.
 *
 * Team threads:  POST .../threads  with body.name containing "•"  → { id: teamThreadId }
 * Event threads: POST .../threads  with body.name NOT containing "•" → { id: eventThreadId }
 * Everything else (addUsersToThread PUTs, notification POSTs, etc.)  → {}
 */
function mockDiscordFetch({
  teamThreadId = 'team-thread-id',
  eventThreadId = 'event-thread-id',
}: { teamThreadId?: string; eventThreadId?: string } = {}) {
  vi.mocked(fetch).mockImplementation(async (url, opts) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    if (urlStr.endsWith('/threads') && opts?.method === 'POST') {
      const body = typeof opts.body === 'string' ? (JSON.parse(opts.body) as { name?: string }) : {}
      const isTeamThread = typeof body.name === 'string' && body.name.includes('•')
      return mockFetchSuccess({ id: isTeamThread ? teamThreadId : eventThreadId })
    }
    return mockFetchSuccess()
  })
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
  it('creates a team thread and event thread with member names from real DB registrations', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id, { teamsAssigned: true })
    const carClass = await seedCarClass()
    const team = await seedTeam('Racing Squad')
    const alice = await seedUser('Alice', 'alice-discord-123')
    const bob = await seedUser('Bob', 'bob-discord-456')

    await seedRegistration(race.id, carClass.id, alice.id, team.id)
    await seedRegistration(race.id, carClass.id, bob.id, team.id)

    const data = await loadRaceAssignmentData(race.id)

    // Route-based mock: team thread POSTs (name contains "•") → team-thread-id,
    // event thread POSTs (name without "•") → event-thread-id, everything else → {}
    mockDiscordFetch({ teamThreadId: 'team-thread-id', eventThreadId: 'event-thread-id' })

    await sendTeamsAssignmentNotificationWithData(data, {
      id: 'admin-user-id',
      name: 'Test Admin',
      role: 'ADMIN',
    })

    const calls = vi.mocked(fetch).mock.calls

    // Team thread POST: POST .../threads, body.name contains "•", body has team/member names
    const teamThreadPost = calls.find(([url, opts]) => {
      if (typeof url !== 'string' || !url.endsWith('/threads') || opts?.method !== 'POST')
        return false
      const body = typeof opts.body === 'string' ? (JSON.parse(opts.body) as { name?: string }) : {}
      return typeof body.name === 'string' && body.name.includes('•')
    })
    expect(teamThreadPost).toBeDefined()
    const teamBody = JSON.stringify(JSON.parse(teamThreadPost![1]!.body as string))
    expect(teamBody).toContain('Racing Squad')
    expect(teamBody).toContain('Alice')
    expect(teamBody).toContain('Bob')

    // Event thread POST: POST .../threads, body.name does NOT contain "•"
    const eventThreadPost = calls.find(([url, opts]) => {
      if (typeof url !== 'string' || !url.endsWith('/threads') || opts?.method !== 'POST')
        return false
      const body = typeof opts.body === 'string' ? (JSON.parse(opts.body) as { name?: string }) : {}
      return typeof body.name === 'string' && !body.name.includes('•')
    })
    expect(eventThreadPost).toBeDefined()
    // Event thread references drivers by Discord mention (<@discordId>)
    const eventBody = JSON.stringify(JSON.parse(eventThreadPost![1]!.body as string))
    expect(eventBody).toContain('alice-discord-123')
    expect(eventBody).toContain('bob-discord-456')
  })

  it('shows unassigned drivers in the event thread but not in any team thread', async () => {
    const event = await seedEvent()
    const race = await seedRace(event.id, { teamsAssigned: true })
    const carClass = await seedCarClass()
    const team = await seedTeam('Alpha Team')
    const alice = await seedUser('Alice')
    const carol = await seedUser('Carol') // unassigned

    await seedRegistration(race.id, carClass.id, alice.id, team.id)
    await seedRegistration(race.id, carClass.id, carol.id) // no team

    const data = await loadRaceAssignmentData(race.id)

    mockDiscordFetch()

    await sendTeamsAssignmentNotificationWithData(data, {
      id: 'admin-user-id',
      name: 'Test Admin',
      role: 'ADMIN',
    })

    const calls = vi.mocked(fetch).mock.calls

    // Event thread POST (name without "•") should contain Carol (unassigned driver)
    const eventThreadPost = calls.find(([url, opts]) => {
      if (typeof url !== 'string' || !url.endsWith('/threads') || opts?.method !== 'POST')
        return false
      const body = typeof opts.body === 'string' ? (JSON.parse(opts.body) as { name?: string }) : {}
      return typeof body.name === 'string' && !body.name.includes('•')
    })
    expect(eventThreadPost).toBeDefined()
    expect(eventThreadPost![1]!.body as string).toContain('Carol')

    // Team thread POST (name with "•") should NOT contain Carol (she has no team)
    const teamThreadPost = calls.find(([url, opts]) => {
      if (typeof url !== 'string' || !url.endsWith('/threads') || opts?.method !== 'POST')
        return false
      const body = typeof opts.body === 'string' ? (JSON.parse(opts.body) as { name?: string }) : {}
      return typeof body.name === 'string' && body.name.includes('•')
    })
    expect(teamThreadPost).toBeDefined()
    expect(teamThreadPost![1]!.body as string).not.toContain('Carol')
  })

  it('emits one team thread per distinct team in the race', async () => {
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

    mockDiscordFetch()

    await sendTeamsAssignmentNotificationWithData(data, {
      id: 'admin-user-id',
      name: 'Test Admin',
      role: 'ADMIN',
    })

    // Team thread POSTs: POST .../threads with body.name containing "•"
    const teamThreadPosts = vi.mocked(fetch).mock.calls.filter(([url, opts]) => {
      if (typeof url !== 'string' || !url.endsWith('/threads') || opts?.method !== 'POST')
        return false
      const body = typeof opts.body === 'string' ? (JSON.parse(opts.body) as { name?: string }) : {}
      return typeof body.name === 'string' && body.name.includes('•')
    })
    expect(teamThreadPosts).toHaveLength(2)

    // One thread per team — each body should reference its respective team name
    const teamNames = teamThreadPosts.map(([, opts]) => {
      const body = JSON.parse(opts!.body as string) as { name: string }
      return body.name
    })
    expect(teamNames.some((n) => n.includes('Team A'))).toBe(true)
    expect(teamNames.some((n) => n.includes('Team B'))).toBe(true)
  })
})
