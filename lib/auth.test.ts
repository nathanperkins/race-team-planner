import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { verifyGuildMembership, syncDiscordProfile } from './services/auth-service'

let capturedConfig: any

vi.mock('next-auth', () => ({
  default: vi.fn((config: any) => {
    capturedConfig = config
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
  }),
}))

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({})),
}))

vi.mock('@/lib/prisma', () => ({ default: {} }))

vi.mock('@/lib/config', () => ({
  features: { mockAuth: false, discordAuth: true },
  SESSION_VERSION: 1,
}))

vi.mock('./auth.config', () => ({
  authConfig: { providers: [], callbacks: {} },
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(() => ({ id: 'credentials' })),
}))

vi.mock('./services/auth-service', () => ({
  verifyGuildMembership: vi.fn(),
  shouldRefreshUser: vi.fn(() => false),
  refreshUserData: vi.fn(),
  syncDiscordProfile: vi.fn(),
}))

beforeAll(async () => {
  await import('./auth')
})

describe('auth', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('signIn callback', () => {
    it('allows credentials provider through without a Discord check', async () => {
      const result = await capturedConfig.callbacks.signIn({
        account: { provider: 'credentials' },
        profile: null,
      })
      expect(result).toBe(true)
      expect(verifyGuildMembership).not.toHaveBeenCalled()
    })

    it('blocks discord sign-in when profile ID is missing', async () => {
      const result = await capturedConfig.callbacks.signIn({
        account: { provider: 'discord' },
        profile: null,
      })
      expect(result).toBe(false)
      expect(verifyGuildMembership).not.toHaveBeenCalled()
    })

    it('returns redirect URL when membership check denies access', async () => {
      vi.mocked(verifyGuildMembership).mockResolvedValue({
        granted: false,
        redirectUrl: '/not-found?error=access_denied_guild_membership',
      })

      const result = await capturedConfig.callbacks.signIn({
        account: { provider: 'discord' },
        profile: { id: 'discord-denied' },
      })

      expect(result).toBe('/not-found?error=access_denied_guild_membership')
    })

    it('returns true when membership check grants access', async () => {
      vi.mocked(verifyGuildMembership).mockResolvedValue({
        granted: true,
        data: { status: 'member', roles: [], nick: 'Nick' } as any,
      })

      const result = await capturedConfig.callbacks.signIn({
        account: { provider: 'discord' },
        profile: { id: 'discord-granted' },
      })

      expect(result).toBe(true)
    })

    it('returns redirect URL for CONFIG_ERROR', async () => {
      vi.mocked(verifyGuildMembership).mockResolvedValue({
        granted: false,
        redirectUrl: '/not-found?error=config_error',
      })

      const result = await capturedConfig.callbacks.signIn({
        account: { provider: 'discord' },
        profile: { id: 'discord-config-error' },
      })

      expect(result).toBe('/not-found?error=config_error')
    })
  })

  describe('events.signIn', () => {
    it('does not sync profile for non-discord providers', async () => {
      await capturedConfig.events.signIn({
        user: { id: 'user-123', email: 'a@b.com' },
        account: { provider: 'credentials' },
        profile: {},
      })
      expect(syncDiscordProfile).not.toHaveBeenCalled()
    })

    it('passes membership data from signIn callback to syncDiscordProfile', async () => {
      const membershipData = { status: 'member', roles: [], nick: 'Nick' }
      vi.mocked(verifyGuildMembership).mockResolvedValue({
        granted: true,
        data: membershipData as any,
      })

      await capturedConfig.callbacks.signIn({
        account: { provider: 'discord' },
        profile: { id: 'discord-with-pending' },
      })
      await capturedConfig.events.signIn({
        user: { id: 'user-123', email: 'a@b.com' },
        account: { provider: 'discord' },
        profile: { id: 'discord-with-pending' },
      })

      expect(syncDiscordProfile).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ id: 'discord-with-pending' }),
        membershipData
      )
    })

    it('passes undefined to syncDiscordProfile when no pending membership exists', async () => {
      await capturedConfig.events.signIn({
        user: { id: 'user-123', email: 'a@b.com' },
        account: { provider: 'discord' },
        profile: { id: 'discord-no-pending' },
      })

      expect(syncDiscordProfile).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ id: 'discord-no-pending' }),
        undefined
      )
    })

    it('does not sync profile when user.id is missing', async () => {
      await capturedConfig.events.signIn({
        user: { id: undefined, email: 'a@b.com' },
        account: { provider: 'discord' },
        profile: { id: 'discord-no-user-id' },
      })
      expect(syncDiscordProfile).not.toHaveBeenCalled()
    })

    it('swallows errors from syncDiscordProfile so sign-in still succeeds', async () => {
      vi.mocked(syncDiscordProfile).mockRejectedValue(new Error('Discord API down'))

      await expect(
        capturedConfig.events.signIn({
          user: { id: 'user-123', email: 'a@b.com' },
          account: { provider: 'discord' },
          profile: { id: 'discord-error' },
        })
      ).resolves.toBeUndefined()
    })

    it('passes undefined to syncDiscordProfile when pending membership has expired', async () => {
      vi.useFakeTimers()
      vi.mocked(verifyGuildMembership).mockResolvedValue({
        granted: true,
        data: { status: 'member', roles: [], nick: 'Nick' } as any,
      })

      await capturedConfig.callbacks.signIn({
        account: { provider: 'discord' },
        profile: { id: 'discord-expired' },
      })
      vi.advanceTimersByTime(61_000)
      await capturedConfig.events.signIn({
        user: { id: 'user-123', email: 'a@b.com' },
        account: { provider: 'discord' },
        profile: { id: 'discord-expired' },
      })

      expect(syncDiscordProfile).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ id: 'discord-expired' }),
        undefined
      )
    })
  })
})
