import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

// Use the base auth for middleware
const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const user = req.auth?.user

  if (isLoggedIn) {
    const isProfilePage = nextUrl.pathname === '/profile'
    const isExpectationsPage = nextUrl.pathname === '/expectations'
    const isApiRoute = nextUrl.pathname.startsWith('/api')
    const isPublicRoute =
      nextUrl.pathname === '/' ||
      nextUrl.pathname === '/login' ||
      nextUrl.pathname === '/not-found' ||
      nextUrl.pathname.includes('.')

    // Logging to help troubleshoot session content at the edge
    // console.log(`[proxy] Request: ${nextUrl.pathname}, UserID: ${user?.id}, CustID: ${user?.iracingCustomerId}, Exp: ${user?.expectationsVersion}`)

    // 1. Session Reset
    // If the session exists but has NO ID, it's corrupt/too old to heal. Force a fresh login.
    if (!user?.id && !isPublicRoute && !isApiRoute) {
      console.log(`[proxy] Critical: Session missing ID. Redirecting stale session to /login`)
      const loginUrl = new URL('/login', nextUrl)
      loginUrl.searchParams.set('reason', 'stale_session')
      return Response.redirect(loginUrl)
    }

    // 2. Onboarding Check
    // Redirect if they are missing their Customer ID OR haven't accepted current expectations
    const hasCustomerId = !!user?.iracingCustomerId
    const hasAcceptedExpectations =
      ((user?.expectationsVersion as number) ?? 0) >= CURRENT_EXPECTATIONS_VERSION
    const needsOnboarding = !hasCustomerId || !hasAcceptedExpectations
    const allowedWithoutOnboarding =
      isProfilePage || isExpectationsPage || isApiRoute || isPublicRoute

    if (needsOnboarding && !allowedWithoutOnboarding) {
      console.log(
        `[proxy] Onboarding required (ID: ${hasCustomerId}, Exp: ${hasAcceptedExpectations}). Redirecting to /profile`
      )
      return Response.redirect(new URL('/profile', nextUrl))
    }
  }
})

export const config = {
  // Protect all routes except assets, api, and specific public pages
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
