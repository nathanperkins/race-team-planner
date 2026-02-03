'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './sidebar.module.css'
import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'

import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

interface SidebarProps {
  onLinkClick?: () => void
}

export default function Sidebar({ onLinkClick }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true
    if (path !== '/' && pathname.startsWith(path)) return true
    return false
  }

  if (!session?.user) return null

  const hasCustomerId = !!session.user.iracingCustomerId
  const hasAcceptedExpectations =
    (session.user.expectationsVersion ?? 0) >= CURRENT_EXPECTATIONS_VERSION
  const isSetupComplete = hasCustomerId && hasAcceptedExpectations

  return (
    <div className={styles.navWrapper}>
      <nav className={styles.nav}>
        <Link
          href="/events"
          className={`${styles.link} ${isActive('/events') ? styles.activeLink : ''} ${!isSetupComplete ? styles.disabledLink : ''}`}
          onClick={onLinkClick}
        >
          Events
        </Link>

        <Link
          href={`/users/${session.user?.id}/signups`}
          className={`${styles.link} ${isActive(`/users/${session.user?.id}`) ? styles.activeLink : ''} ${!isSetupComplete ? styles.disabledLink : ''}`}
          onClick={onLinkClick}
        >
          My Signups
        </Link>

        <Link
          href="/roster"
          className={`${styles.link} ${isActive('/roster') ? styles.activeLink : ''} ${!isSetupComplete ? styles.disabledLink : ''}`}
          onClick={onLinkClick}
        >
          Roster
        </Link>

        <Link
          href="/expectations"
          className={`${styles.link} ${isActive('/expectations') ? styles.activeLink : ''}`}
          onClick={onLinkClick}
        >
          Team Expectations
        </Link>

        <Link
          href="/profile"
          className={`${styles.link} ${isActive('/profile') ? styles.activeLink : ''} ${!hasAcceptedExpectations ? styles.disabledLink : ''}`}
          onClick={onLinkClick}
        >
          My Profile
        </Link>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name || 'User'}
                width={32}
                height={32}
                className={styles.avatar}
              />
            )}
            <span className={styles.welcome}>{session.user?.name}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/' })} className={styles.signOutButton}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
