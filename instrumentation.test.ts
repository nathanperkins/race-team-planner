import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mockFeatures = {
  discordAuth: true,
  mockAuth: false,
  iracingSync: false,
  discordMembership: true,
  feedback: false,
  userGuide: false,
}

const mockLogger = {
  level: 'info',
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}

const mockVerifyBotToken = vi.fn()
const mockVerifyGuildAccess = vi.fn()
const mockVerifyAdminRoles = vi.fn()
const mockVerifyNotificationsChannel = vi.fn()
const mockVerifyEventsForum = vi.fn()

vi.mock('@/lib/config', () => ({
  get features() {
    return mockFeatures
  },
  appTitle: 'Race Team Planner (test)',
  appLocale: 'en-US',
  appTimeZone: 'America/Los_Angeles',
  feedbackUrl: undefined,
  userGuideUrl: undefined,
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
}))

vi.mock('@/lib/discord', () => ({
  verifyBotToken: (...args: unknown[]) => mockVerifyBotToken(...args),
  verifyGuildAccess: (...args: unknown[]) => mockVerifyGuildAccess(...args),
  verifyAdminRoles: (...args: unknown[]) => mockVerifyAdminRoles(...args),
  verifyNotificationsChannel: (...args: unknown[]) => mockVerifyNotificationsChannel(...args),
  verifyEventsForum: (...args: unknown[]) => mockVerifyEventsForum(...args),
}))

vi.mock('./instrumentation.node', () => ({}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('instrumentation register()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFeatures.discordAuth = true
    mockFeatures.mockAuth = false
    mockFeatures.discordMembership = true
    vi.stubEnv('DISCORD_GUILD_ID', 'guild-123')
    vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', 'role-1,role-2')
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', 'notif-123')
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', 'forum-123')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('starts all five Discord verification checks in parallel and logs results in deterministic order', async () => {
    const { register } = await import('./instrumentation')

    const botDeferred = createDeferred<{ name: string; id: string } | null>()
    const guildDeferred = createDeferred<{ name: string } | null>()
    const rolesDeferred = createDeferred<string[]>()
    const notifDeferred = createDeferred<{ name: string } | null>()
    const forumDeferred = createDeferred<{ name: string } | null>()

    mockVerifyBotToken.mockReturnValue(botDeferred.promise)
    mockVerifyGuildAccess.mockReturnValue(guildDeferred.promise)
    mockVerifyAdminRoles.mockReturnValue(rolesDeferred.promise)
    mockVerifyNotificationsChannel.mockReturnValue(notifDeferred.promise)
    mockVerifyEventsForum.mockReturnValue(forumDeferred.promise)

    const registerPromise = register()

    // All 5 checks must be in-flight concurrently before any single check resolves
    await vi.waitFor(() => {
      expect(mockVerifyBotToken).toHaveBeenCalledTimes(1)
      expect(mockVerifyGuildAccess).toHaveBeenCalledTimes(1)
      expect(mockVerifyAdminRoles).toHaveBeenCalledTimes(1)
      expect(mockVerifyNotificationsChannel).toHaveBeenCalledTimes(1)
      expect(mockVerifyEventsForum).toHaveBeenCalledTimes(1)
    })

    // Resolve in reverse order to prove startup log order stays deterministic
    forumDeferred.resolve({ name: 'events-forum' })
    notifDeferred.resolve({ name: 'race-notifications' })
    rolesDeferred.resolve(['Race Control', 'Steward'])
    guildDeferred.resolve({ name: 'Sim Racing Club' })
    botDeferred.resolve({ name: 'PlannerBot', id: 'bot-999' })

    await registerPromise

    const discordInfoLogs = mockLogger.info.mock.calls
      .map(([msg]) => String(msg))
      .filter((msg) => msg.startsWith('[Discord]'))

    expect(discordInfoLogs).toEqual([
      '[Discord] Bot Identity Verified: PlannerBot (bot-999) ✅',
      '[Discord] Guild Access Verified: "Sim Racing Club" (guild-123) ✅',
      '[Discord] Admin Roles Verified: Race Control, Steward ✅',
      '[Discord] Notifications Channel Verified: #race-notifications (notif-123) ✅',
      '[Discord] Events Forum Verified: #events-forum (forum-123) ✅',
    ])
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('logs only the invalid bot token error when verifyBotToken returns null', async () => {
    const { register } = await import('./instrumentation')

    mockVerifyBotToken.mockResolvedValue(null)
    mockVerifyGuildAccess.mockResolvedValue(null)
    mockVerifyAdminRoles.mockResolvedValue([])
    mockVerifyNotificationsChannel.mockResolvedValue(null)
    mockVerifyEventsForum.mockResolvedValue(null)

    await register()

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[Discord] Bot Token is INVALID ❌ (Received 401/Unauthorized)'
    )
    const discordInfoLogs = mockLogger.info.mock.calls
      .map(([msg]) => String(msg))
      .filter((msg) => msg.startsWith('[Discord]'))
    expect(discordInfoLogs).toEqual([])
  })

  it('logs missing guild, roles, and channel errors alongside optional unconfigured forum notice', async () => {
    const { register } = await import('./instrumentation')
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', '')

    mockVerifyBotToken.mockResolvedValue({ name: 'PlannerBot', id: 'bot-999' })
    mockVerifyGuildAccess.mockResolvedValue(null)
    mockVerifyAdminRoles.mockResolvedValue([])
    mockVerifyNotificationsChannel.mockResolvedValue(null)
    mockVerifyEventsForum.mockResolvedValue(null)

    await register()

    expect(mockLogger.error.mock.calls.map(([msg]) => String(msg))).toEqual([
      '[Discord] Guild Access FAILED ❌ (Is the bot in Server ID: guild-123?)',
      '[Discord] Admin Roles NOT FOUND ❌ (Check IDs in .env)',
      '[Discord] Notifications Channel NOT FOUND ❌ (Check DISCORD_NOTIFICATIONS_CHANNEL_ID in .env)',
    ])
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[Discord] Events Forum: Not Configured (Optional) ⚠️'
    )
  })

  it('skips all Discord verification calls when discordMembership is disabled', async () => {
    const { register } = await import('./instrumentation')
    mockFeatures.discordMembership = false

    await register()

    expect(mockVerifyBotToken).not.toHaveBeenCalled()
    expect(mockVerifyGuildAccess).not.toHaveBeenCalled()
    expect(mockVerifyAdminRoles).not.toHaveBeenCalled()
    expect(mockVerifyNotificationsChannel).not.toHaveBeenCalled()
    expect(mockVerifyEventsForum).not.toHaveBeenCalled()
  })
})
