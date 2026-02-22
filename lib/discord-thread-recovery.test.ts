import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEventDiscussionThread,
  createOrUpdateTeamThread,
  createOrUpdateEventThread,
} from './discord'

describe('discord thread recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('DISCORD_BOT_TOKEN', 'fake-bot-token')
    vi.stubEnv('DISCORD_NOTIFICATIONS_CHANNEL_ID', 'fake-channel-id')
    vi.stubEnv('DISCORD_EVENTS_FORUM_ID', '')
    vi.stubEnv('DISCORD_GUILD_ID', '')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reuses an existing team thread when it still exists', async () => {
    vi.mocked(fetch)
      // Get existing thread parent info
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ parent_id: 'fake-channel-id' }),
      } as Response)
      // Get bot user ID for extracting Created By
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages for extracting Created By
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      // Get bot user ID for upsertThreadMessage
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // Get messages for upsertThreadMessage
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      // Post new message (no existing message found)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

    const threadId = await createOrUpdateTeamThread({
      teamName: 'Team One',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-11T20:00:00Z'),
      existingThreadId: 'thread-123',
    })

    expect(threadId).toBe('thread-123')
    expect(fetch).toHaveBeenCalledTimes(6)
  })

  it('creates a replacement team thread when linked thread is missing', async () => {
    vi.mocked(fetch)
      // Existing thread is missing
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
      // Create new thread
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'new-thread-456' }),
      } as Response)

    const threadId = await createOrUpdateTeamThread({
      teamName: 'Team One',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2026-02-11T20:00:00Z'),
      existingThreadId: 'missing-thread-123',
    })

    expect(threadId).toBe('new-thread-456')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/channels/fake-channel-id/threads'),
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('creates a replacement event discussion thread when linked thread is missing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'new-event-thread-id' }),
      } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'http://localhost:3000/events/event-1',
      carClasses: ['GT3'],
      timeslots: [{ raceStartTime: new Date('2026-02-11T20:00:00Z'), teams: [] }],
      threadId: 'missing-event-thread-id',
    })

    expect(result).toEqual({ ok: true, threadId: 'new-event-thread-id' })
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/channels/fake-channel-id/threads'),
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('reuses existing event discussion thread when it still exists', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ parent_id: 'fake-channel-id' }),
    } as Response)

    const threadId = await createEventDiscussionThread({
      eventName: 'GT3 Challenge',
      eventStartTime: new Date('2026-02-11T20:00:00Z'),
      existingThreadId: 'shared-thread-123',
    })

    expect(threadId).toBe('shared-thread-123')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/shared-thread-123'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bot fake-bot-token',
        }),
      })
    )
  })

  it('edits existing teams-assigned message instead of posting a new reply', async () => {
    vi.mocked(fetch)
      // get existing thread parent info
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ parent_id: 'fake-channel-id' }),
      } as Response)
      // get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // list recent messages in thread
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'msg-1',
            author: { id: 'bot-user-123', bot: true },
            embeds: [{ title: '🏁 Teams Assigned' }],
          },
        ],
      } as Response)
      // edit existing message
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'http://localhost:3000/events/event-1',
      carClasses: ['GT3'],
      threadId: 'event-thread-id',
      timeslots: [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [
            {
              name: 'Team One',
              members: [{ name: 'Alice', carClass: 'GT3' }],
            },
          ],
        },
      ],
      mentionRegistrationIds: [],
    })

    expect(result).toEqual({ ok: true, threadId: 'event-thread-id' })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/event-thread-id/messages/msg-1'),
      expect.objectContaining({
        method: 'PATCH',
      })
    )
  })

  it('posts a new teams-assigned message when no existing message is found', async () => {
    vi.mocked(fetch)
      // get existing thread parent info
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ parent_id: 'fake-channel-id' }),
      } as Response)
      // get bot user ID
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bot-user-123' }),
      } as Response)
      // list recent messages
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response)
      // create new post
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)

    const result = await createOrUpdateEventThread({
      eventName: 'GT3 Challenge',
      raceUrl: 'http://localhost:3000/events/event-1',
      carClasses: ['GT3'],
      threadId: 'event-thread-id',
      timeslots: [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [
            {
              name: 'Team One',
              members: [{ name: 'Alice', carClass: 'GT3' }],
            },
          ],
        },
      ],
      mentionRegistrationIds: [],
    })

    expect(result).toEqual({ ok: true, threadId: 'event-thread-id' })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/event-thread-id/messages'),
      expect.objectContaining({
        method: 'POST',
      })
    )
  })
})
