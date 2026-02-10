import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { auth } from '@/lib/auth'
import LayoutWrapper from './components/LayoutWrapper'
import { appTitle, feedbackUrl } from '@/lib/config'

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
  const session = await auth()

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <LayoutWrapper session={session} appTitle={appTitle} feedbackUrl={feedbackUrl}>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
