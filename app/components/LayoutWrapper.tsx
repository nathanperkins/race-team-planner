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
}

export default function LayoutWrapper({ children, session }: LayoutWrapperProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)

  return (
    <SessionProvider session={session}>
      <div className={styles.layoutContainer}>
        {session && (
          <>
            <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
              <div className={styles.sidebarHeader}>
                <div className={styles.title}>Race Team Planner</div>
                <button
                  className={styles.closeButton}
                  onClick={toggleSidebar}
                  aria-label="Close sidebar"
                >
                  <X size={24} />
                </button>
              </div>
              <Sidebar session={session} onLinkClick={() => setIsSidebarOpen(false)} />
            </aside>

            {/* Mobile Header */}
            <header className={styles.mobileHeader}>
              <button
                className={styles.menuButton}
                onClick={toggleSidebar}
                aria-label="Open sidebar"
              >
                <Menu size={24} />
              </button>
              <div className={styles.mobileTitle}>Race Team Planner</div>
            </header>

            {/* Overlay for mobile */}
            {isSidebarOpen && <div className={styles.overlay} onClick={toggleSidebar} />}
          </>
        )}

        <main className={`${styles.mainContent} ${session ? styles.withSidebar : ''}`}>
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
