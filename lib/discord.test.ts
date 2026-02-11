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
} from './discord'

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
  const data = {
    userName: 'Alice',
    eventName: 'GT3 Challenge',
    raceStartTime: new Date('2024-05-01T20:00:00Z'),
    carClassName: 'GT3',
    eventUrl: 'http://example.com',
    discordUser: { id: '123', name: 'alice' },
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
    vi.mocked(fetch).mockResolvedValueOnce({
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

  it('posts to both notification channel and event thread when threadId is provided', async () => {
    const withThread = { ...data, threadId: 'event-thread-123' }
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const result = await sendRegistrationNotification(withThread)

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
