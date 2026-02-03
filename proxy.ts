import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

// Use the base auth for middleware
const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const user = req.auth?.user

  const isApiRoute = nextUrl.pathname.startsWith('/api')
  const isPublicRoute =
    nextUrl.pathname === '/' ||
    nextUrl.pathname === '/login' ||
    nextUrl.pathname === '/not-found' ||
    nextUrl.pathname.includes('.')

  // Early return for public/api routes - no onboarding enforcement needed
  if (isPublicRoute || isApiRoute) {
    return
  }

  if (isLoggedIn) {
    const isProfilePage = nextUrl.pathname === '/profile'
    const isExpectationsPage = nextUrl.pathname === '/expectations'

    // 1. Session Reset
    // If the session exists but has NO ID, it's corrupt/too old to heal. Force a fresh login.
    if (!user?.id) {
      console.log(`[proxy] Critical: Session missing ID. Redirecting stale session to /login`)
      const loginUrl = new URL('/login', nextUrl)
      loginUrl.searchParams.set('reason', 'stale_session')
      return Response.redirect(loginUrl)
    }

    // 2. Sequential Onboarding Check
    const hasAcceptedExpectations =
      ((user?.expectationsVersion as number) ?? 0) >= CURRENT_EXPECTATIONS_VERSION
    const hasCustomerId = !!user?.iracingCustomerId

    // Step 1: Force expectations first
    if (!hasAcceptedExpectations && !isExpectationsPage) {
      console.log(
        `[proxy] Sequential onboarding: Expectations required. Redirecting to /expectations`
      )
      return Response.redirect(new URL('/expectations', nextUrl))
    }

    // Step 2: Once expectations accepted, force profile for Customer ID
    if (hasAcceptedExpectations && !hasCustomerId && !isProfilePage && !isExpectationsPage) {
      console.log(`[proxy] Sequential onboarding: Customer ID required. Redirecting to /profile`)
      return Response.redirect(new URL('/profile', nextUrl))
    }
  }
})

export const config = {
  // Protect all routes except assets, api, and specific public pages
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
