import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { auth } from '@/lib/auth'
import LayoutWrapper from './components/LayoutWrapper'
import { TimeZoneProvider } from '@/components/TimeZoneProvider'
import { TIMEZONE_COOKIE_NAME, parseTimeZoneCookie } from '@/lib/timezone-utils'
import { appTitle, feedbackUrl, userGuideUrl } from '@/lib/config'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: appTitle,
  description: 'Race team planning and event management',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()])
  const initialTimeZone = parseTimeZoneCookie(cookieStore.get(TIMEZONE_COOKIE_NAME)?.value)
  const hasStaleSessionCookie =
    !session &&
    Boolean(
      cookieStore.get('authjs.session-token') ||
      cookieStore.get('__Secure-authjs.session-token') ||
      cookieStore.get('authjs.session-token.0') ||
      cookieStore.get('__Secure-authjs.session-token.0')
    )

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <TimeZoneProvider initialTimeZone={initialTimeZone}>
          <LayoutWrapper
            session={session}
            needsCookieSync={Boolean(session?.needsCookieRefresh || hasStaleSessionCookie)}
            appTitle={appTitle}
            feedbackUrl={feedbackUrl}
            userGuideUrl={userGuideUrl}
          >
            {children}
          </LayoutWrapper>
        </TimeZoneProvider>
      </body>
    </html>
  )
}
