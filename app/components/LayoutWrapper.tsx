'use client'

import React, { useState } from 'react'
import Sidebar from './Sidebar'
import { Session } from 'next-auth'
import { Menu, X } from 'lucide-react'
import { SessionProvider } from 'next-auth/react'
import styles from './sidebar.module.css'

interface LayoutWrapperProps {
  children: React.ReactNode
  session: Session | null
  appTitle: string
  feedbackUrl?: string
}

export default function LayoutWrapper({
  children,
  session,
  appTitle,
  feedbackUrl,
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
