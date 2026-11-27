import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  clearRevalidationCache,
  resolveRoleFromDiscordRoles,
  revalidateDiscordAccess,
  shouldRevalidateAccess,
  shouldRefreshUser,
  refreshUserData,
  syncDiscordProfile,
  verifyGuildMembership,
} from './auth-service'
import {
  ACCESS_TOKEN_MAX_AGE_MS,
  CURRENT_EXPECTATIONS_VERSION,
  SESSION_VERSION,
  features,
} from '@/lib/config'
import prisma from '@/lib/prisma'
import { UserRole } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/discord', () => ({
  checkGuildMembership: vi.fn(),
  GuildMembershipStatus: {
    MEMBER: 'member',
    NOT_MEMBER: 'access_denied_guild_membership',
    API_ERROR: 'api_error',
    CONFIG_ERROR: 'config_error',
  },
}))

describe('auth-service', () => {
  afterEach(() => {
    ;(features as { mockAuth: boolean }).mockAuth = false
    clearRevalidationCache()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  describe('shouldRefreshUser', () => {
    const validToken = {
      role: UserRole.USER,
      version: SESSION_VERSION,
      expectationsVersion: CURRENT_EXPECTATIONS_VERSION,
      iracingCustomerId: 12345,
      lastChecked: Date.now(),
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('returns true if trigger is provided', () => {
      expect(shouldRefreshUser(validToken, 'signIn')).toBe(true)
      expect(shouldRefreshUser(validToken, 'update')).toBe(true)
    })

    it('returns true if version is outdated', () => {
      const outdatedToken = { ...validToken, version: SESSION_VERSION - 1 }
      expect(shouldRefreshUser(outdatedToken)).toBe(true)
    })

    it('returns true if expectationsVersion is outdated', () => {
      const outdatedToken = { ...validToken, expectationsVersion: CURRENT_EXPECTATIONS_VERSION - 1 }
      expect(shouldRefreshUser(outdatedToken)).toBe(true)
    })

    it('returns true if iracingCustomerId is missing', () => {
      const missingToken = { ...validToken, iracingCustomerId: null }
      expect(shouldRefreshUser(missingToken as any)).toBe(true)
    })

    it('returns true if lastChecked is older than 5 minutes', () => {
      const now = Date.now()
      const oldToken = { ...validToken, lastChecked: now - 6 * 60 * 1000 }
      vi.setSystemTime(now)
      expect(shouldRefreshUser(oldToken)).toBe(true)
    })

    it('returns false if token is up to date and recently checked', () => {
      const now = Date.now()
      const freshToken = { ...validToken, lastChecked: now - 2 * 60 * 1000 }
      vi.setSystemTime(now)
      expect(shouldRefreshUser(freshToken)).toBe(false)
    })
  })

  describe('refreshUserData', () => {
    it('calls prisma.user.findUnique', async () => {
      const mockUser = {
        role: UserRole.USER,
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      }
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const result = await refreshUserData('user-123')
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { role: true, iracingCustomerId: true, expectationsVersion: true },
      })
      expect(result).toEqual(mockUser)
    })
  })

  describe('syncDiscordProfile', () => {
    it('updates user with discord info and makes user admin if they have admin roles', async () => {
      const userId = 'user-123'
      const profile = { id: 'discord-123', name: 'DiscordName', avatar: 'avatar-url' }
      vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', 'role-admin-1,role-admin-2')

      const { GuildMembershipStatus } = await import('@/lib/discord')
      const membershipData = {
        status: GuildMembershipStatus.MEMBER,
        roles: ['role-admin-1'],
        nick: 'DiscordNick',
      } as any

      vi.mocked(prisma.user.update).mockResolvedValue({ id: userId } as any)

      await syncDiscordProfile(userId, profile, membershipData)

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          role: UserRole.ADMIN,
          name: 'DiscordNick',
          image: 'avatar-url',
        },
      })

      vi.unstubAllEnvs()
    })

    it('sets role to USER if user does not have admin roles', async () => {
      const userId = 'user-123'
      const profile = { id: 'discord-123', name: 'DiscordName' }

      const { GuildMembershipStatus } = await import('@/lib/discord')
      const membershipData = {
        status: GuildMembershipStatus.MEMBER,
        roles: ['some-other-role'],
        nick: null,
      } as any

      await syncDiscordProfile(userId, profile, membershipData)

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.USER,
          }),
        })
      )
    })

    it('does not update name when membershipData has API_ERROR status', async () => {
      const userId = 'user-123'
      const profile = { id: 'discord-123', name: 'GlobalDisplayName' }

      const { GuildMembershipStatus } = await import('@/lib/discord')
      const membershipData = { status: GuildMembershipStatus.API_ERROR } as any

      vi.mocked(prisma.user.update).mockResolvedValue({ id: userId } as any)

      await syncDiscordProfile(userId, profile, membershipData)

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0]
      expect(updateCall[0].data).not.toHaveProperty('name')
    })

    it('does not update name when membershipData has CONFIG_ERROR status', async () => {
      const userId = 'user-123'
      const profile = { id: 'discord-123', name: 'GlobalDisplayName' }

      const { GuildMembershipStatus } = await import('@/lib/discord')
      const membershipData = { status: GuildMembershipStatus.CONFIG_ERROR } as any

      vi.mocked(prisma.user.update).mockResolvedValue({ id: userId } as any)

      await syncDiscordProfile(userId, profile, membershipData)

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0]
      expect(updateCall[0].data).not.toHaveProperty('name')
    })

    it('falls back to calling checkGuildMembership when no membershipData is provided', async () => {
      const userId = 'user-123'
      const profile = { id: 'discord-123', name: 'DiscordName' }

      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'FetchedNick',
      } as any)
      vi.mocked(prisma.user.update).mockResolvedValue({ id: userId } as any)

      await syncDiscordProfile(userId, profile)

      expect(checkGuildMembership).toHaveBeenCalledWith('discord-123')
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'FetchedNick' }),
        })
      )
    })
  })

  describe('verifyGuildMembership', () => {
    it('returns granted:true with membership data if user is a member', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      const mockResult = { status: GuildMembershipStatus.MEMBER, roles: [], nick: 'Nick' }
      vi.mocked(checkGuildMembership).mockResolvedValue(mockResult as any)

      const result = await verifyGuildMembership('discord-123')
      expect(result).toEqual({ granted: true, data: mockResult })
    })

    it('returns granted:false with redirect path if user is not a member', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.NOT_MEMBER,
      } as any)

      const result = await verifyGuildMembership('discord-123')
      expect(result).toEqual({
        granted: false,
        redirectUrl: `/not-found?error=${GuildMembershipStatus.NOT_MEMBER}`,
      })
    })

    it('returns granted:false with redirect path on API_ERROR', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.API_ERROR,
      } as any)

      const result = await verifyGuildMembership('discord-123')
      expect(result).toEqual({
        granted: false,
        redirectUrl: `/not-found?error=${GuildMembershipStatus.API_ERROR}`,
      })
    })

    it('returns granted:false with redirect path on CONFIG_ERROR', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.CONFIG_ERROR,
      } as any)

      const result = await verifyGuildMembership('discord-123')
      expect(result).toEqual({
        granted: false,
        redirectUrl: `/not-found?error=${GuildMembershipStatus.CONFIG_ERROR}`,
      })
    })
  })

  describe('resolveRoleFromDiscordRoles', () => {
    it('returns ADMIN when any role matches DISCORD_ADMIN_ROLE_IDS and USER otherwise', () => {
      vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', 'role-admin-1, role-admin-2')
      expect(resolveRoleFromDiscordRoles(['role-admin-2'])).toBe(UserRole.ADMIN)
      expect(resolveRoleFromDiscordRoles(['role-other'])).toBe(UserRole.USER)
      expect(resolveRoleFromDiscordRoles([])).toBe(UserRole.USER)
    })

    it('returns USER when DISCORD_ADMIN_ROLE_IDS is empty even if roles contains empty string', () => {
      vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', '')
      expect(resolveRoleFromDiscordRoles([''])).toBe(UserRole.USER)
    })
  })

  describe('shouldRevalidateAccess', () => {
    const baseToken = {
      id: 'user-1',
      role: UserRole.USER,
      version: SESSION_VERSION,
      expectationsVersion: CURRENT_EXPECTATIONS_VERSION,
      provider: 'discord',
      discordId: 'discord-123',
      accessVerifiedAt: Date.now(),
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('returns false for credentials (Mock Auth) provider only when mockAuth is enabled', () => {
      ;(features as { mockAuth: boolean }).mockAuth = true
      expect(
        shouldRevalidateAccess({
          ...baseToken,
          provider: 'credentials',
          accessVerifiedAt: 0,
        })
      ).toBe(false)
    })

    it('revalidates credentials provider tokens when mockAuth is disabled (production fail-closed)', () => {
      ;(features as { mockAuth: boolean }).mockAuth = false
      expect(
        shouldRevalidateAccess({
          ...baseToken,
          provider: 'credentials',
          accessVerifiedAt: 0,
        })
      ).toBe(true)
    })

    it('returns false on signIn and signUp triggers', () => {
      expect(shouldRevalidateAccess({ ...baseToken, accessVerifiedAt: 0 }, 'signIn')).toBe(false)
      expect(shouldRevalidateAccess({ ...baseToken, accessVerifiedAt: 0 }, 'signUp')).toBe(false)
    })

    it('returns true when accessVerifiedAt is missing, zero, or NaN', () => {
      expect(shouldRevalidateAccess({ ...baseToken, accessVerifiedAt: undefined })).toBe(true)
      expect(shouldRevalidateAccess({ ...baseToken, accessVerifiedAt: 0 })).toBe(true)
      expect(shouldRevalidateAccess({ ...baseToken, accessVerifiedAt: Number.NaN })).toBe(true)
    })

    it('returns false when last verified less than 1 hour ago', () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)
      expect(
        shouldRevalidateAccess({
          ...baseToken,
          accessVerifiedAt: now - (ACCESS_TOKEN_MAX_AGE_MS - 60_000),
        })
      ).toBe(false)
    })

    it('returns true when last verified 1 hour or more ago', () => {
      const now = 1_700_000_000_000
      vi.setSystemTime(now)
      expect(
        shouldRevalidateAccess({
          ...baseToken,
          accessVerifiedAt: now - ACCESS_TOKEN_MAX_AGE_MS,
        })
      ).toBe(true)
    })
  })

  describe('revalidateDiscordAccess', () => {
    it('promotes USER to ADMIN in DB when Discord admin role is added', async () => {
      vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', 'role-admin-1')
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: ['role-admin-1'],
        nick: 'DriverOne',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.USER,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        role: UserRole.ADMIN,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      const result = await revalidateDiscordAccess('user-1', 'discord-123')

      expect(result.status).toBe('valid')
      if (result.status === 'valid') {
        expect(result.user.role).toBe(UserRole.ADMIN)
        expect(result.user.name).toBe('DriverOne')
        expect(result.discordId).toBe('discord-123')
      }
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: UserRole.ADMIN },
        select: { role: true, name: true, iracingCustomerId: true, expectationsVersion: true },
      })
    })

    it('demotes ADMIN to USER when Discord admin role is removed', async () => {
      vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', 'role-admin-1')
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: ['role-regular'],
        nick: 'DriverOne',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.ADMIN,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        role: UserRole.USER,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      const result = await revalidateDiscordAccess('user-1', 'discord-123')

      expect(result.status).toBe('valid')
      if (result.status === 'valid') {
        expect(result.user.role).toBe(UserRole.USER)
      }
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: UserRole.USER },
        select: { role: true, name: true, iracingCustomerId: true, expectationsVersion: true },
      })
    })

    it('updates nickname in DB and returns updated name when only Discord nick changed', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'NewNick',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.USER,
        name: 'OldNick',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        role: UserRole.USER,
        name: 'NewNick',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      const result = await revalidateDiscordAccess('user-nick', 'discord-nick')

      expect(result.status).toBe('valid')
      if (result.status === 'valid') {
        expect(result.user.name).toBe('NewNick')
      }
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-nick' },
        data: { name: 'NewNick' },
        select: { role: true, name: true, iracingCustomerId: true, expectationsVersion: true },
      })
    })

    it('skips DB update when role and nickname are unchanged', async () => {
      vi.stubEnv('DISCORD_ADMIN_ROLE_IDS', 'role-admin-1')
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'DriverOne',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.USER,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      const result = await revalidateDiscordAccess('user-1', 'discord-123')

      expect(result.status).toBe('valid')
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('looks up discordId from prisma.account when absent on legacy token', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        providerAccountId: 'discord-from-db',
      } as any)
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'DriverOne',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.USER,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      const result = await revalidateDiscordAccess('user-1')

      expect(checkGuildMembership).toHaveBeenCalledWith('discord-from-db')
      expect(result.status).toBe('valid')
    })

    it('returns skipped when user has no linked Discord account and mockAuth is enabled', async () => {
      ;(features as { mockAuth: boolean }).mockAuth = true
      vi.mocked(prisma.account.findFirst).mockResolvedValue(null)
      const { checkGuildMembership } = await import('@/lib/discord')

      const result = await revalidateDiscordAccess('mock-user-1')

      expect(result.status).toBe('skipped')
      expect(checkGuildMembership).not.toHaveBeenCalled()
    })

    it('revokes session when user has no linked Discord account and mockAuth is disabled (production)', async () => {
      ;(features as { mockAuth: boolean }).mockAuth = false
      vi.mocked(prisma.account.findFirst).mockResolvedValue(null)
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')

      const result = await revalidateDiscordAccess('orphan-user-1')

      expect(result).toEqual({
        status: 'revoked',
        reason: GuildMembershipStatus.NOT_MEMBER,
      })
      expect(checkGuildMembership).not.toHaveBeenCalled()
    })

    it('revokes session when Discord check succeeds but user no longer exists in DB', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'Ghost',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const result = await revalidateDiscordAccess('deleted-user', 'discord-deleted')

      expect(result).toEqual({
        status: 'revoked',
        reason: GuildMembershipStatus.NOT_MEMBER,
      })
    })

    it('revokes access when user is no longer a Discord guild member or Discord check fails', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.NOT_MEMBER,
      } as any)

      const revokedNotMember = await revalidateDiscordAccess('user-kicked', 'discord-kicked')
      expect(revokedNotMember).toEqual({
        status: 'revoked',
        reason: GuildMembershipStatus.NOT_MEMBER,
      })

      // Confirmed NOT_MEMBER is cached within the 60s window
      await revalidateDiscordAccess('user-kicked', 'discord-kicked')
      expect(checkGuildMembership).toHaveBeenCalledTimes(1)

      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.API_ERROR,
      } as any)
      const revokedApiErr = await revalidateDiscordAccess('user-api-err', 'discord-api-err')
      expect(revokedApiErr).toEqual({
        status: 'revoked',
        reason: GuildMembershipStatus.API_ERROR,
      })
    })

    it('deduplicates Discord API calls within 60s while still reading fresh DB user data', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'DriverOne',
      } as any)
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({
          role: UserRole.USER,
          name: 'DriverOne',
          iracingCustomerId: null,
          expectationsVersion: 0,
        } as any)
        .mockResolvedValueOnce({
          role: UserRole.USER,
          name: 'DriverOne',
          iracingCustomerId: null,
          expectationsVersion: 0,
        } as any)
        .mockResolvedValueOnce({
          role: UserRole.USER,
          name: 'DriverOne',
          iracingCustomerId: 98765,
          expectationsVersion: 1,
        } as any)

      const [first, second] = await Promise.all([
        revalidateDiscordAccess('user-dedup', 'discord-dedup'),
        revalidateDiscordAccess('user-dedup', 'discord-dedup'),
      ])
      const third = await revalidateDiscordAccess('user-dedup', 'discord-dedup')

      expect(first.status).toBe('valid')
      expect(second.status).toBe('valid')
      expect(third.status).toBe('valid')
      if (third.status === 'valid') {
        expect(third.user.iracingCustomerId).toBe(98765)
        expect(third.user.expectationsVersion).toBe(1)
      }
      expect(checkGuildMembership).toHaveBeenCalledTimes(1)
    })

    it('re-checks Discord after the 60s cache TTL expires and cleans up on syncDiscordProfile', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_700_000_000_000)

      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
        roles: [],
        nick: 'DriverOne',
      } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.USER,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      await revalidateDiscordAccess('user-ttl', 'discord-ttl')
      vi.advanceTimersByTime(61_000)
      await revalidateDiscordAccess('user-ttl', 'discord-ttl')
      expect(checkGuildMembership).toHaveBeenCalledTimes(2)

      // Fresh sign-in invalidates the 60s cache immediately
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user-ttl' } as any)
      await syncDiscordProfile(
        'user-ttl',
        { id: 'discord-ttl', name: 'DriverOne' },
        { status: GuildMembershipStatus.MEMBER, roles: [], nick: 'DriverOne' }
      )
      await revalidateDiscordAccess('user-ttl', 'discord-ttl')
      expect(checkGuildMembership).toHaveBeenCalledTimes(3)
    })

    it('does not cache transient API_ERROR or CONFIG_ERROR revocations and cleans up rejected in-flight calls', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership)
        .mockResolvedValueOnce({ status: GuildMembershipStatus.API_ERROR } as any)
        .mockResolvedValueOnce({ status: GuildMembershipStatus.CONFIG_ERROR } as any)
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValueOnce({
          status: GuildMembershipStatus.MEMBER,
          roles: [],
          nick: 'DriverOne',
        } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: UserRole.USER,
        name: 'DriverOne',
        iracingCustomerId: 12345,
        expectationsVersion: 1,
      } as any)

      const first = await revalidateDiscordAccess('user-transient', 'discord-transient')
      const second = await revalidateDiscordAccess('user-transient', 'discord-transient')
      await expect(revalidateDiscordAccess('user-transient', 'discord-transient')).rejects.toThrow(
        'network blip'
      )
      const fourth = await revalidateDiscordAccess('user-transient', 'discord-transient')

      expect(first).toEqual({ status: 'revoked', reason: GuildMembershipStatus.API_ERROR })
      expect(second).toEqual({ status: 'revoked', reason: GuildMembershipStatus.CONFIG_ERROR })
      expect(fourth.status).toBe('valid')
      expect(checkGuildMembership).toHaveBeenCalledTimes(4)
    })
  })
})
