import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { getOnboardingStatus, ONBOARDING_PATHS } from '@/lib/onboarding'

// Use the base auth for middleware
const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
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
      console.log(`[proxy] Critical: Session missing ID. Redirecting to /login`)
      const loginUrl = new URL('/login', nextUrl)
      loginUrl.searchParams.set('reason', 'stale_session')
      return Response.redirect(loginUrl)
    }

    // Onboarding Tunnel
    const status = getOnboardingStatus(session)
    const targetPath = ONBOARDING_PATHS[status]

    console.log(`[proxy] Path: ${nextUrl.pathname}, Status: ${status}, Target: ${targetPath}`)

    if (targetPath && nextUrl.pathname !== targetPath) {
      console.log(`[proxy] Onboarding tunnel: State ${status}. Forcing redirect to ${targetPath}`)
      return Response.redirect(new URL(targetPath, nextUrl))
    }
  }
})

export const config = {
  // Protect all routes except assets, api, and specific public pages
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
