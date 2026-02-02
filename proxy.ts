import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const hasCustomerId = !!req.auth?.user?.iracingCustomerId

  // If logged in but missing Customer ID, force them to the profile page
  // (unless they are already on the profile page or a public/api route)
  if (isLoggedIn && !hasCustomerId) {
    const isProfilePage = nextUrl.pathname === '/profile'
    const isApiRoute = nextUrl.pathname.startsWith('/api')
    const isPublicRoute =
      nextUrl.pathname === '/' ||
      nextUrl.pathname === '/login' ||
      nextUrl.pathname === '/not-found' ||
      nextUrl.pathname.includes('.')

    if (!isProfilePage && !isApiRoute && !isPublicRoute) {
      return Response.redirect(new URL('/profile', nextUrl))
    }
  }
})

export const config = {
  // Protect all routes except assets, api, and specific public pages
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
