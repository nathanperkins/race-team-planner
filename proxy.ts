import NextAuth, { type Session } from 'next-auth'
import type { NextRequest } from 'next/server'
import { authConfig } from '@/lib/auth.config'
import { getOnboardingStatus, ONBOARDING_PATHS } from '@/lib/onboarding'
import { createLogger } from '@/lib/logger'

const logger = createLogger('proxy')

// Use the base auth for middleware
const { auth } = NextAuth(authConfig)

export const handleProxy = (req: NextRequest & { auth: Session | null }) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const session = req.auth

  const isApiRoute = nextUrl.pathname.startsWith('/api')
  const isPublicRoute =
    nextUrl.pathname === '/' ||
    nextUrl.pathname === '/login' ||
    nextUrl.pathname === '/not-found' ||
    nextUrl.pathname.includes('.')

  // Early return for public/api routes
  if (isPublicRoute || isApiRoute) {
    return
  }

  if (isLoggedIn && session) {
    // Session Sanity Check: If the session exists but has NO ID, force a fresh login.
    if (!session.user?.id) {
      logger.info(`Critical: Session missing ID. Redirecting to /login`)
      const loginUrl = new URL('/login', nextUrl)
      loginUrl.searchParams.set('reason', 'stale_session')
      return Response.redirect(loginUrl)
    }

    // Onboarding Tunnel
    const status = getOnboardingStatus(session)
    const targetPath = ONBOARDING_PATHS[status]

    logger.info(`Path: ${nextUrl.pathname}, Status: ${status}, Target: ${targetPath}`)

    if (targetPath && nextUrl.pathname !== targetPath) {
      logger.info(`Onboarding tunnel: State ${status}. Forcing redirect to ${targetPath}`)
      return Response.redirect(new URL(targetPath, nextUrl))
    }
  }
}

export const proxy = auth(handleProxy)

export const config = {
  // Protect all routes except assets, api, and specific public pages
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
