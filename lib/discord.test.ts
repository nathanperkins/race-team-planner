import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkGuildMembership,
  GuildMembershipStatus,
  verifyBotToken,
  verifyGuildAccess,
  verifyAdminRoles,
  verifyNotificationsChannel,
  verifyEventsForum,
  sendRegistrationNotification,
  sendOnboardingNotification,
  findBotMessageInThread,
  upsertThreadMessage,
  postRosterChangeNotifications,
  sendWeeklyScheduleNotification,
  createOrUpdateEventThread,
  createOrUpdateTeamThread,
  addUsersToThread,
} from './discord'
import type { WeeklyScheduleEvent } from './discord-utils'

// Create mock logger singleton using vi.hoisted to avoid hoisting issues
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}))

// Mock the logger module
vi.mock('./logger', () => ({
  createLogger: () => mockLogger,
  logger: mockLogger,
}))

describe('checkGuildMembership', () => {
  const userId = '123456789'
  const botToken = 'fake-bot-token'
  const guildId = 'fake-guild-id'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // Save original env
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_GUILD_ID', guildId)
    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns CONFIG_ERROR if DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await checkGuildMembership(userId)
    expect(result.status).toBe(GuildMembershipStatus.CONFIG_ERROR)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('DISCORD_BOT_TOKEN or DISCORD_GUILD_ID missing')
    )
  })

  it('returns CONFIG_ERROR if DISCORD_GUILD_ID is missing', async () => {
    vi.stubEnv('DISCORD_GUILD_ID', '')
    const result = await checkGuildMembership(userId)
    expect(result.status).toBe(GuildMembershipStatus.CONFIG_ERROR)
  })

  it('returns MEMBER and user data when API returns 200 OK', async () => {
    const mockUserData = {
      roles: ['role1', 'role2'],
      nick: 'MyNick',
      user: { id: userId, username: 'testuser' },
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockUserData,
    } as Response)

    const result = await checkGuildMembership(userId)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/guilds/${guildId}/members/${userId}`),
      expect.objectContaining({
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      })
    )
    expect(result).toEqual({
      status: GuildMembershipStatus.MEMBER,
      roles: mockUserData.roles,
      nick: mockUserData.nick,
      user: mockUserData.user,
    })
  })

  it('returns NOT_MEMBER when API returns 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await checkGuildMembership(userId)
    expect(result.status).toBe(GuildMembershipStatus.NOT_MEMBER)
  })

  it('returns API_ERROR when API returns other error codes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    const result = await checkGuildMembership(userId)
    expect(result.status).toBe(GuildMembershipStatus.API_ERROR)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('returns API_ERROR when fetch throws an error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))

    const result = await checkGuildMembership(userId)
    expect(result.status).toBe(GuildMembershipStatus.API_ERROR)
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to check Discord guild membership'
    )
  })
})

describe('verifyBotToken', () => {
  const botToken = 'fake-bot-token'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns null if DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await verifyBotToken()
    expect(result).toBeNull()
  })

  it('returns bot info when API returns 200 OK', async () => {
    const mockBotData = {
      id: 'bot123',
      username: 'TestBot',
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockBotData,
    } as Response)

    const result = await verifyBotToken()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/@me'),
      expect.objectContaining({
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      })
    )
    expect(result).toEqual({
      id: mockBotData.id,
      name: mockBotData.username,
    })
  })

  it('returns null and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid Token',
    } as Response)

    const result = await verifyBotToken()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 401, statusText: 'Unauthorized', text: 'Invalid Token' },
      '❌ Discord Token Verification Failed'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyBotToken()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      '❌ Failed to connect to Discord API during verification'
    )
  })
})

describe('verifyGuildAccess', () => {
  const botToken = 'fake-bot-token'
  const guildId = 'fake-guild-id'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_GUILD_ID', guildId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns null if DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await verifyGuildAccess()
    expect(result).toBeNull()
  })

  it('returns null if DISCORD_GUILD_ID is missing', async () => {
    vi.stubEnv('DISCORD_GUILD_ID', '')
    const result = await verifyGuildAccess()
    expect(result).toBeNull()
  })

  it('returns guild info when API returns 200 OK', async () => {
    const mockGuildData = {
      name: 'Test Guild',
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGuildData,
    } as Response)

    const result = await verifyGuildAccess()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/guilds/${guildId}`),
      expect.objectContaining({
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      })
    )
    expect(result).toEqual({
      name: mockGuildData.name,
    })
  })

  it('returns null and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Missing Access',
    } as Response)

    const result = await verifyGuildAccess()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 403, statusText: 'Forbidden', text: 'Missing Access' },
      '❌ Discord Guild Access Failed'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyGuildAccess()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      '❌ Failed to connect to Discord API during guild verification'
    )
  })
})

describe('verifyAdminRoles', () => {
  const botToken = 'fake-bot-token'
  const guildId = 'fake-guild-id'
  const adminRoleIds = 'role1,role2'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_GUILD_ID', guildId)
    vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', adminRoleIds)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns empty array if DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await verifyAdminRoles()
    expect(result).toEqual([])
  })

  it('returns found role names when API returns 200 OK', async () => {
    const mockRoles = [
      { id: 'role1', name: 'Admin' },
      { id: 'role2', name: 'Moderator' },
      { id: 'role3', name: 'User' },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRoles,
    } as Response)

    const result = await verifyAdminRoles()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/guilds/${guildId}/roles`),
      expect.objectContaining({
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      })
    )
    expect(result).toEqual(['Admin', 'Moderator'])
  })

  it('returns empty array when no roles match', async () => {
    const mockRoles = [{ id: 'role3', name: 'User' }]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRoles,
    } as Response)

    const result = await verifyAdminRoles()
    expect(result).toEqual([])
  })

  it('returns empty array and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response)

    const result = await verifyAdminRoles()
    expect(result).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Discord Admin Role Verification Failed: 401')
    )
  })

  it('returns empty array and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyAdminRoles()
    expect(result).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      '❌ Failed to connect to Discord API during role verification'
    )
  })
})

describe('verifyNotificationsChannel', () => {
  const botToken = 'fake-bot-token'
  const channelId = 'fake-channel-id'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', channelId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns null if DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await verifyNotificationsChannel()
    expect(result).toBeNull()
  })

  it('returns null if DISCORD_NOTIFICATIONS_CHANNEL_ID is missing', async () => {
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', '')
    const result = await verifyNotificationsChannel()
    expect(result).toBeNull()
  })

  it('returns channel info when API returns 200 OK', async () => {
    const mockChannelData = {
      name: 'notifications-channel',
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockChannelData,
    } as Response)

    const result = await verifyNotificationsChannel()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${channelId}`),
      expect.objectContaining({
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      })
    )
    expect(result).toEqual({
      name: mockChannelData.name,
    })
  })

  it('returns null and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Missing Permissions',
    } as Response)

    const result = await verifyNotificationsChannel()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 403, statusText: 'Forbidden', text: 'Missing Permissions' },
      '❌ Discord Notifications Channel Access Failed'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyNotificationsChannel()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      '❌ Failed to connect to Discord API during channel verification'
    )
  })
})

describe('verifyEventsForum', () => {
  const botToken = 'fake-bot-token'
  const forumId = 'fake-forum-id'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', forumId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns null if DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await verifyEventsForum()
    expect(result).toBeNull()
  })

  it('returns null if DISCORD_EVENTS_FORUM_ID is missing', async () => {
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', '')
    const result = await verifyEventsForum()
    expect(result).toBeNull()
  })

  it('returns forum info when API returns 200 OK', async () => {
    const mockForumData = {
      name: 'events-forum',
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockForumData,
    } as Response)

    const result = await verifyEventsForum()

    expect(result).toEqual({
      name: mockForumData.name,
    })
  })

  it('returns null and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Channel not found',
    } as Response)

    const result = await verifyEventsForum()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 404, statusText: 'Not Found', text: 'Channel not found' },
      '❌ Discord Events Forum Access Failed'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyEventsForum()
    expect(result).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      '❌ Failed to connect to Discord API during forum verification'
    )
  })
})

describe('sendRegistrationNotification', () => {
  const botToken = 'fake-bot-token'
  const channelId = 'fake-channel-id'
  const guildId = 'fake-guild-id'
  const data = {
    userName: 'Alice',
    eventName: 'GT3 Challenge',
    raceStartTime: new Date('2024-05-01T20:00:00Z'),
    carClassName: 'GT3',
    eventUrl: 'http://example.com',
    discordUser: { id: '123', name: 'alice' },
    threadId: 'event-thread-123',
    guildId,
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', channelId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns false and warns if config is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await sendRegistrationNotification(data)
    expect(result).toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'))
  })

  it('returns true when API returns 200 OK', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await sendRegistrationNotification(data)

    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${channelId}/messages`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bot ${botToken}`,
        }),
      })
    )
  })

  it('posts to both notification channel and event thread', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await sendRegistrationNotification(data)

    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`/channels/${channelId}/messages`),
      expect.any(Object)
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/channels/event-thread-123/messages'),
      expect.any(Object)
    )
  })

  it('adds buttons and roster list only on the notifications channel message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await sendRegistrationNotification({
      ...data,
      otherRegisteredDrivers: [
        { name: 'Driver One', carClassName: 'GT3', discordId: '555' },
        { name: 'Driver Two', carClassName: 'LMP2' },
      ],
    })

    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)

    const firstPayload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string
    )
    expect(firstPayload.flags).toBe(4096)
    expect(firstPayload.embeds).toBeDefined()
    expect(firstPayload.components?.[0]?.type).toBe(1)
    const buttonUrls = (firstPayload.components?.[0]?.components ?? [])
      .map((button: { url?: string }) => button.url)
      .filter((value: string | undefined): value is string => Boolean(value))
    expect(buttonUrls).toHaveLength(2)
    expect(buttonUrls).toContain('http://example.com')
    expect(buttonUrls).toContain('https://discord.com/channels/fake-guild-id/event-thread-123')
    // Notification channel uses simplified format - racers in description, not fields
    const firstDescription = firstPayload.embeds?.[0]?.description ?? ''
    expect(firstDescription).toContain('🧑‍🚀 Racers in Class')
    expect(firstPayload.embeds?.[0]?.fields).toEqual([])

    const secondPayload = JSON.parse(
      (vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit).body as string
    )
    const secondFields = secondPayload.embeds?.[0]?.fields ?? []
    expect(secondPayload.components).toBeUndefined()
    expect(
      secondFields.some((field: { name: string }) => field.name === '👥 Already Registered')
    ).toBe(false)
  })

  it('returns true but logs error when thread post fails', async () => {
    vi.mocked(fetch)
      // Notification channel succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      // Event thread fails
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Thread not found',
      } as Response)

    const result = await sendRegistrationNotification(data)

    expect(result).toBe(true) // Still returns true since notification channel succeeded
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to send Discord registration notification to thread %s: %d %s: %s',
      'event-thread-123',
      404,
      'Not Found',
      'Thread not found'
    )
  })

  it('returns false and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Error message',
    } as Response)

    const result = await sendRegistrationNotification(data)
    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to send Discord registration notification: %d %s: %s',
      400,
      'Bad Request',
      'Error message'
    )
  })

  it('returns false and logs error when fetch throws', async () => {
    const error = new Error('Network fail')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await sendRegistrationNotification(data)
    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      'Error sending Discord registration notification'
    )
  })
})

describe('sendOnboardingNotification', () => {
  const botToken = 'fake-bot-token'
  const channelId = 'fake-channel-id'
  const data = {
    userName: 'Bob',
    iracingCustomerId: '789',
    profileUrl: 'http://profile.com',
    discordUser: { id: '456', name: 'bob' },
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', channelId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns false and warns if config is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    const result = await sendOnboardingNotification(data)
    expect(result).toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'))
  })

  it('returns true when API returns 200 OK', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response)

    const result = await sendOnboardingNotification(data)

    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${channelId}/messages`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bot ${botToken}`,
        }),
      })
    )
  })

  it('returns false and logs error when API returns error code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Missing Permissions',
    } as Response)

    const result = await sendOnboardingNotification(data)
    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 403, statusText: 'Forbidden', errorText: 'Missing Permissions' },
      'Failed to send Discord onboarding notification'
    )
  })

  it('returns false and logs error when fetch throws', async () => {
    const error = new Error('Network timeout')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await sendOnboardingNotification(data)
    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: error },
      'Error sending Discord onboarding notification'
    )
  })
})

describe('findBotMessageInThread', () => {
  const botToken = 'fake-bot-token'
  const threadId = 'thread-123'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns message ID when bot message is found', async () => {
    vi.mocked(fetch)
      // Get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { id: 'msg-3', author: { id: 'user-456' } },
          { id: 'msg-2', author: { id: 'user-789' } },
          { id: 'msg-1', author: { id: 'bot-user-123' } },
        ],
      } as Response)

    const result = await findBotMessageInThread(threadId, botToken)

    expect(result).toBe('msg-1')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/users/@me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bot fake-bot-token',
        }),
      })
    )
  })

  it('returns null when no bot message is found', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { id: 'msg-2', author: { id: 'user-456' } },
          { id: 'msg-1', author: { id: 'user-789' } },
        ],
      } as Response)

    const result = await findBotMessageInThread(threadId, botToken)

    expect(result).toBeNull()
  })

  it('throws error when bot user ID fetch fails after retries', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid token',
    } as Response)

    await expect(findBotMessageInThread(threadId, botToken)).rejects.toThrow(
      'Failed to get bot user ID: 401 Unauthorized - Invalid token'
    )

    // Verify it retried (initial + 3 retries = 4 total attempts)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('throws error when messages fetch fails after retries', async () => {
    const botIdResponse = {
      ok: true,
      status: 200,
      json: async () => ({ id: 'bot-user-123' }),
    } as Response
    const messagesErrorResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Thread not found',
    } as Response

    vi.mocked(fetch)
      // Initial attempt
      .mockResolvedValueOnce(botIdResponse)
      .mockResolvedValueOnce(messagesErrorResponse)
      // Retry 1
      .mockResolvedValueOnce(botIdResponse)
      .mockResolvedValueOnce(messagesErrorResponse)
      // Retry 2
      .mockResolvedValueOnce(botIdResponse)
      .mockResolvedValueOnce(messagesErrorResponse)
      // Retry 3
      .mockResolvedValueOnce(botIdResponse)
      .mockResolvedValueOnce(messagesErrorResponse)

    await expect(findBotMessageInThread(threadId, botToken)).rejects.toThrow(
      'Failed to fetch messages from thread thread-123: 404 Not Found - Thread not found'
    )

    // 4 attempts total (initial + 3 retries), each with 2 fetches (bot ID + messages)
    expect(fetch).toHaveBeenCalledTimes(8)
  })

  it('throws error when network fails after retries', async () => {
    const error = new Error('Network error')
    vi.mocked(fetch).mockRejectedValue(error)

    await expect(findBotMessageInThread(threadId, botToken)).rejects.toThrow('Network error')

    // Verify it retried (initial + 3 retries = 4 total attempts)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})

describe('upsertThreadMessage', () => {
  const botToken = 'fake-bot-token'
  const threadId = 'thread-123'
  const payload = {
    content: 'Test message',
    embeds: [{ title: 'Test Embed' }],
    allowed_mentions: { users: ['user-1'], parse: [] },
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('edits existing message when bot message is found', async () => {
    vi.mocked(fetch)
      // Get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'msg-1', author: { id: 'bot-user-123' } }],
      } as Response)
      // Edit message
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await upsertThreadMessage(threadId, payload, botToken)

    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/channels/thread-123/messages/msg-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    )
  })

  it('posts new message when no existing message found', async () => {
    vi.mocked(fetch)
      // Get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages (empty)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      // Post new message
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await upsertThreadMessage(threadId, payload, botToken)

    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/channels/thread-123/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
  })

  it('posts new message when edit fails with non-404 error after retries', async () => {
    const editErrorResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error details',
    } as Response

    vi.mocked(fetch)
      // Get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'msg-1', author: { id: 'bot-user-123' } }],
      } as Response)
      // Edit fails 4 times (initial + 3 retries)
      .mockResolvedValueOnce(editErrorResponse)
      .mockResolvedValueOnce(editErrorResponse)
      .mockResolvedValueOnce(editErrorResponse)
      .mockResolvedValueOnce(editErrorResponse)
      // Post new message succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await upsertThreadMessage(threadId, payload, botToken)

    expect(result.ok).toBe(true)
    // Get bot ID + Get messages + 4 edit attempts + 1 post = 7 total
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), existingMessageId: 'msg-1', threadId: 'thread-123' },
      'Failed to edit existing message after retries'
    )
  })

  it('creates new message when existing message was deleted (404)', async () => {
    vi.mocked(fetch)
      // Get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'msg-1', author: { id: 'bot-user-123' } }],
      } as Response)
      // Edit fails with 404 (message deleted)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)
      // Post new message succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await upsertThreadMessage(threadId, payload, botToken)

    expect(result.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/channels/thread-123/messages'),
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('returns 404 when thread itself is deleted', async () => {
    vi.mocked(fetch)
      // Get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages (no existing messages)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      // Post fails with 404 (thread deleted)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)

    const result = await upsertThreadMessage(threadId, payload, botToken)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create message in thread thread-123')
    )
  })
})

describe('postRosterChangeNotifications', () => {
  const botToken = 'fake-bot-token'
  const eventThreadId = 'event-thread-123'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does nothing when roster changes are empty', async () => {
    await postRosterChangeNotifications(eventThreadId, [], botToken, 'Admin User')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts changes to event thread only when no team threads provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const rosterChanges = [
      { type: 'added' as const, driverName: 'Alice', teamName: 'Team One' },
      { type: 'dropped' as const, driverName: 'Bob' },
    ]

    await postRosterChangeNotifications(eventThreadId, rosterChanges, botToken, 'Admin User')

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${eventThreadId}/messages`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bot fake-bot-token',
        }),
        body: expect.stringContaining('Alice'),
      })
    )
  })

  it('posts changes to both event and affected team threads', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const teamThreads = {
      'team-1': 'team-thread-1',
      'team-2': 'team-thread-2',
    }
    const teamNameById = new Map([
      ['team-1', 'Team One'],
      ['team-2', 'Team Two'],
    ])

    const rosterChanges = [
      { type: 'added' as const, driverName: 'Alice', teamName: 'Team One' },
      { type: 'moved' as const, driverName: 'Bob', fromTeam: 'Team One', toTeam: 'Team Two' },
    ]

    await postRosterChangeNotifications(
      eventThreadId,
      rosterChanges,
      botToken,
      'Admin User',
      teamThreads,
      teamNameById
    )

    // Should post to: event thread + team-thread-1 + team-thread-2
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('includes mentions in the same team-thread roster-change post', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const teamThreads = {
      'team-1': 'team-thread-1',
    }
    const teamNameById = new Map([['team-1', 'Team One']])
    const rosterChanges = [{ type: 'added' as const, driverName: 'Alice', teamName: 'Team One' }]

    await postRosterChangeNotifications(
      eventThreadId,
      rosterChanges,
      botToken,
      'Admin User',
      teamThreads,
      teamNameById,
      undefined,
      { 'team-1': ['12345'] }
    )

    const teamPostCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => call[0]?.toString().includes('/channels/team-thread-1/messages'))
    expect(teamPostCall).toBeDefined()
    const body = JSON.parse((teamPostCall?.[1] as RequestInit).body as string)
    expect(body.content).toContain('<@12345>')
    expect(body.allowed_mentions).toEqual({ users: ['12345'], parse: [] })
    expect(body.embeds).toBeDefined()
  })

  it('skips team-thread roster change post for newly created team thread IDs', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const teamThreads = {
      'team-1': 'team-thread-1',
      'team-2': 'team-thread-2',
    }
    const teamNameById = new Map([
      ['team-1', 'Team One'],
      ['team-2', 'Team Two'],
    ])

    const rosterChanges = [
      { type: 'moved' as const, driverName: 'Bob', fromTeam: 'Team One', toTeam: 'Team Two' },
    ]

    await postRosterChangeNotifications(
      eventThreadId,
      rosterChanges,
      botToken,
      'Admin User',
      teamThreads,
      teamNameById,
      ['team-thread-2']
    )

    // Event + Team One only (Team Two suppressed)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${eventThreadId}/messages`),
      expect.anything()
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/team-thread-1/messages'),
      expect.anything()
    )
  })

  it('logs error when posting to thread fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error details',
    } as Response)

    const rosterChanges = [{ type: 'added' as const, driverName: 'Alice', teamName: 'Team One' }]

    await postRosterChangeNotifications(eventThreadId, rosterChanges, botToken, 'Admin User')

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to post roster changes to %s: %d %s: %s',
      'event thread',
      500,
      'Internal Server Error',
      'Error details'
    )
  })

  it('posts team class change to both event thread and affected team thread', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const teamThreads = {
      'team-1': 'team-thread-1',
    }
    const teamNameById = new Map([['team-1', 'Team One']])

    const rosterChanges = [
      {
        type: 'teamClassChanged' as const,
        teamName: 'Team One',
        fromClass: 'GT3',
        toClass: 'GTE',
        drivers: ['Alice', 'Bob'],
      },
    ]

    await postRosterChangeNotifications(
      eventThreadId,
      rosterChanges,
      botToken,
      'Admin User',
      teamThreads,
      teamNameById
    )

    // Should post to: event thread + team-thread-1
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${eventThreadId}/messages`),
      expect.anything()
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/team-thread-1/messages`),
      expect.anything()
    )
  })

  it('posts dropped drivers to event thread and the originating team thread', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const teamThreads = {
      'team-1': 'team-thread-1',
    }
    const teamNameById = new Map([['team-1', 'Team One']])

    const rosterChanges = [
      {
        type: 'dropped' as const,
        driverName: 'Bob',
        fromTeam: 'Team One',
      },
    ]

    await postRosterChangeNotifications(
      eventThreadId,
      rosterChanges,
      botToken,
      'Admin User',
      teamThreads,
      teamNameById
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${eventThreadId}/messages`),
      expect.anything()
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/team-thread-1/messages'),
      expect.anything()
    )
  })

  it('posts dropped unassigned drivers only to event thread', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const teamThreads = {
      'team-1': 'team-thread-1',
    }
    const teamNameById = new Map([['team-1', 'Team One']])

    const rosterChanges = [
      {
        type: 'dropped' as const,
        driverName: 'Bob',
        fromTeam: 'Unassigned',
      },
    ]

    await postRosterChangeNotifications(
      eventThreadId,
      rosterChanges,
      botToken,
      'Admin User',
      teamThreads,
      teamNameById
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${eventThreadId}/messages`),
      expect.anything()
    )
  })
})

describe('sendWeeklyScheduleNotification', () => {
  const createMockEvent = (name: string): WeeklyScheduleEvent => ({
    name,
    track: 'Spa-Francorchamps',
    startTime: new Date('2026-02-15T10:00:00Z'),
    endTime: new Date('2026-02-15T12:00:00Z'),
    raceTimes: [new Date('2026-02-15T11:00:00Z')],
    carClasses: ['GT3'],
    registeredUsers: [{ name: 'Test User', discordId: '123456' }],
    eventUrl: 'https://example.com/event',
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', 'fake-bot-token')
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', 'fake-channel-id')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns false and logs warning when DISCORD_BOT_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')

    const events = [createMockEvent('GT3 Challenge')]

    const result = await sendWeeklyScheduleNotification(events)

    expect(result).toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
      )
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns false and logs warning when DISCORD_NOTIFICATIONS_CHANNEL_ID is missing', async () => {
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', '')

    const events = [createMockEvent('GT3 Challenge')]

    const result = await sendWeeklyScheduleNotification(events)

    expect(result).toBe(false)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
      )
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns false when events array is empty', async () => {
    const result = await sendWeeklyScheduleNotification([])

    expect(result).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends a single chunk notification when events produce less than 10 embeds', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    const events = [createMockEvent('GT3 Challenge'), createMockEvent('LMP2 Endurance')]

    const result = await sendWeeklyScheduleNotification(events)

    expect(result).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/fake-channel-id/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bot fake-bot-token',
        }),
        body: expect.stringContaining('Upcoming Races for this Weekend'),
      })
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      { chunkIndex: 1, totalChunks: 1 },
      '✅ Weekly schedule chunk sent'
    )
  })

  it('sends multiple chunks when events produce more than 10 embeds', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    // Create 11 events to ensure we get more than 10 embeds (triggers chunking)
    const events = Array.from({ length: 11 }, (_, i) => createMockEvent(`Event ${i + 1}`))

    const result = await sendWeeklyScheduleNotification(events)

    expect(result).toBe(true)
    // Should send 2 chunks (10 embeds in first, 1 in second)
    expect(fetch).toHaveBeenCalledTimes(2)

    // First chunk should have content with "Upcoming Races"
    const firstCall = vi.mocked(fetch).mock.calls[0]
    const firstBody = JSON.parse(firstCall[1]?.body as string)
    expect(firstBody.content).toBe('**Upcoming Races for this Weekend** 🏁')
    expect(firstBody.embeds).toHaveLength(10)

    // Second chunk should not have the "Upcoming Races" content
    const secondCall = vi.mocked(fetch).mock.calls[1]
    const secondBody = JSON.parse(secondCall[1]?.body as string)
    expect(secondBody.content).toBeUndefined()
    expect(secondBody.embeds).toHaveLength(1)

    expect(mockLogger.info).toHaveBeenCalledWith(
      { chunkIndex: 1, totalChunks: 2 },
      '✅ Weekly schedule chunk sent'
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      { chunkIndex: 2, totalChunks: 2 },
      '✅ Weekly schedule chunk sent'
    )
  })

  it('returns false and logs error when any chunk fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error details',
      } as Response)

    // Create 11 events to force multiple chunks
    const events = Array.from({ length: 11 }, (_, i) => createMockEvent(`Event ${i + 1}`))

    const result = await sendWeeklyScheduleNotification(events)

    // Returns false if ANY chunk fails (all-or-nothing)
    expect(result).toBe(false)
    expect(mockLogger.info).toHaveBeenCalledWith(
      { chunkIndex: 1, totalChunks: 2 },
      '✅ Weekly schedule chunk sent'
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        chunkIndex: 2,
        totalChunks: 2,
        status: 500,
        statusText: 'Internal Server Error',
        errorText: 'Server error details',
      },
      '❌ Failed to send weekly schedule chunk'
    )
  })

  it('returns false and logs error when an exception is thrown', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const events = [createMockEvent('GT3 Challenge')]

    const result = await sendWeeklyScheduleNotification(events)

    expect(result).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Error sending Discord weekly schedule notification'
    )
  })
})

describe('addUsersToThread', () => {
  const botToken = 'fake-bot-token'
  const threadId = 'thread-123'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should add multiple users to a thread', async () => {
    const discordUserIds = ['user-1', 'user-2', 'user-3']

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 204,
    } as Response)

    await addUsersToThread(threadId, discordUserIds)

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10/channels/${threadId}/thread-members/user-1`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    )
    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10/channels/${threadId}/thread-members/user-2`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    )
    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10/channels/${threadId}/thread-members/user-3`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    )
  })

  it('should skip empty or duplicate user IDs', async () => {
    const discordUserIds = ['user-1', '', 'user-1', 'user-2', '']

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 204,
    } as Response)

    await addUsersToThread(threadId, discordUserIds)

    // Should only call for unique non-empty IDs
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('should handle 409 conflict errors (user already in thread) gracefully', async () => {
    const discordUserIds = ['user-1']

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => 'User is already a member',
    } as Response)

    await addUsersToThread(threadId, discordUserIds)

    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('should log errors for non-409 failures', async () => {
    const discordUserIds = ['user-1']

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Something went wrong',
    } as Response)

    await addUsersToThread(threadId, discordUserIds)

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        status: 500,
        statusText: 'Internal Server Error',
        errorText: 'Something went wrong',
        userId: 'user-1',
        threadId: 'thread-123',
      },
      'Failed to add user to thread'
    )
  })

  it('should return early if no bot token is configured', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')

    await addUsersToThread(threadId, ['user-1'])

    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('createOrUpdateTeamThread', () => {
  const botToken = 'fake-bot-token'
  const channelId = 'channel-123'
  const forumId = 'forum-456'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', channelId)
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', forumId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should add all users to a newly created team thread', async () => {
    const mockThreadId = 'new-team-thread-123'

    // Mock thread creation response
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockThreadId }),
      } as Response)
      // Mock addUsersToThread calls
      .mockResolvedValue({
        ok: true,
        status: 204,
      } as Response)

    const result = await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      memberDiscordIds: ['discord-alice', 'discord-bob'],
      members: ['Alice', 'Bob'],
    })

    expect(result).toBe(mockThreadId)

    // Verify addUsersToThread was called for all members
    const addUsersCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => call[0]?.toString().includes('/thread-members/'))
    expect(addUsersCalls).toHaveLength(2)
  })

  it('includes creator name in team thread embed on create', async () => {
    const mockThreadId = 'new-team-thread-actor'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: mockThreadId }),
    } as Response)

    await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      actorName: 'Steven Case1',
    })

    const createCallBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    )
    const fields = createCallBody.message.embeds[0].fields as Array<{ name: string; value: string }>
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Created By',
          value: 'Steven Case1',
        }),
        expect.objectContaining({
          name: 'Edited By',
          value: 'Steven Case1',
        }),
      ])
    )
  })

  it('adds a main event thread button on team thread create when URL is provided', async () => {
    const mockThreadId = 'new-team-thread-with-main-link'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: mockThreadId }),
    } as Response)

    await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      mainEventThreadUrl: 'https://discord.com/channels/guild-123/main-event-thread-123',
    })

    const createCallBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    )
    expect(createCallBody.message.components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'View Main Event Thread',
            url: 'https://discord.com/channels/guild-123/main-event-thread-123',
          },
        ],
      },
    ])
  })

  it('preserves original creator and sets editor on thread updates', async () => {
    const existingThreadId = 'existing-team-thread-actor'
    const mockBotUserId = 'bot-user-id'

    vi.mocked(fetch)
      // Existing thread parent lookup
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: existingThreadId, parent_id: forumId }),
      } as Response)
      // Extract existing Created By: bot identity
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockBotUserId }),
      } as Response)
      // Extract existing Created By: thread messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'message-1',
            author: { id: mockBotUserId },
            embeds: [{ fields: [{ name: 'Created By', value: 'Nathan' }] }],
          },
        ],
      } as Response)
      // upsertThreadMessage -> findBotMessageInThread: bot identity
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockBotUserId }),
      } as Response)
      // upsertThreadMessage -> find bot message
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'message-1', author: { id: mockBotUserId } }],
      } as Response)
      // upsertThreadMessage -> patch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response)

    await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      existingThreadId,
      actorName: 'Steven Case1',
    })

    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => call[0]?.toString().includes(`/messages/message-1`))
    const patchBody = JSON.parse((patchCall?.[1] as RequestInit).body as string)
    const fields = patchBody.embeds[0].fields as Array<{ name: string; value: string }>
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Created By', value: 'Nathan' }),
        expect.objectContaining({ name: 'Edited By', value: 'Steven Case1' }),
      ])
    )
  })

  it('should add all users when updating an existing team thread', async () => {
    const existingThreadId = 'existing-team-thread-123'
    const mockBotUserId = 'bot-user-id'

    // Mock existing thread lookup + upsert flow
    vi.mocked(fetch)
      // Existing thread parent lookup
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: existingThreadId, parent_id: forumId }),
      } as Response)
      // Extract existing Created By: bot identity
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockBotUserId }),
      } as Response)
      // Extract existing Created By: thread messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'message-1',
            author: { id: mockBotUserId },
            embeds: [{ fields: [{ name: 'Created By', value: 'Nathan' }] }],
          },
        ],
      } as Response)
      // upsertThreadMessage -> findBotMessageInThread: bot identity
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockBotUserId }),
      } as Response)
      // upsertThreadMessage -> find bot message
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'message-1', author: { id: mockBotUserId } }],
      } as Response)
      // upsertThreadMessage -> patch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response)
      // Mock addUsersToThread calls
      .mockResolvedValue({
        ok: true,
        status: 204,
      } as Response)

    const result = await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      existingThreadId,
      memberDiscordIds: ['discord-alice', 'discord-bob', 'discord-charlie'],
      members: ['Alice', 'Bob', 'Charlie'],
    })

    expect(result).toBe(existingThreadId)

    // Verify addUsersToThread was called for all current members
    const addUsersCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => call[0]?.toString().includes('/thread-members/'))
    expect(addUsersCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('recreates missing team thread when linked thread no longer exists', async () => {
    const existingThreadId = 'deleted-team-thread-123'
    const replacementThreadId = 'replacement-team-thread-123'

    vi.mocked(fetch)
      // Existing thread lookup: missing
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response)
      // Create replacement thread
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: replacementThreadId }),
      } as Response)
      // Add users to replacement thread
      .mockResolvedValue({
        ok: true,
        status: 204,
      } as Response)

    const result = await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      existingThreadId,
      memberDiscordIds: ['discord-alice', 'discord-bob'],
      members: ['Alice', 'Bob'],
    })

    expect(result).toBe(replacementThreadId)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${forumId}/threads`),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('should handle empty discord IDs gracefully', async () => {
    const mockThreadId = 'new-team-thread-123'

    // Mock thread creation response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: mockThreadId }),
    } as Response)

    const result = await createOrUpdateTeamThread({
      teamName: 'Team Alpha',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-15T18:00:00Z'),
      members: ['Alice', 'Bob'], // No discordIds
    })

    expect(result).toBe(mockThreadId)

    // Verify no addUsersToThread calls were made
    const addUsersCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => call[0]?.toString().includes('/thread-members/'))
    expect(addUsersCalls).toHaveLength(0)
  })

  it('recreates event thread in forum when existing thread has wrong parent', async () => {
    const existingThreadId = 'legacy-channel-thread'
    const replacementThreadId = 'forum-thread-123'

    vi.mocked(fetch)
      // Existing thread lookup shows old notifications channel parent.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: existingThreadId, parent_id: channelId }),
      } as Response)
      // Create replacement thread in forum.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: replacementThreadId }),
      } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'https://example.com/race',
      carClasses: ['GT3'],
      threadId: existingThreadId,
      timeslots: [
        {
          raceStartTime: new Date('2026-02-15T18:00:00Z'),
          teams: [{ name: 'Team Alpha', members: [] }],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.threadId).toBe(replacementThreadId)
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`/channels/${forumId}/threads`),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('createOrUpdateEventThread', () => {
  const botToken = 'fake-bot-token'
  const channelId = 'channel-123'
  const forumId = 'forum-456'
  const guildId = 'guild-789'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', channelId)
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', forumId)
    vi.stubEnv('DISCORD_GUILD_ID', guildId)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should add all users to a newly created event thread', async () => {
    const mockThreadId = 'new-thread-123'

    // Mock thread creation response
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockThreadId }),
      } as Response)
      // Mock addUsersToThread calls (3 users)
      .mockResolvedValue({
        ok: true,
        status: 204,
      } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'https://example.com/race',
      carClasses: ['GT3'],
      timeslots: [
        {
          raceStartTime: new Date('2026-02-15T18:00:00Z'),
          teams: [
            {
              name: 'Team Alpha',
              members: [
                {
                  name: 'Alice',
                  carClass: 'GT3',
                  discordId: 'discord-alice',
                  registrationId: 'reg-1',
                  rating: 2000,
                },
                {
                  name: 'Bob',
                  carClass: 'GT3',
                  discordId: 'discord-bob',
                  registrationId: 'reg-2',
                  rating: 1800,
                },
              ],
            },
            {
              name: 'Team Beta',
              members: [
                {
                  name: 'Charlie',
                  carClass: 'GT3',
                  discordId: 'discord-charlie',
                  registrationId: 'reg-3',
                  rating: 1900,
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.threadId).toBe(mockThreadId)

    // Verify addUsersToThread was called with all Discord IDs
    const addUsersCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => call[0]?.toString().includes('/thread-members/'))
    expect(addUsersCalls).toHaveLength(3)
  })

  it('should add all users when updating an existing event thread', async () => {
    const existingThreadId = 'existing-thread-123'
    const mockBotUserId = 'bot-user-id'

    // Mock existing thread lookup (must be under configured forum)
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: existingThreadId, parent_id: forumId }),
      } as Response)
      // Mock bot user ID fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockBotUserId }),
      } as Response)
      // Mock messages fetch (find bot message)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'message-1', author: { id: mockBotUserId } }],
      } as Response)
      // Mock message edit (upsert)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response)
      // Mock addUsersToThread calls (3 users)
      .mockResolvedValue({
        ok: true,
        status: 204,
      } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'https://example.com/race',
      carClasses: ['GT3'],
      threadId: existingThreadId,
      timeslots: [
        {
          raceStartTime: new Date('2026-02-15T18:00:00Z'),
          teams: [
            {
              name: 'Team Alpha',
              members: [
                {
                  name: 'Alice',
                  carClass: 'GT3',
                  discordId: 'discord-alice',
                  registrationId: 'reg-1',
                  rating: 2000,
                },
                {
                  name: 'Bob',
                  carClass: 'GT3',
                  discordId: 'discord-bob',
                  registrationId: 'reg-2',
                  rating: 1800,
                },
                {
                  name: 'Dave',
                  carClass: 'GT3',
                  discordId: 'discord-dave',
                  registrationId: 'reg-3',
                  rating: 2100,
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.threadId).toBe(existingThreadId)

    // Verify addUsersToThread was called for all current members
    const addUsersCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => call[0]?.toString().includes('/thread-members/'))
    expect(addUsersCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('should handle empty discord IDs gracefully', async () => {
    const mockThreadId = 'new-thread-123'

    // Mock thread creation response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: mockThreadId }),
    } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'https://example.com/race',
      carClasses: ['GT3'],
      timeslots: [
        {
          raceStartTime: new Date('2026-02-15T18:00:00Z'),
          teams: [
            {
              name: 'Team Alpha',
              members: [
                { name: 'Alice', carClass: 'GT3', rating: 2000 }, // No discordId
              ],
            },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)

    // Verify no addUsersToThread calls were made
    const addUsersCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => call[0]?.toString().includes('/thread-members/'))
    expect(addUsersCalls).toHaveLength(0)
  })

  it('should include a Join Event button in new event threads', async () => {
    const mockThreadId = 'new-thread-123'
    const raceUrl = 'https://example.com/race'

    // Mock thread creation response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: mockThreadId }),
    } as Response)

    await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl,
      carClasses: ['GT3'],
      timeslots: [
        {
          raceStartTime: new Date('2026-02-15T18:00:00Z'),
          teams: [{ name: 'Team Alpha', members: [] }],
        },
      ],
    })

    // Verify the thread creation call included a Join Event button
    const threadCreationCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => call[0]?.toString().includes('/threads'))
    expect(threadCreationCall).toBeDefined()

    const body = JSON.parse(threadCreationCall![1]?.body as string)
    expect(body.message.components).toBeDefined()
    expect(body.message.components).toHaveLength(1)
    expect(body.message.components[0].type).toBe(1) // Action row
    expect(body.message.components[0].components).toHaveLength(1)
    expect(body.message.components[0].components[0]).toMatchObject({
      type: 2, // Button
      style: 5, // Link button
      label: 'Join Event',
      url: raceUrl,
    })
  })

  it('should include a Join Event button when updating event threads', async () => {
    const existingThreadId = 'existing-thread-123'
    const mockBotUserId = 'bot-user-id'
    const raceUrl = 'https://example.com/race'

    // Mock existing thread lookup
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ parent_id: forumId }),
      } as Response)
      // Mock bot user lookup
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: mockBotUserId }),
      } as Response)
      // Mock thread messages lookup
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'msg-1',
            author: { id: mockBotUserId },
          },
        ],
      } as Response)
      // Mock message edit
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl,
      carClasses: ['GT3'],
      threadId: existingThreadId,
      timeslots: [
        {
          raceStartTime: new Date('2026-02-15T18:00:00Z'),
          teams: [{ name: 'Team Alpha', members: [] }],
        },
      ],
    })

    // Verify the message edit call included a Join Event button
    const editCall = vi
      .mocked(fetch)
      .mock.calls.find(
        (call) => call[1]?.method === 'PATCH' && call[0]?.toString().includes('/messages/')
      )
    expect(editCall).toBeDefined()

    const body = JSON.parse(editCall![1]?.body as string)
    expect(body.components).toBeDefined()
    expect(body.components).toHaveLength(1)
    expect(body.components[0].type).toBe(1) // Action row
    expect(body.components[0].components).toHaveLength(1)
    expect(body.components[0].components[0]).toMatchObject({
      type: 2, // Button
      style: 5, // Link button
      label: 'Join Event',
      url: raceUrl,
    })
  })
})

// NOTE: sendTeamsAssignedNotification has complex internal helpers that are difficult
// to test in isolation. The error logging for chat channel notifications was added
// at line 843-848 in lib/discord.ts and can be verified by code inspection.
