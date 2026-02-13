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
} from './discord'
import type { WeeklyScheduleEvent } from './discord-utils'

describe('checkGuildMembership', () => {
  const userId = '123456789'
  const botToken = 'fake-bot-token'
  const guildId = 'fake-guild-id'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // Save original env
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.stubEnv('DISCORD_GUILD_ID', guildId)
    // Silence console during tests
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.warn).toHaveBeenCalledWith(
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
    expect(console.error).toHaveBeenCalled()
  })

  it('returns API_ERROR when fetch throws an error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))

    const result = await checkGuildMembership(userId)
    expect(result.status).toBe(GuildMembershipStatus.API_ERROR)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check Discord guild membership'),
      expect.any(Error)
    )
  })
})

describe('verifyBotToken', () => {
  const botToken = 'fake-bot-token'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', botToken)
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Discord Token Verification Failed: 401 Unauthorized'),
      'Invalid Token'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyBotToken()
    expect(result).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to connect to Discord API during verification:'),
      error
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Discord Guild Access Failed: 403 Forbidden'),
      'Missing Access'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyGuildAccess()
    expect(result).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to connect to Discord API during guild verification:'),
      error
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Discord Admin Role Verification Failed: 401')
    )
  })

  it('returns empty array and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyAdminRoles()
    expect(result).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Failed to connect to Discord API during role verification:'),
      error
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Discord Notifications Channel Access Failed: 403 Forbidden'),
      'Missing Permissions'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyNotificationsChannel()
    expect(result).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to connect to Discord API during channel verification:'),
      error
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Discord Events Forum Access Failed: 404 Not Found'),
      'Channel not found'
    )
  })

  it('returns null and logs error when fetch throws', async () => {
    const error = new Error('Network failure')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await verifyEventsForum()
    expect(result).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to connect to Discord API during forum verification:'),
      error
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
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
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'))
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to send Discord registration notification to thread event-thread-123'
      ),
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send Discord registration notification: 400 Bad Request'),
      'Error message'
    )
  })

  it('returns false and logs error when fetch throws', async () => {
    const error = new Error('Network fail')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await sendRegistrationNotification(data)
    expect(result).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error sending Discord registration notification:'),
      error
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
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
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'))
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send Discord onboarding notification: 403 Forbidden'),
      'Missing Permissions'
    )
  })

  it('returns false and logs error when fetch throws', async () => {
    const error = new Error('Network timeout')
    vi.mocked(fetch).mockRejectedValueOnce(error)

    const result = await sendOnboardingNotification(data)
    expect(result).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error sending Discord onboarding notification:'),
      error
    )
  })
})

describe('findBotMessageInThread', () => {
  const botToken = 'fake-bot-token'
  const threadId = 'thread-123'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
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
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to edit existing message msg-1'),
      expect.any(Error)
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
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create message in thread thread-123')
    )
  })
})

describe('postRosterChangeNotifications', () => {
  const botToken = 'fake-bot-token'
  const eventThreadId = 'event-thread-123'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('logs error when posting to thread fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error details',
    } as Response)

    const rosterChanges = [{ type: 'added' as const, driverName: 'Alice', teamName: 'Team One' }]

    await postRosterChangeNotifications(eventThreadId, rosterChanges, botToken, 'Admin User')

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to post roster changes'),
      expect.anything()
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
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
    expect(console.warn).toHaveBeenCalledWith(
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
    expect(console.warn).toHaveBeenCalledWith(
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
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Weekly schedule chunk 1/1 sent')
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

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Weekly schedule chunk 1/2 sent')
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Weekly schedule chunk 2/2 sent')
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
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Weekly schedule chunk 1/2 sent')
    )
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send weekly schedule chunk 2/2'),
      'Server error details'
    )
  })

  it('returns false and logs error when an exception is thrown', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const events = [createMockEvent('GT3 Challenge')]

    const result = await sendWeeklyScheduleNotification(events)

    expect(result).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      'Error sending Discord weekly schedule notification:',
      expect.any(Error)
    )
  })
})

// NOTE: sendTeamsAssignedNotification has complex internal helpers that are difficult
// to test in isolation. The error logging for chat channel notifications was added
// at line 843-848 in lib/discord.ts and can be verified by code inspection.
