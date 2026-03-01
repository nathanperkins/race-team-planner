import { describe, it, expect, vi, beforeEach } from 'vitest'
import { backfillDiscordNicknamesAction } from './actions'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

vi.mock('@/lib/prisma', () => ({
  default: {
    account: {
      findMany: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/discord', () => ({
  checkGuildMembership: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('backfillDiscordNicknamesAction', () => {
  const mockAdminSession = { user: { id: 'admin-1', role: 'ADMIN' } }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    // $transaction receives an array of promises and resolves them
    vi.mocked(prisma.$transaction).mockImplementation((ops: any) => Promise.all(ops))
  })

  it('returns unauthorized if session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const result = await backfillDiscordNicknamesAction()

    expect(result).toEqual({ success: false, message: 'Unauthorized' })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
  })

  it('returns unauthorized if user is not ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'USER' } } as any)

    const result = await backfillDiscordNicknamesAction()

    expect(result).toEqual({ success: false, message: 'Unauthorized' })
  })

  it('batches DB updates in a single transaction for users with outdated names', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { providerAccountId: 'discord-1', userId: 'user-1', user: { name: 'OldName' } },
      { providerAccountId: 'discord-2', userId: 'user-2', user: { name: null } },
      { providerAccountId: 'discord-3', userId: 'user-3', user: { name: 'RacerThree' } },
    ] as any)

    const { checkGuildMembership } = await import('@/lib/discord')
    vi.mocked(checkGuildMembership)
      .mockResolvedValueOnce({ status: 'member' as any, nick: 'RacerOne' }) // differs → update
      .mockResolvedValueOnce({ status: 'member' as any, nick: null }) // no nick → skip
      .mockResolvedValueOnce({ status: 'member' as any, nick: 'RacerThree' }) // already current → skip

    vi.mocked(prisma.user.update).mockResolvedValue({} as any)

    const result = await backfillDiscordNicknamesAction()

    // Only user-1 needs updating
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.update).toHaveBeenCalledTimes(1)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'RacerOne' },
    })
    expect(result).toEqual({
      success: true,
      message: 'Done. Updated: 1, Skipped (no nick or already current): 2, Failed: 0.',
    })
  })

  it('skips users whose name already matches their server nickname', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { providerAccountId: 'discord-1', userId: 'user-1', user: { name: 'RacerNick' } },
    ] as any)

    const { checkGuildMembership } = await import('@/lib/discord')
    vi.mocked(checkGuildMembership).mockResolvedValue({
      status: 'member' as any,
      nick: 'RacerNick',
    })

    const result = await backfillDiscordNicknamesAction()

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Done. Updated: 0, Skipped (no nick or already current): 1, Failed: 0.',
    })
  })

  it('skips accounts with no providerAccountId', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { providerAccountId: null, userId: 'user-1', user: { name: 'SomeName' } },
    ] as any)

    const { checkGuildMembership } = await import('@/lib/discord')

    const result = await backfillDiscordNicknamesAction()

    expect(checkGuildMembership).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Done. Updated: 0, Skipped (no nick or already current): 1, Failed: 0.',
    })
  })

  it('counts failures when checkGuildMembership throws', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { providerAccountId: 'discord-1', userId: 'user-1', user: { name: 'SomeName' } },
    ] as any)

    const { checkGuildMembership } = await import('@/lib/discord')
    vi.mocked(checkGuildMembership).mockRejectedValue(new Error('API error'))

    const result = await backfillDiscordNicknamesAction()

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Done. Updated: 0, Skipped (no nick or already current): 0, Failed: 1.',
    })
  })

  it('does not call $transaction when no users need updating', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { providerAccountId: 'discord-1', userId: 'user-1', user: { name: 'SomeName' } },
    ] as any)

    const { checkGuildMembership } = await import('@/lib/discord')
    vi.mocked(checkGuildMembership).mockResolvedValue({ status: 'member' as any, nick: null })

    const result = await backfillDiscordNicknamesAction()

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Done. Updated: 0, Skipped (no nick or already current): 1, Failed: 0.',
    })
  })

  it('handles empty account list', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([])

    const result = await backfillDiscordNicknamesAction()

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Done. Updated: 0, Skipped (no nick or already current): 0, Failed: 0.',
    })
  })
})
