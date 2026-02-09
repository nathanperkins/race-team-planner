import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkGuildMembership,
  GuildMembershipStatus,
  verifyBotToken,
  verifyGuildAccess,
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
