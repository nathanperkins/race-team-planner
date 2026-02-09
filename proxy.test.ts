import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleProxy } from './proxy'
import { getOnboardingStatus, OnboardingStatus } from '@/lib/onboarding'

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    auth: vi.fn((handler) => handler),
  })),
}))

vi.mock('@/lib/onboarding', () => ({
  getOnboardingStatus: vi.fn(),
  OnboardingStatus: {
    NOT_LOGGED_IN: 'NOT_LOGGED_IN',
    NO_EXPECTATIONS: 'NO_EXPECTATIONS',
    NO_CUSTOMER_ID: 'NO_CUSTOMER_ID',
    COMPLETE: 'COMPLETE',
  },
  ONBOARDING_PATHS: {
    NOT_LOGGED_IN: '/login',
    NO_EXPECTATIONS: '/expectations',
    NO_CUSTOMER_ID: '/profile',
    COMPLETE: null,
  },
}))

describe('proxy', () => {
  const mockRedirect = vi.fn((url: string | URL) => `redirect to ${url}`)

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock global Response.redirect
    vi.stubGlobal('Response', {
      redirect: mockRedirect,
    })
  })

  it('returns nothing for public routes', () => {
    const req = {
      nextUrl: { pathname: '/login' },
      auth: null,
    } as any
    const result = handleProxy(req)
    expect(result).toBeUndefined()
  })

  it('returns nothing for API routes', () => {
    const req = {
      nextUrl: { pathname: '/api/something' },
      auth: null,
    } as any
    const result = handleProxy(req)
    expect(result).toBeUndefined()
  })

  it('redirects to /login if session exists but missing user.id', () => {
    const req = {
      nextUrl: new URL('http://localhost/dashboard'),
      auth: { user: { name: 'Alice' } }, // Missing id
    } as any
    const result = handleProxy(req)
    expect(mockRedirect).toHaveBeenCalled()
    expect(mockRedirect.mock.calls[0][0].toString()).toContain('/login?reason=stale_session')
  })

  it('redirects if onboarding is incomplete', () => {
    const req = {
      nextUrl: new URL('http://localhost/dashboard'),
      auth: { user: { id: '123' } },
    } as any
    vi.mocked(getOnboardingStatus).mockReturnValue(OnboardingStatus.NO_EXPECTATIONS)

    handleProxy(req)
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/expectations' })
    )
  })

  it('does not redirect if already at target onboarding path', () => {
    const req = {
      nextUrl: new URL('http://localhost/expectations'),
      auth: { user: { id: '123' } },
    } as any
    vi.mocked(getOnboardingStatus).mockReturnValue(OnboardingStatus.NO_EXPECTATIONS)

    const result = handleProxy(req)
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('returns nothing if onboarding is complete', () => {
    const req = {
      nextUrl: new URL('http://localhost/dashboard'),
      auth: { user: { id: '123' } },
    } as any
    vi.mocked(getOnboardingStatus).mockReturnValue(OnboardingStatus.COMPLETE)

    const result = handleProxy(req)
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })
})
