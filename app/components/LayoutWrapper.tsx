'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import { Session } from 'next-auth'
import { Menu, X } from 'lucide-react'
import { SessionProvider } from 'next-auth/react'
import styles from './sidebar.module.css'

/**
 * Syncs server-side JWT cookie updates (after 1-hour access revalidation) or
 * clears a revoked/stale session cookie via NextAuth's Route Handler
 * (`GET /api/auth/session`), since Server Components cannot write `Set-Cookie`.
 *
 * Uses a direct fetch instead of `useSession().update()` so it takes a single
 * roundtrip and never sets SessionContext `loading = true` (which would block
 * concurrent onboarding `update()` calls).
 */
function SessionCookieSync({ needsSync, hadSession }: { needsSync: boolean; hadSession: boolean }) {
  const router = useRouter()
  const syncedRef = useRef(false)

  useEffect(() => {
    if (!needsSync) {
      syncedRef.current = false
      return
    }
    if (syncedRef.current) return
    syncedRef.current = true

    const controller = new AbortController()
    fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((data) => {
        if (hadSession && data === null) {
          router.replace('/login')
        }
      })
      .catch(() => {
        // Allow retry on next render if the request failed or was aborted
        syncedRef.current = false
      })

    return () => controller.abort()
  }, [needsSync, hadSession, router])

  return null
}

interface LayoutWrapperProps {
  children: React.ReactNode
  session: Session | null
  needsCookieSync?: boolean
  appTitle: string
  feedbackUrl?: string
  userGuideUrl?: string
}

export default function LayoutWrapper({
  children,
  session,
  needsCookieSync,
  appTitle,
  feedbackUrl,
  userGuideUrl,
}: LayoutWrapperProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)

  // Prevent background scrolling when mobile sidebar is open
  React.useEffect(() => {
    if (isSidebarOpen) {
      document.body.classList.add('sidebar-open')
    } else {
      document.body.classList.remove('sidebar-open')
    }
    return () => {
      document.body.classList.remove('sidebar-open')
    }
  }, [isSidebarOpen])

  return (
    <SessionProvider session={session}>
      <SessionCookieSync
        needsSync={Boolean(needsCookieSync ?? session?.needsCookieRefresh)}
        hadSession={Boolean(session)}
      />
      <div className={styles.layoutContainer}>
        {session && (
          <>
            <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
              <div className={styles.sidebarHeader}>
                <div className={styles.title}>{appTitle}</div>
                <button
                  className={styles.closeButton}
                  onClick={toggleSidebar}
                  aria-label="Close sidebar"
                >
                  <X size={24} />
                </button>
              </div>
              <Sidebar
                onLinkClick={() => setIsSidebarOpen(false)}
                session={session}
                feedbackUrl={feedbackUrl}
                userGuideUrl={userGuideUrl}
              />
            </aside>

            {/* Mobile Header */}
            <header
              className={`${styles.mobileHeader} ${isSidebarOpen ? styles.bgBlocked : ''}`}
              aria-hidden={isSidebarOpen}
            >
              <button
                className={styles.menuButton}
                onClick={toggleSidebar}
                aria-label="Open sidebar"
              >
                <Menu size={24} />
              </button>
              <div className={styles.mobileTitle}>{appTitle}</div>
            </header>

            {/* Overlay for mobile */}
            {isSidebarOpen && <div className={styles.overlay} onClick={toggleSidebar} />}
          </>
        )}

        <main
          className={`${styles.mainContent} ${session ? styles.withSidebar : ''} ${isSidebarOpen ? styles.bgBlocked : ''}`}
          aria-hidden={isSidebarOpen}
        >
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
