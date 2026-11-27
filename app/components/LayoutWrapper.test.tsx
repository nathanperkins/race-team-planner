import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import LayoutWrapper from './LayoutWrapper'
import { UserRole } from '@prisma/client'
import type { Session } from 'next-auth'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

const baseSession: Session = {
  user: {
    id: 'user-1',
    name: 'DriverOne',
    email: 'driver@example.com',
    role: UserRole.USER,
    iracingCustomerId: 12345,
    expectationsVersion: 1,
  },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
  version: 1,
}

describe('LayoutWrapper SessionCookieSync', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => baseSession,
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('does not fetch /api/auth/session when needsCookieSync is false', () => {
    render(
      <LayoutWrapper session={baseSession} needsCookieSync={false} appTitle="Test App">
        <div>content</div>
      </LayoutWrapper>
    )

    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches /api/auth/session once to persist refreshed cookie when needsCookieSync is true', async () => {
    const { rerender } = render(
      <LayoutWrapper
        session={{ ...baseSession, needsCookieRefresh: true }}
        needsCookieSync={true}
        appTitle="Test App"
      >
        <div>content</div>
      </LayoutWrapper>
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
      })
    )
    expect(mockReplace).not.toHaveBeenCalled()

    // Re-rendering with needsCookieSync still true should not fire again
    rerender(
      <LayoutWrapper
        session={{ ...baseSession, needsCookieRefresh: true }}
        needsCookieSync={true}
        appTitle="Test App"
      >
        <div>content</div>
      </LayoutWrapper>
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches /api/auth/session to clear a stale cookie when session is null and needsCookieSync is true', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    } as Response)

    render(
      <LayoutWrapper session={null} needsCookieSync={true} appTitle="Test App">
        <div>login</div>
      </LayoutWrapper>
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    // Already unauthenticated (e.g., on /login), so no extra redirect needed
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects to /login if an active session is revoked during cookie sync', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    } as Response)

    render(
      <LayoutWrapper
        session={{ ...baseSession, needsCookieRefresh: true }}
        needsCookieSync={true}
        appTitle="Test App"
      >
        <div>content</div>
      </LayoutWrapper>
    )

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })
})
