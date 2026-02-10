import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldRefreshUser,
  refreshUserData,
  syncDiscordProfile,
  verifyGuildMembership,
} from './auth-service'
import { CURRENT_EXPECTATIONS_VERSION, SESSION_VERSION } from '@/lib/config'
import prisma from '@/lib/prisma'
import { UserRole } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/discord', () => ({
  checkGuildMembership: vi.fn(),
  GuildMembershipStatus: {
    MEMBER: 'member',
    NOT_MEMBER: 'access_denied_guild_membership',
  },
}))

describe('auth-service', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('shouldRefreshUser', () => {
    const validToken = {
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

      const { checkGuildMembership } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        roles: ['role-admin-1'],
        nick: 'DiscordNick',
      } as any)

      vi.mocked(prisma.user.update).mockResolvedValue({ id: userId } as any)

      await syncDiscordProfile(userId, profile)

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

      const { checkGuildMembership } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        roles: ['some-other-role'],
        nick: null,
      } as any)

      await syncDiscordProfile(userId, profile)

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.USER,
          }),
        })
      )
    })
  })

  describe('verifyGuildMembership', () => {
    it('returns true if user is a member', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.MEMBER,
      } as any)

      const result = await verifyGuildMembership('discord-123')
      expect(result).toBe(true)
    })

    it('returns redirect path if user is not a member', async () => {
      const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
      vi.mocked(checkGuildMembership).mockResolvedValue({
        status: GuildMembershipStatus.NOT_MEMBER,
      } as any)

      const result = await verifyGuildMembership('discord-123')
      expect(result).toBe(`/not-found?error=${GuildMembershipStatus.NOT_MEMBER}`)
    })
  })
})
