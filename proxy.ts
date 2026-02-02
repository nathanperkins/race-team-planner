import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const hasCustomerId = !!req.auth?.user?.iracingCustomerId
  const hasAcceptedExpectations =
    (req.auth?.user?.expectationsVersion ?? 0) >= CURRENT_EXPECTATIONS_VERSION

  // If logged in but missing Customer ID or unaccepted expectations, force them to the profile page
  // (unless they are already on the profile page, expectations page, or a public/api route)
  if (isLoggedIn && (!hasCustomerId || !hasAcceptedExpectations)) {
    const isProfilePage = nextUrl.pathname === '/profile'
    const isExpectationsPage = nextUrl.pathname === '/expectations'
    const isApiRoute = nextUrl.pathname.startsWith('/api')
    const isPublicRoute =
      nextUrl.pathname === '/' ||
      nextUrl.pathname === '/login' ||
      nextUrl.pathname === '/not-found' ||
      nextUrl.pathname.includes('.')

    if (!isProfilePage && !isExpectationsPage && !isApiRoute && !isPublicRoute) {
      return Response.redirect(new URL('/profile', nextUrl))
    }
  }
})

export const config = {
  // Protect all routes except assets, api, and specific public pages
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
